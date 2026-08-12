import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './utils/default_rules.js';
import { classifyTab } from './utils/classifier.js';

// Initialize extension storage on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.sync.get(['categories', 'settings']);
  if (!data.categories) {
    await chrome.storage.sync.set({ categories: DEFAULT_CATEGORIES });
  }
  if (!data.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
  console.log("Smart Tab Grouper 1.1.0 initialized.");
});

// Helper: Get config
async function getStorageConfig() {
  const data = await chrome.storage.sync.get(['categories', 'settings']);
  return {
    categories: data.categories || DEFAULT_CATEGORIES,
    settings: data.settings || DEFAULT_SETTINGS
  };
}

// Take snapshot of current tab group layout for UNDO capability
async function saveUndoSnapshot(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const snapshot = tabs.map(t => ({
    tabId: t.id,
    groupId: t.groupId
  }));
  await chrome.storage.local.set({ lastUndoSnapshot: snapshot, undoWindowId: windowId });
}

// Restore tab groups from last snapshot
async function restoreUndoSnapshot() {
  const data = await chrome.storage.local.get(['lastUndoSnapshot', 'undoWindowId']);
  const snapshot = data.lastUndoSnapshot;
  if (!snapshot || !Array.isArray(snapshot)) {
    return { success: false, message: "元に戻す履歴がありません。" };
  }

  // Ungroup all first, then restore
  const currentTabs = await chrome.tabs.query({ windowId: data.undoWindowId || undefined });
  const currentTabMap = new Map(currentTabs.map(t => [t.id, t]));

  for (const item of snapshot) {
    if (currentTabMap.has(item.tabId)) {
      if (item.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
        try {
          await chrome.tabs.ungroup(item.tabId);
        } catch (e) {}
      } else {
        try {
          await chrome.tabs.group({ tabIds: [item.tabId], groupId: item.groupId });
        } catch (e) {}
      }
    }
  }

  // Clear snapshot after undo
  await chrome.storage.local.remove(['lastUndoSnapshot', 'undoWindowId']);
  return { success: true, count: snapshot.length };
}

// Dry-Run Simulation Mode: Returns calculated preview without modifying tabs
async function simulateOrganizeTabs(windowId = null) {
  const { categories, settings } = await getStorageConfig();
  const queryObj = windowId ? { windowId } : { currentWindow: true };
  const tabs = await chrome.tabs.query(queryObj);

  const previewGroups = new Map(); // catId -> { category, tabTitles: [], tabIds: [] }

  for (const tab of tabs) {
    if (tab.pinned && !settings.groupPinnedTabs) continue;

    const matchedCat = classifyTab(tab, categories, settings);
    if (!matchedCat) continue;

    if (!previewGroups.has(matchedCat.id)) {
      previewGroups.set(matchedCat.id, {
        category: matchedCat,
        tabs: []
      });
    }
    previewGroups.get(matchedCat.id).tabs.push({
      id: tab.id,
      title: tab.title || tab.url,
      url: tab.url
    });
  }

  const result = [];
  for (const item of previewGroups.values()) {
    result.push({
      name: item.category.name,
      color: item.category.color || 'grey',
      count: item.tabs.length,
      tabs: item.tabs
    });
  }

  return { success: true, isPreview: true, previewGroups: result };
}

// Main Tab Grouping Logic
async function organizeTabs(windowId = null) {
  const { categories, settings } = await getStorageConfig();

  // If in Preview Mode, do dry-run
  if (settings.previewMode) {
    return await simulateOrganizeTabs(windowId);
  }

  const targetWindowId = windowId || (await chrome.windows.getCurrent()).id;

  // Save state for UNDO before modifying
  await saveUndoSnapshot(targetWindowId);

  const tabs = await chrome.tabs.query({ windowId: targetWindowId });

  const categoryMap = new Map();

  for (const tab of tabs) {
    if (tab.pinned && !settings.groupPinnedTabs) continue;

    const matchedCat = classifyTab(tab, categories, settings);
    if (!matchedCat) continue;

    if (!categoryMap.has(matchedCat.id)) {
      categoryMap.set(matchedCat.id, {
        category: matchedCat,
        tabIds: []
      });
    }
    categoryMap.get(matchedCat.id).tabIds.push(tab.id);
  }

  const existingGroups = await chrome.tabGroups.query({ windowId: targetWindowId });
  const existingGroupTitleMap = new Map();
  for (const grp of existingGroups) {
    existingGroupTitleMap.set(grp.title, grp.id);
  }

  for (const [catId, item] of categoryMap.entries()) {
    const { category, tabIds } = item;
    if (!tabIds || tabIds.length === 0) continue;

    let groupId = existingGroupTitleMap.get(category.name);

    try {
      if (groupId) {
        await chrome.tabs.group({ tabIds, groupId });
      } else {
        groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId: targetWindowId } });
        await chrome.tabGroups.update(groupId, {
          title: category.name,
          color: category.color || "grey"
        });
        existingGroupTitleMap.set(category.name, groupId);
      }
    } catch (e) {
      console.error(`Error grouping tabs for ${category.name}:`, e);
    }
  }

  if (settings.collapseInactiveGroups) {
    const activeTabs = await chrome.tabs.query({ active: true, windowId: targetWindowId });
    const activeGroupId = activeTabs[0] ? activeTabs[0].groupId : -1;
    const currentGroups = await chrome.tabGroups.query({ windowId: targetWindowId });
    for (const g of currentGroups) {
      if (g.id !== activeGroupId) {
        await chrome.tabGroups.update(g.id, { collapsed: true });
      }
    }
  }

  return { success: true, count: tabs.length };
}

// Ungroup all
async function ungroupAll(windowId = null) {
  const targetWindowId = windowId || (await chrome.windows.getCurrent()).id;
  await saveUndoSnapshot(targetWindowId);

  const tabs = await chrome.tabs.query({ windowId: targetWindowId });
  const groupedTabIds = tabs.filter(t => t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE).map(t => t.id);
  
  if (groupedTabIds.length > 0) {
    await chrome.tabs.ungroup(groupedTabIds);
  }
  return { success: true, ungroupedCount: groupedTabIds.length };
}

// Close duplicate tabs
async function closeDuplicateTabs(windowId = null) {
  const targetWindowId = windowId || (await chrome.windows.getCurrent()).id;
  const tabs = await chrome.tabs.query({ windowId: targetWindowId });
  const seenUrls = new Set();
  const duplicateTabIds = [];

  for (const tab of tabs) {
    if (!tab.url) continue;
    if (seenUrls.has(tab.url)) {
      duplicateTabIds.push(tab.id);
    } else {
      seenUrls.add(tab.url);
    }
  }

  if (duplicateTabIds.length > 0) {
    await chrome.tabs.remove(duplicateTabIds);
  }
  return { success: true, removedCount: duplicateTabIds.length };
}

// Add domain to exclusion list
async function addExclusion(domainOrUrl) {
  const { settings } = await getStorageConfig();
  const exclusions = settings.exclusions || [];
  if (!exclusions.includes(domainOrUrl)) {
    exclusions.push(domainOrUrl);
    settings.exclusions = exclusions;
    await chrome.storage.sync.set({ settings });
  }
  return { success: true, exclusions };
}

// Real-time tab update listener
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const { settings, categories } = await getStorageConfig();
    if (!settings.autoGroupOnUpdate || settings.previewMode) return;
    if (tab.pinned && !settings.groupPinnedTabs) return;

    const matchedCat = classifyTab(tab, categories, settings);
    if (matchedCat) {
      const existingGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
      let existingGroup = existingGroups.find(g => g.title === matchedCat.name);
      
      try {
        if (existingGroup) {
          await chrome.tabs.group({ tabIds: [tabId], groupId: existingGroup.id });
        } else {
          const groupId = await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId: tab.windowId } });
          await chrome.tabGroups.update(groupId, {
            title: matchedCat.name,
            color: matchedCat.color || "grey"
          });
        }
      } catch (e) {
        console.error("Auto group error:", e);
      }
    }
  }
});

// Message listener for popup & options communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ORGANIZE_CURRENT_WINDOW") {
    organizeTabs().then(res => sendResponse(res));
    return true;
  }
  if (message.action === "SIMULATE_ORGANIZE") {
    simulateOrganizeTabs().then(res => sendResponse(res));
    return true;
  }
  if (message.action === "UNDO_LAST_ACTION") {
    restoreUndoSnapshot().then(res => sendResponse(res));
    return true;
  }
  if (message.action === "ADD_EXCLUSION") {
    addExclusion(message.domain).then(res => sendResponse(res));
    return true;
  }
  if (message.action === "UNGROUP_ALL") {
    ungroupAll().then(res => sendResponse(res));
    return true;
  }
  if (message.action === "CLOSE_DUPLICATES") {
    closeDuplicateTabs().then(res => sendResponse(res));
    return true;
  }
  if (message.action === "RESET_TO_DEFAULT") {
    chrome.storage.sync.set({ categories: DEFAULT_CATEGORIES, settings: DEFAULT_SETTINGS }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './utils/default_rules.js';
import { classifyTab } from './utils/classifier.js';
import {
  createContentAssistedClassifier,
  hasContentClassificationAccess,
  prepareContentClassifications
} from './utils/content_classifier.js';
import {
  buildSafeOrganizationPlan,
  isEligibleForSafeOrganize,
  organizeTabsSafely
} from './utils/safe_organizer.js';
import {
  acquireOperationLease,
  appendOperationProgress,
  clearUndoForWindow,
  completeUndoRecord,
  getActiveOperation,
  getUndoRecord,
  getUndoState,
  prepareOperationJournal,
  recoverStaleOperation,
  releaseOperationLease,
  rollbackCompletedOperation,
  undoLastOperation
} from './utils/undo_manager.js';
import { correctTabClassification } from './utils/correction.js';
import {
  prepareGroupReorganization,
  reorganizeGroupSafely
} from './utils/group_reorganizer.js';
import { editGroupSafely } from './utils/group_editor.js';

let organizeInFlight = false;

// Initialize extension storage on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.sync.get(['categories', 'settings']);
  if (!data.categories) {
    await chrome.storage.sync.set({ categories: DEFAULT_CATEGORIES });
  }
  const settings = normalizeSettings(data.settings);
  if (JSON.stringify(settings) !== JSON.stringify(data.settings || {})) {
    await chrome.storage.sync.set({ settings });
  }
  console.log("Smart Tab Grouper 1.0.0 initialized.");
});

function normalizeSettings(value = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    groupByDomainAsFallback: false,
    contentClassificationEnabled: value.contentClassificationEnabled === true,
    groupUnmatchedAsOthers: value.groupUnmatchedAsOthers === true
  };
}

// Helper: Get config
async function getStorageConfig() {
  const data = await chrome.storage.sync.get(['categories', 'settings']);
  return {
    categories: data.categories || DEFAULT_CATEGORIES,
    settings: normalizeSettings(data.settings)
  };
}

// Dry-Run Simulation Mode: Returns calculated preview without modifying tabs
async function simulateOrganizeTabs(windowId = null) {
  const { categories, settings } = await getStorageConfig();
  const queryObj = Number.isInteger(windowId) ? { windowId } : { currentWindow: true };
  const tabs = await chrome.tabs.query(queryObj);
  const tabById = new Map(tabs.map((tab) => [tab.id, tab]));
  const content = await prepareContentClassifications({
    chromeApi: chrome,
    tabs,
    categories,
    settings
  });
  const classify = createContentAssistedClassifier(content.classifications, settings);
  const plan = buildSafeOrganizationPlan(tabs, categories, settings, {
    noneGroupId: chrome.tabGroups.TAB_GROUP_ID_NONE,
    classify
  });

  const previewGroups = plan.items.map((item) => ({
    name: item.category.name,
    color: item.category.color,
    count: item.tabIds.length,
    tabs: item.tabIds.map((tabId) => {
      const tab = tabById.get(tabId);
      return {
        id: tabId,
        title: tab?.title || tab?.url,
        url: tab?.url
      };
    })
  }));

  return {
    success: true,
    isPreview: true,
    previewGroups,
    skipped: plan.skipped,
    contentClassification: summarizeContentClassification(content)
  };
}

// Main Tab Grouping Logic
async function organizeTabs(windowId = null, { respectPreviewMode = true } = {}) {
  const { categories, settings } = await getStorageConfig();

  // If in Preview Mode, do dry-run
  if (respectPreviewMode && settings.previewMode) {
    return await simulateOrganizeTabs(windowId);
  }

  const targetWindowId = Number.isInteger(windowId) ? windowId : (await chrome.windows.getCurrent()).id;
  if (organizeInFlight) {
    return { success: false, message: 'すでに整理しています。' };
  }

  organizeInFlight = true;
  let operationId = null;
  let completedUndoData = null;
  try {
    await recoverStaleOperation(chrome);
    const lease = await acquireOperationLease(chrome, {
      windowId: targetWindowId,
      type: 'organize'
    });
    if (!lease.acquired) {
      return { success: false, message: 'すでに整理しています。' };
    }
    operationId = lease.operation.operationId;

    const tabs = await chrome.tabs.query({ windowId: targetWindowId });
    const content = await prepareContentClassifications({
      chromeApi: chrome,
      tabs,
      categories,
      settings
    });
    const result = await organizeTabsSafely({
      chromeApi: chrome,
      windowId: targetWindowId,
      categories,
      settings,
      classify: createContentAssistedClassifier(content.classifications, settings),
      operationHooks: {
        onPrepared: (prepared) => prepareOperationJournal(
          chrome,
          operationId,
          prepared
        ),
        onBeforeMutation: (progress) => appendOperationProgress(
          chrome,
          operationId,
          progress
        ),
        onProgress: (progress) => appendOperationProgress(
          chrome,
          operationId,
          progress
        )
      }
    });
    const { undoData, ...publicResult } = result;
    completedUndoData = undoData;
    const undo = await completeUndoRecord(chrome, { operationId, undoData });
    operationId = null;
    return {
      ...publicResult,
      contentClassification: summarizeContentClassification(content),
      undo
    };
  } catch (error) {
    if (operationId && completedUndoData?.summary?.count > 0) {
      const committed = await getUndoRecord(chrome, completedUndoData.windowId)
        .then((record) => record?.operationId === operationId)
        .catch(() => false);
      if (!committed) {
        await rollbackCompletedOperation(chrome, completedUndoData).catch((rollbackError) => {
          console.error('Undo record failure rollback failed:', rollbackError);
        });
      }
    }
    if (operationId) await releaseOperationLease(chrome, operationId).catch(() => {});
    throw error;
  } finally {
    organizeInFlight = false;
  }
}

function summarizeContentClassification(result) {
  return {
    status: result.status,
    unresolved: result.unresolved,
    attempted: result.attempted,
    matched: result.classifications.size,
    cacheHits: result.cacheHits
  };
}

chrome.windows.onRemoved.addListener((windowId) => {
  // Undo is session/window scoped. Persistent ownership fingerprints stay in
  // local storage so restored Chrome groups can be recognized after restart.
  clearUndoForWindow(chrome, windowId)
    .catch((error) => console.warn('Window state cleanup failed:', error));
});

async function getPopupState(windowId = null) {
  const targetWindowId = Number.isInteger(windowId) ? windowId : (await chrome.windows.getCurrent()).id;
  const recovery = await recoverStaleOperation(chrome);
  const [{ categories, settings }, tabs, undo, activeOperation, contentAccessGranted] = await Promise.all([
    getStorageConfig(),
    chrome.tabs.query({ windowId: targetWindowId }),
    getUndoState(chrome, targetWindowId),
    getActiveOperation(chrome),
    hasContentClassificationAccess(chrome)
  ]);
  const noneGroupId = chrome.tabGroups.TAB_GROUP_ID_NONE;
  const cheapSettings = { ...settings, groupUnmatchedAsOthers: settings.groupUnmatchedAsOthers === true };
  const plan = buildSafeOrganizationPlan(tabs, categories, cheapSettings, { noneGroupId });
  const targetTabIds = plan.items.flatMap((item) => item.tabIds);
  const count = plan.items.reduce((sum, item) => sum + item.tabIds.length, 0);
  const eligibleCount = tabs.filter((tab) => isEligibleForSafeOrganize(tab, noneGroupId)).length;
  const unresolvedTabIds = tabs.filter((tab) =>
    isEligibleForSafeOrganize(tab, noneGroupId)
    && classifyTab(tab, categories, { ...settings, groupUnmatchedAsOthers: false }) === null
  ).map((tab) => tab.id);
  const unresolved = unresolvedTabIds.length;
  const contentClassificationEnabled = settings.contentClassificationEnabled === true;
  const contentClassificationAvailable = contentClassificationEnabled && contentAccessGranted;

  return {
    success: true,
    windowId: targetWindowId,
    undo,
    inProgress: Boolean(
      activeOperation
      && activeOperation.windowId === targetWindowId
      && Number(activeOperation.leaseExpiresAt) > Date.now()
    ),
    recovery: recovery.recovered && recovery.windowId === targetWindowId ? recovery : null,
    preview: {
      count,
      groupCount: plan.items.length,
      targetTabIds,
      eligibleCount,
      unresolvedTabIds,
      unresolved,
      contentClassificationEnabled,
      contentClassificationAvailable,
      contentLimitExceeded: contentClassificationAvailable && unresolved > 30
    },
    categories: categories
      .filter((category) => category.enabled !== false)
      .map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color || 'grey'
      }))
  };
}

async function undoCurrentWindow(windowId = null) {
  const targetWindowId = Number.isInteger(windowId) ? windowId : (await chrome.windows.getCurrent()).id;
  if (organizeInFlight) return { success: false, message: '別の操作を実行しています。' };

  organizeInFlight = true;
  let operationId = null;
  try {
    await recoverStaleOperation(chrome);
    const lease = await acquireOperationLease(chrome, {
      windowId: targetWindowId,
      type: 'undo'
    });
    if (!lease.acquired) return { success: false, message: '別の操作を実行しています。' };
    operationId = lease.operation.operationId;
    const result = await undoLastOperation(chrome, targetWindowId);
    await releaseOperationLease(chrome, operationId);
    operationId = null;
    return result;
  } finally {
    if (operationId) await releaseOperationLease(chrome, operationId).catch(() => {});
    organizeInFlight = false;
  }
}

async function correctCurrentClassification(message) {
  const targetWindowId = Number.isInteger(message.windowId)
    ? message.windowId
    : (await chrome.windows.getCurrent()).id;
  if (organizeInFlight) return { success: false, message: '別の操作を実行しています。' };

  organizeInFlight = true;
  let leaseOperationId = null;
  try {
    await recoverStaleOperation(chrome);
    const lease = await acquireOperationLease(chrome, {
      windowId: targetWindowId,
      type: 'correction'
    });
    if (!lease.acquired) return { success: false, message: '別の操作を実行しています。' };
    leaseOperationId = lease.operation.operationId;
    const { categories } = await getStorageConfig();
    const result = await correctTabClassification({
      chromeApi: chrome,
      windowId: targetWindowId,
      operationId: message.operationId,
      tabId: message.tabId,
      targetCategoryId: message.targetCategoryId,
      categories
    });
    await releaseOperationLease(chrome, leaseOperationId);
    leaseOperationId = null;
    return result;
  } finally {
    if (leaseOperationId) await releaseOperationLease(chrome, leaseOperationId).catch(() => {});
    organizeInFlight = false;
  }
}

async function previewSelectedGroupReorganization(message) {
  const targetWindowId = Number.isInteger(message.windowId)
    ? message.windowId
    : (await chrome.windows.getCurrent()).id;
  if (!Number.isInteger(message.groupId)) {
    return { success: false, message: '再構成するグループを確認できませんでした。' };
  }
  if (organizeInFlight) return { success: false, message: '別の操作を実行しています。' };

  await recoverStaleOperation(chrome);
  const activeOperation = await getActiveOperation(chrome);
  if (
    activeOperation
    && Number(activeOperation.leaseExpiresAt) > Date.now()
  ) return { success: false, message: '別の操作を実行しています。' };

  const { categories, settings } = await getStorageConfig();
  const { classify, content } = await createGroupContentClassifier({
    windowId: targetWindowId,
    groupId: message.groupId,
    categories,
    settings
  });
  const plan = await prepareGroupReorganization({
    chromeApi: chrome,
    windowId: targetWindowId,
    sourceGroupId: message.groupId,
    categories,
    settings,
    classify
  });

  return {
    success: true,
    windowId: targetWindowId,
    groupId: plan.sourceGroup.id,
    title: plan.sourceGroup.title || '名称なし',
    color: plan.sourceGroup.color,
    totalCount: plan.totalCount,
    retainedCount: plan.retainedCount,
    movedCount: plan.movedCount,
    targetGroupCount: plan.targetGroupCount,
    newGroupCount: plan.newGroupCount,
    blockedCount: plan.blockedCount,
    targets: plan.items.map((item) => ({
      categoryId: item.category.id,
      name: item.category.name,
      color: item.category.color,
      count: item.tabIds.length,
      reusesManagedGroup: Number.isInteger(item.targetGroupId)
    })),
    fingerprint: plan.fingerprint,
    contentClassification: summarizeContentClassification(content)
  };
}

async function reorganizeSelectedGroup(message) {
  const targetWindowId = Number.isInteger(message.windowId)
    ? message.windowId
    : (await chrome.windows.getCurrent()).id;
  if (!Number.isInteger(message.groupId) || !message.expectedFingerprint) {
    return { success: false, message: '再構成の確認情報がありません。もう一度確認してください。' };
  }
  if (organizeInFlight) return { success: false, message: '別の操作を実行しています。' };

  organizeInFlight = true;
  let operationId = null;
  let completedUndoData = null;
  try {
    await recoverStaleOperation(chrome);
    const lease = await acquireOperationLease(chrome, {
      windowId: targetWindowId,
      type: 'reorganize-group'
    });
    if (!lease.acquired) return { success: false, message: '別の操作を実行しています。' };
    operationId = lease.operation.operationId;

    const { categories, settings } = await getStorageConfig();
    const { classify, content } = await createGroupContentClassifier({
      windowId: targetWindowId,
      groupId: message.groupId,
      categories,
      settings
    });
    const result = await reorganizeGroupSafely({
      chromeApi: chrome,
      windowId: targetWindowId,
      sourceGroupId: message.groupId,
      expectedFingerprint: message.expectedFingerprint,
      categories,
      settings,
      classify,
      operationHooks: {
        onPrepared: (prepared) => prepareOperationJournal(chrome, operationId, prepared),
        onBeforeMutation: (progress) => appendOperationProgress(chrome, operationId, progress),
        onProgress: (progress) => appendOperationProgress(chrome, operationId, progress)
      }
    });
    const { undoData, ...publicResult } = result;
    completedUndoData = undoData;
    const undo = await completeUndoRecord(chrome, { operationId, undoData });
    operationId = null;
    return {
      ...publicResult,
      contentClassification: summarizeContentClassification(content),
      undo
    };
  } catch (error) {
    if (operationId && completedUndoData?.summary?.count > 0) {
      const committed = await getUndoRecord(chrome, completedUndoData.windowId)
        .then((record) => record?.operationId === operationId)
        .catch(() => false);
      if (!committed) {
        await rollbackCompletedOperation(chrome, completedUndoData).catch((rollbackError) => {
          console.error('Group reorganization undo record rollback failed:', rollbackError);
        });
      }
    }
    if (operationId) await releaseOperationLease(chrome, operationId).catch(() => {});
    throw error;
  } finally {
    organizeInFlight = false;
  }
}

async function createGroupContentClassifier({ windowId, groupId, categories, settings }) {
  const tabs = await chrome.tabs.query({ windowId });
  const noneGroupId = chrome.tabGroups.TAB_GROUP_ID_NONE;
  const contentTabs = tabs
    .filter((tab) => tab.groupId === groupId)
    .map((tab) => ({ ...tab, groupId: noneGroupId }));
  const content = await prepareContentClassifications({
    chromeApi: chrome,
    tabs: contentTabs,
    categories,
    settings
  });
  return {
    content,
    classify: createContentAssistedClassifier(content.classifications, settings)
  };
}

async function editSelectedGroup(message) {
  const targetWindowId = Number.isInteger(message.windowId)
    ? message.windowId
    : (await chrome.windows.getCurrent()).id;
  if (!Number.isInteger(message.groupId) || !message.expectedFingerprint) {
    return { success: false, message: 'グループ編集の開始状態を確認できませんでした。' };
  }
  if (organizeInFlight) return { success: false, message: '別の操作を実行しています。' };

  organizeInFlight = true;
  let operationId = null;
  let completedUndoData = null;
  try {
    await recoverStaleOperation(chrome);
    const lease = await acquireOperationLease(chrome, {
      windowId: targetWindowId,
      type: 'group-edit'
    });
    if (!lease.acquired) return { success: false, message: '別の操作を実行しています。' };
    operationId = lease.operation.operationId;

    const result = await editGroupSafely({
      chromeApi: chrome,
      windowId: targetWindowId,
      groupId: message.groupId,
      expectedFingerprint: message.expectedFingerprint,
      changes: message.changes,
      operationHooks: {
        onPrepared: (prepared) => prepareOperationJournal(chrome, operationId, prepared),
        onBeforeMutation: (progress) => appendOperationProgress(chrome, operationId, progress)
      }
    });
    const { undoData, ...publicResult } = result;
    completedUndoData = undoData;
    const undo = await completeUndoRecord(chrome, { operationId, undoData });
    operationId = null;
    return { ...publicResult, undo };
  } catch (error) {
    if (operationId && completedUndoData?.summary?.count > 0) {
      const committed = await getUndoRecord(chrome, completedUndoData.windowId)
        .then((record) => record?.operationId === operationId)
        .catch(() => false);
      if (!committed) {
        await rollbackCompletedOperation(chrome, completedUndoData).catch((rollbackError) => {
          console.error('Group edit undo record rollback failed:', rollbackError);
        });
      }
    }
    if (operationId) await releaseOperationLease(chrome, operationId).catch(() => {});
    throw error;
  } finally {
    organizeInFlight = false;
  }
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

// Message listener for popup & options communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ORGANIZE_CURRENT_WINDOW") {
    organizeTabs(message.windowId).then(res => sendResponse(res));
    return true;
  }
  if (message.action === "ORGANIZE_CURRENT_WINDOW_CONFIRMED") {
    organizeTabs(message.windowId, { respectPreviewMode: false })
      .then(res => sendResponse(res))
      .catch(error => {
        console.error("Confirmed organize error:", error);
        sendResponse({
          success: false,
          message: error?.message || "整理できませんでした。"
        });
      });
    return true;
  }
  if (message.action === "SIMULATE_ORGANIZE") {
    simulateOrganizeTabs().then(res => sendResponse(res));
    return true;
  }
  if (message.action === "GET_POPUP_STATE") {
    getPopupState(message.windowId)
      .then(res => sendResponse(res))
      .catch(error => sendResponse({ success: false, message: error?.message || '状態を確認できませんでした。' }));
    return true;
  }
  if (message.action === "UNDO_LAST_ACTION") {
    undoCurrentWindow(message.windowId)
      .then(res => sendResponse(res))
      .catch(error => sendResponse({ success: false, message: error?.message || '元に戻せませんでした。' }));
    return true;
  }
  if (message.action === "CORRECT_CLASSIFICATION") {
    correctCurrentClassification(message)
      .then(res => sendResponse(res))
      .catch(error => sendResponse({ success: false, message: error?.message || '分類を修正できませんでした。' }));
    return true;
  }
  if (message.action === "PREVIEW_SELECTED_GROUP_REORGANIZATION") {
    previewSelectedGroupReorganization(message)
      .then(res => sendResponse(res))
      .catch(error => sendResponse({ success: false, message: error?.message || '再構成案を確認できませんでした。' }));
    return true;
  }
  if (message.action === "REORGANIZE_SELECTED_GROUP_CONFIRMED") {
    reorganizeSelectedGroup(message)
      .then(res => sendResponse(res))
      .catch(error => sendResponse({ success: false, message: error?.message || 'グループを再構成できませんでした。' }));
    return true;
  }
  if (message.action === "EDIT_SELECTED_GROUP_CONFIRMED") {
    editSelectedGroup(message)
      .then(res => sendResponse(res))
      .catch(error => sendResponse({ success: false, message: error?.message || 'グループを編集できませんでした。' }));
    return true;
  }
  if (message.action === "ADD_EXCLUSION") {
    addExclusion(message.domain).then(res => sendResponse(res));
    return true;
  }
  if (message.action === "RESET_TO_DEFAULT") {
    chrome.storage.sync.set({ categories: DEFAULT_CATEGORIES, settings: DEFAULT_SETTINGS }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

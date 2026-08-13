import { classifyTab } from './classifier.js';

export const MANAGED_GROUPS_STORAGE_KEY = 'smartTabGrouperManagedGroupsV1';

export function isEligibleForSafeOrganize(tab, noneGroupId = -1) {
  if (!tab || !Number.isInteger(tab.id)) return false;
  if (tab.pinned || tab.groupId !== noneGroupId) return false;

  const rawUrl = tab.url || tab.pendingUrl || '';
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

export function buildSafeOrganizationPlan(
  tabs,
  categories,
  settings,
  { noneGroupId = -1, classify = classifyTab } = {}
) {
  const groups = new Map();
  const skipped = {
    pinned: 0,
    alreadyGrouped: 0,
    restricted: 0,
    unmatched: 0
  };

  for (const tab of tabs) {
    if (tab?.pinned) {
      skipped.pinned += 1;
      continue;
    }
    if (tab?.groupId !== noneGroupId) {
      skipped.alreadyGrouped += 1;
      continue;
    }
    if (!isEligibleForSafeOrganize(tab, noneGroupId)) {
      skipped.restricted += 1;
      continue;
    }

    const category = classify(tab, categories, settings);
    if (!category || category.isSystem) {
      skipped.unmatched += 1;
      continue;
    }

    if (!groups.has(category.id)) {
      groups.set(category.id, {
        category: {
          id: category.id,
          name: category.name,
          color: category.color || 'grey'
        },
        tabIds: [],
        firstIndex: Number.isInteger(tab.index) ? tab.index : Number.MAX_SAFE_INTEGER
      });
    }
    groups.get(category.id).tabIds.push(tab.id);
  }

  return {
    items: [...groups.values()].sort((first, second) => first.firstIndex - second.firstIndex),
    skipped
  };
}

export async function organizeTabsSafely({
  chromeApi,
  windowId,
  categories,
  settings,
  classify = classifyTab,
  now = () => Date.now(),
  operationHooks = {}
}) {
  const noneGroupId = chromeApi.tabGroups.TAB_GROUP_ID_NONE;
  const tabsBefore = await chromeApi.tabs.query({ windowId });
  const originalTabState = new Map(tabsBefore.map((tab) => [tab.id, {
    index: tab.index,
    groupId: tab.groupId,
    windowId: tab.windowId,
    url: tab.url || tab.pendingUrl || '',
    title: tab.title || tab.url || ''
  }]));
  const plan = buildSafeOrganizationPlan(tabsBefore, categories, settings, {
    noneGroupId,
    classify
  });

  const groupsBefore = await chromeApi.tabGroups.query({ windowId });
  const [queriedGroups, queriedTabs] = await Promise.all([
    chromeApi.tabGroups.query({}),
    chromeApi.tabs.query({})
  ]);
  const allGroups = mergeById(queriedGroups, groupsBefore);
  const allTabs = mergeById(queriedTabs, tabsBefore);
  const storedRecords = await loadManagedGroupRecords(chromeApi);
  const {
    validForWindow,
    recordsToKeep,
    blockedCategoryIds,
    managedRecordsBeforeForUndo
  } = validateManagedRecords(
    storedRecords,
    groupsBefore,
    tabsBefore,
    windowId,
    now(),
    allGroups,
    allTabs
  );
  const managedByCategory = new Map(validForWindow.map((record) => [record.categoryId, record]));
  const nextWindowRecords = new Map(validForWindow.map((record) => [record.categoryId, record]));
  const movedTabIds = [];
  const createdGroupIds = [];
  const assignedGroupByTab = new Map();
  const completedByCategory = new Map();
  let createdGroups = 0;
  let reusedGroups = 0;
  let ownershipConflicts = 0;

  await operationHooks.onPrepared?.({
    windowId,
    plannedTabs: plan.items.flatMap((item) => item.tabIds.map((tabId) => ({
      tabId,
      categoryId: item.category.id,
      ...originalTabState.get(tabId)
    }))),
    groupsBefore: groupsBefore.map((group) => ({
      id: group.id,
      windowId: group.windowId,
      title: group.title || '',
      color: group.color,
      collapsed: group.collapsed === true
    })),
    managedWindowRecordsBefore: managedRecordsBeforeForUndo
  });

  try {
    for (const item of plan.items) {
      const currentTabIds = await revalidateTabIds({
        chromeApi,
        tabIds: item.tabIds,
        windowId,
        noneGroupId,
        categories,
        settings,
        expectedCategoryId: item.category.id,
        classify
      });
      if (currentTabIds.length === 0) continue;

      const managedRecord = managedByCategory.get(item.category.id);
      if (managedRecord) {
        await operationHooks.onBeforeMutation?.({
          windowId,
          categoryId: item.category.id,
          targetGroupId: managedRecord.groupId,
          tabIds: currentTabIds,
          createdGroupId: null,
          phase: 'pending'
        });
        await chromeApi.tabs.group({
          tabIds: currentTabIds,
          groupId: managedRecord.groupId
        });
        movedTabIds.push(...currentTabIds);
        for (const tabId of currentTabIds) assignedGroupByTab.set(tabId, managedRecord.groupId);
        appendCompletedTabs(completedByCategory, item, currentTabIds, tabsBefore);
        await operationHooks.onProgress?.({
          windowId,
          categoryId: item.category.id,
          targetGroupId: managedRecord.groupId,
          tabIds: currentTabIds,
          createdGroupId: null,
          phase: 'applied'
        });
        reusedGroups += 1;
        nextWindowRecords.set(item.category.id, {
          ...managedRecord,
          memberHosts: mergeMemberHosts(managedRecord.memberHosts, currentTabIds, tabsBefore),
          lastSeenAt: now()
        });
        continue;
      }

      if (blockedCategoryIds.has(item.category.id)) {
        ownershipConflicts += 1;
        continue;
      }

      await operationHooks.onBeforeMutation?.({
        windowId,
        categoryId: item.category.id,
        targetGroupId: null,
        tabIds: currentTabIds,
        createdGroupId: null,
        phase: 'pending'
      });
      const groupId = await chromeApi.tabs.group({
        tabIds: currentTabIds,
        createProperties: { windowId }
      });
      movedTabIds.push(...currentTabIds);
      createdGroupIds.push(groupId);
      for (const tabId of currentTabIds) assignedGroupByTab.set(tabId, groupId);
      appendCompletedTabs(completedByCategory, item, currentTabIds, tabsBefore);
      await operationHooks.onProgress?.({
        windowId,
        categoryId: item.category.id,
        targetGroupId: groupId,
        tabIds: currentTabIds,
        createdGroupId: groupId,
        phase: 'applied'
      });

      const updatedGroup = await chromeApi.tabGroups.update(groupId, {
        title: item.category.name,
        color: item.category.color
      });
      if (!updatedGroup) {
        throw new Error(`グループ「${item.category.name}」を設定できませんでした。`);
      }

      const record = {
        windowId,
        groupId,
        categoryId: item.category.id,
        title: item.category.name,
        color: item.category.color,
        memberHosts: mergeMemberHosts([], currentTabIds, tabsBefore),
        createdAt: now(),
        lastSeenAt: now()
      };
      nextWindowRecords.set(item.category.id, record);
      managedByCategory.set(item.category.id, record);
      createdGroups += 1;
    }

    await saveManagedGroupRecords(chromeApi, [
      ...recordsToKeep,
      ...nextWindowRecords.values()
    ]);
  } catch (error) {
    const rollback = await rollbackCurrentOperation({
      chromeApi,
      movedTabIds,
      originalTabState,
      noneGroupId
    });
    const failure = new Error(
      rollback.success
        ? '整理中に問題が発生したため、今回の変更を元に戻しました。'
        : '整理中に問題が発生し、一部を元に戻せなかった可能性があります。'
    );
    failure.name = 'SafeOrganizeError';
    failure.cause = error;
    failure.rollback = rollback;
    failure.createdGroupIds = createdGroupIds;
    throw failure;
  }

  const changedCount = [...new Set(movedTabIds)].length;
  return {
    success: true,
    changed: changedCount > 0,
    count: changedCount,
    createdGroups,
    reusedGroups,
    ownershipConflicts,
    skipped: plan.skipped,
    undoData: {
      windowId,
      originalTabs: [...new Set(movedTabIds)].map((tabId) => ({
        tabId,
        ...originalTabState.get(tabId)
      })),
      assignedTabs: [...assignedGroupByTab].map(([tabId, groupId]) => ({ tabId, groupId })),
      groupsBefore: groupsBefore.map((group) => ({
        id: group.id,
        windowId: group.windowId,
        title: group.title || '',
        color: group.color,
        collapsed: group.collapsed === true
      })),
      createdGroupIds: [...createdGroupIds],
      managedWindowRecordsBefore: managedRecordsBeforeForUndo,
      summary: {
        count: changedCount,
        groups: [...completedByCategory.values()]
      }
    },
    message: ownershipConflicts > 0
      ? changedCount > 0
        ? `${changedCount}件のタブを整理しました。同名グループと安全に照合できない分類は変更していません。`
        : '同名グループと安全に照合できないため、変更していません。'
      : changedCount > 0
        ? `${changedCount}件のタブを整理しました。`
      : '整理する新しいタブはありません。'
  };
}

function appendCompletedTabs(completedByCategory, item, tabIds, tabsBefore) {
  if (!completedByCategory.has(item.category.id)) {
    completedByCategory.set(item.category.id, {
      categoryId: item.category.id,
      name: item.category.name,
      color: item.category.color,
      tabs: []
    });
  }
  const completed = completedByCategory.get(item.category.id);
  const tabById = new Map(tabsBefore.map((tab) => [tab.id, tab]));
  for (const tabId of tabIds) {
    const tab = tabById.get(tabId);
    completed.tabs.push({
      tabId,
      title: tab?.title || tab?.url || '無題のタブ',
      url: tab?.url || tab?.pendingUrl || ''
    });
  }
  completed.count = completed.tabs.length;
}

export async function removeManagedGroupsForWindow(chromeApi, windowId) {
  const records = await loadManagedGroupRecords(chromeApi);
  await saveManagedGroupRecords(
    chromeApi,
    records.filter((record) => record.windowId !== windowId)
  );
}

async function revalidateTabIds({
  chromeApi,
  tabIds,
  windowId,
  noneGroupId,
  categories,
  settings,
  expectedCategoryId,
  classify
}) {
  const accepted = [];
  for (const tabId of tabIds) {
    let currentTab;
    try {
      currentTab = await chromeApi.tabs.get(tabId);
    } catch (error) {
      continue;
    }
    if (currentTab.windowId !== windowId) continue;
    if (!isEligibleForSafeOrganize(currentTab, noneGroupId)) continue;
    const currentCategory = classify(currentTab, categories, settings);
    if (currentCategory?.id !== expectedCategoryId) continue;
    accepted.push(tabId);
  }
  return accepted;
}

async function rollbackCurrentOperation({
  chromeApi,
  movedTabIds,
  originalTabState,
  noneGroupId
}) {
  const uniqueMovedIds = [...new Set(movedTabIds)];
  const errors = [];
  const tabsToUngroup = [];

  for (const tabId of uniqueMovedIds) {
    try {
      const tab = await chromeApi.tabs.get(tabId);
      const original = originalTabState.get(tabId);
      if (original?.groupId === noneGroupId && tab.groupId !== noneGroupId) {
        tabsToUngroup.push(tabId);
      }
    } catch (error) {
      // A tab closed during the operation needs no rollback.
    }
  }

  if (tabsToUngroup.length > 0) {
    try {
      await chromeApi.tabs.ungroup(tabsToUngroup);
    } catch (error) {
      errors.push(error);
    }
  }

  const positions = uniqueMovedIds
    .map((tabId) => ({ tabId, index: originalTabState.get(tabId)?.index }))
    .filter((item) => Number.isInteger(item.index))
    .sort((first, second) => first.index - second.index);

  for (const item of positions) {
    try {
      const tab = await chromeApi.tabs.get(item.tabId);
      if (tab.groupId === noneGroupId && tab.index !== item.index) {
        await chromeApi.tabs.move(item.tabId, { index: item.index });
      }
    } catch (error) {
      errors.push(error);
    }
  }

  return { success: errors.length === 0, errors };
}

export async function loadManagedGroupRecords(chromeApi) {
  const data = await chromeApi.storage.local.get([MANAGED_GROUPS_STORAGE_KEY]);
  return Array.isArray(data[MANAGED_GROUPS_STORAGE_KEY])
    ? data[MANAGED_GROUPS_STORAGE_KEY]
    : [];
}

export async function saveManagedGroupRecords(chromeApi, records) {
  await chromeApi.storage.local.set({
    [MANAGED_GROUPS_STORAGE_KEY]: records
  });
}

export function validateManagedRecords(
  records,
  currentGroups,
  currentTabs,
  windowId,
  timestamp,
  allGroups = currentGroups,
  allTabs = currentTabs
) {
  const currentById = new Map(currentGroups.map((group) => [group.id, group]));
  const groupHosts = buildGroupHosts(currentTabs);
  const allGroupById = new Map(allGroups.map((group) => [group.id, group]));
  const allGroupHosts = buildGroupHosts(allTabs);
  const freshRecords = records.filter((record) =>
    !Number.isFinite(record.lastSeenAt)
    || timestamp - record.lastSeenAt < 30 * 24 * 60 * 60 * 1000
  );
  const consumed = new Set();
  const validForWindow = [];
  const seenCategories = new Set();
  const seenGroups = new Set();
  const blockedCategoryIds = new Set();
  const reboundOriginals = [];

  const windowRecords = freshRecords
    .filter((record) => record.windowId === windowId)
    .sort((first, second) => (second.lastSeenAt || 0) - (first.lastSeenAt || 0));

  for (const record of windowRecords) {
    const group = currentById.get(record.groupId);
    const valid = group
      && group.windowId === windowId
      && group.title === record.title
      && group.color === record.color
      && !seenCategories.has(record.categoryId);
    if (!valid) {
      if (group) consumed.add(record);
      continue;
    }
    consumed.add(record);
    seenCategories.add(record.categoryId);
    seenGroups.add(group.id);
    validForWindow.push(record);
  }

  const candidatesForRebinding = freshRecords
    .filter((record) =>
      !consumed.has(record)
      && !seenCategories.has(record.categoryId)
      && (record.windowId === windowId || !isLiveManagedRecord(record, allGroupById, allGroupHosts))
    )
    .sort((first, second) => (second.lastSeenAt || 0) - (first.lastSeenAt || 0));

  for (const record of candidatesForRebinding) {
    if (seenCategories.has(record.categoryId)) continue;
    const candidates = currentGroups.filter((group) =>
      !seenGroups.has(group.id)
      && group.title === record.title
      && group.color === record.color
    );
    if (candidates.length === 0) continue;

    const scored = candidates.map((group) => ({
      group,
      overlap: countOverlap(record.memberHosts || [], groupHosts.get(group.id) || [])
    })).sort((first, second) => second.overlap - first.overlap);
    const best = scored[0];
    const uniquelySafe = best.overlap > 0
      && (!scored[1] || best.overlap > scored[1].overlap);
    if (!uniquelySafe) {
      blockedCategoryIds.add(record.categoryId);
      continue;
    }

    consumed.add(record);
    reboundOriginals.push(record);
    seenCategories.add(record.categoryId);
    seenGroups.add(best.group.id);
    validForWindow.push({
      ...record,
      windowId,
      groupId: best.group.id,
      lastSeenAt: timestamp
    });
  }

  const recordsToKeep = freshRecords.filter((record) =>
    !consumed.has(record) && record.windowId !== windowId
  );
  const managedRecordsBeforeForUndo = [
    ...freshRecords.filter((record) => record.windowId === windowId),
    ...reboundOriginals.filter((record) => record.windowId !== windowId)
  ];
  return {
    validForWindow,
    recordsToKeep,
    blockedCategoryIds,
    managedRecordsBeforeForUndo
  };
}

function isLiveManagedRecord(record, groupById, groupHosts) {
  const group = groupById.get(record.groupId);
  if (
    !group
    || group.windowId !== record.windowId
    || group.title !== record.title
    || group.color !== record.color
  ) return false;
  const recordedHosts = record.memberHosts || [];
  if (recordedHosts.length === 0) return true;
  return countOverlap(recordedHosts, groupHosts.get(group.id) || []) > 0;
}

function mergeById(primary, fallback) {
  const merged = new Map();
  for (const item of [...(primary || []), ...(fallback || [])]) {
    if (Number.isInteger(item?.id)) merged.set(item.id, item);
  }
  return [...merged.values()];
}

function buildGroupHosts(tabs) {
  const result = new Map();
  for (const tab of tabs) {
    if (!Number.isInteger(tab.groupId) || tab.groupId < 0) continue;
    const host = getHostname(tab.url || tab.pendingUrl || '');
    if (!host) continue;
    if (!result.has(tab.groupId)) result.set(tab.groupId, new Set());
    result.get(tab.groupId).add(host);
  }
  return result;
}

function mergeMemberHosts(existing, tabIds, tabs) {
  const tabById = new Map(tabs.map((tab) => [tab.id, tab]));
  const hosts = new Set(existing || []);
  for (const tabId of tabIds) {
    const tab = tabById.get(tabId);
    const host = getHostname(tab?.url || tab?.pendingUrl || '');
    if (host) hosts.add(host);
  }
  return [...hosts].slice(-40);
}

function countOverlap(first, second) {
  const secondSet = second instanceof Set ? second : new Set(second);
  return [...new Set(first)].filter((item) => secondSet.has(item)).length;
}

function getHostname(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.hostname.toLowerCase()
      : '';
  } catch (error) {
    return '';
  }
}

import { classifyTab } from './classifier.js';
import {
  loadManagedGroupRecords,
  saveManagedGroupRecords,
  validateManagedRecords
} from './safe_organizer.js';

export function buildGroupReorganizationPlan(
  tabs,
  sourceGroup,
  categories,
  settings,
  {
    classify = classifyTab,
    managedByCategory = new Map(),
    blockedCategoryIds = new Set(),
    sourceCategoryId = inferSourceCategoryId(sourceGroup, categories)
  } = {}
) {
  const activeCategories = categories.filter((category) => category?.enabled !== false);
  const categoryById = new Map(activeCategories.map((category) => [category.id, category]));
  const sourceTabs = tabs
    .filter((tab) => tab?.groupId === sourceGroup?.id && Number.isInteger(tab.id))
    .sort(compareTabPosition);
  const fixedRetained = [];
  const buckets = new Map();
  const safeSettings = { ...settings, groupUnmatchedAsOthers: false };

  for (const tab of sourceTabs) {
    if (!isEligibleForGroupReorganization(tab)) {
      fixedRetained.push(tab.id);
      continue;
    }
    const category = classify(tab, activeCategories, safeSettings);
    if (!category || category.isSystem || !categoryById.has(category.id)) {
      fixedRetained.push(tab.id);
      continue;
    }
    if (!buckets.has(category.id)) {
      buckets.set(category.id, {
        category: normalizeCategory(category),
        tabIds: [],
        firstIndex: Number.isInteger(tab.index) ? tab.index : Number.MAX_SAFE_INTEGER
      });
    }
    buckets.get(category.id).tabIds.push(tab.id);
  }

  const retainedCategoryId = chooseRetainedCategoryId(buckets, sourceCategoryId);
  const retainedTabIds = [...fixedRetained];
  const items = [];
  let blockedCount = 0;

  for (const [categoryId, bucket] of buckets) {
    if (categoryId === retainedCategoryId || blockedCategoryIds.has(categoryId)) {
      retainedTabIds.push(...bucket.tabIds);
      if (blockedCategoryIds.has(categoryId)) blockedCount += bucket.tabIds.length;
      continue;
    }
    const managedRecord = managedByCategory.get(categoryId);
    items.push({
      ...bucket,
      targetGroupId: Number.isInteger(managedRecord?.groupId) ? managedRecord.groupId : null
    });
  }

  items.sort((first, second) => first.firstIndex - second.firstIndex);
  retainedTabIds.sort((first, second) => {
    const firstTab = sourceTabs.find((tab) => tab.id === first);
    const secondTab = sourceTabs.find((tab) => tab.id === second);
    return compareTabPosition(firstTab, secondTab);
  });

  return {
    sourceGroup: normalizeGroup(sourceGroup),
    sourceCategoryId,
    retainedCategoryId,
    totalCount: sourceTabs.length,
    retainedTabIds,
    retainedCount: retainedTabIds.length,
    items,
    movedCount: items.reduce((sum, item) => sum + item.tabIds.length, 0),
    targetGroupCount: items.length,
    newGroupCount: items.filter((item) => !Number.isInteger(item.targetGroupId)).length,
    blockedCount,
    fingerprint: createGroupFingerprint(sourceGroup, sourceTabs)
  };
}

export async function prepareGroupReorganization({
  chromeApi,
  windowId,
  sourceGroupId,
  categories,
  settings,
  classify = classifyTab,
  now = () => Date.now()
}) {
  const [tabsBefore, groupsBefore, queriedGroups, queriedTabs, storedRecords] = await Promise.all([
    chromeApi.tabs.query({ windowId }),
    chromeApi.tabGroups.query({ windowId }),
    chromeApi.tabGroups.query({}),
    chromeApi.tabs.query({}),
    loadManagedGroupRecords(chromeApi)
  ]);
  const sourceGroup = groupsBefore.find((group) => group.id === sourceGroupId);
  if (!sourceGroup) throw staleGroupError();
  if (sourceGroup.shared === true) {
    const error = new Error('共有タブグループは現在の再構成対象外です。Chromeのタブバーから編集してください。');
    error.name = 'SharedGroupUnsupportedError';
    throw error;
  }

  const allGroups = mergeById(queriedGroups, groupsBefore);
  const allTabs = mergeById(queriedTabs, tabsBefore);
  const ownership = validateManagedRecords(
    storedRecords,
    groupsBefore,
    tabsBefore,
    windowId,
    now(),
    allGroups,
    allTabs
  );
  const managedByCategory = new Map(
    ownership.validForWindow.map((record) => [record.categoryId, record])
  );
  const targetManagedByCategory = new Map(
    ownership.validForWindow
      .filter((record) => record.groupId !== sourceGroupId)
      .map((record) => [record.categoryId, record])
  );
  const sourceRecord = ownership.validForWindow.find((record) => record.groupId === sourceGroupId);
  const sourceCategoryId = sourceRecord?.categoryId || inferSourceCategoryId(sourceGroup, categories);
  const plan = buildGroupReorganizationPlan(tabsBefore, sourceGroup, categories, settings, {
    classify,
    managedByCategory: targetManagedByCategory,
    blockedCategoryIds: ownership.blockedCategoryIds,
    sourceCategoryId
  });

  return {
    ...plan,
    tabsBefore,
    groupsBefore,
    storedRecords,
    ownership,
    managedByCategory
  };
}

export async function reorganizeGroupSafely({
  chromeApi,
  windowId,
  sourceGroupId,
  expectedFingerprint,
  categories,
  settings,
  classify = classifyTab,
  now = () => Date.now(),
  operationHooks = {}
}) {
  const prepared = await prepareGroupReorganization({
    chromeApi,
    windowId,
    sourceGroupId,
    categories,
    settings,
    classify,
    now
  });
  if (expectedFingerprint && !fingerprintsEqual(prepared.fingerprint, expectedFingerprint)) {
    throw staleGroupError();
  }

  const originalById = new Map(prepared.tabsBefore.map((tab) => [tab.id, {
    tabId: tab.id,
    index: tab.index,
    groupId: tab.groupId,
    windowId: tab.windowId,
    url: tab.url || tab.pendingUrl || '',
    title: tab.title || tab.url || ''
  }]));
  const plannedTabIds = prepared.items.flatMap((item) => item.tabIds);
  const nextWindowRecords = new Map(
    prepared.ownership.validForWindow.map((record) => [record.categoryId, record])
  );
  const assignedGroupByTab = new Map();
  const completedByCategory = new Map();
  const createdGroupIds = [];
  let createdGroups = 0;
  let reusedGroups = 0;

  await operationHooks.onPrepared?.({
    windowId,
    sourceGroupId,
    plannedTabs: plannedTabIds.map((tabId) => ({
      ...originalById.get(tabId),
      categoryId: findCategoryIdForTab(prepared.items, tabId)
    })),
    groupsBefore: prepared.groupsBefore.map(normalizeGroup),
    managedWindowRecordsBefore: prepared.ownership.managedRecordsBeforeForUndo
  });

  try {
    for (const item of prepared.items) {
      let currentTabIds = await revalidateSourceTabs({
        chromeApi,
        tabIds: item.tabIds,
        windowId,
        sourceGroupId,
        expectedCategoryId: item.category.id,
        categories,
        settings,
        classify,
        originalById
      });
      if (currentTabIds.length === 0) continue;

      const targetGroupId = Number.isInteger(item.targetGroupId) ? item.targetGroupId : null;
      await operationHooks.onBeforeMutation?.({
        windowId,
        sourceGroupId,
        categoryId: item.category.id,
        targetGroupId,
        tabIds: currentTabIds,
        createdGroupId: null,
        phase: 'pending'
      });

      currentTabIds = await revalidateSourceTabs({
        chromeApi,
        tabIds: currentTabIds,
        windowId,
        sourceGroupId,
        expectedCategoryId: item.category.id,
        categories,
        settings,
        classify,
        originalById
      });
      if (currentTabIds.length === 0) continue;

      let appliedGroupId = targetGroupId;
      if (Number.isInteger(appliedGroupId)) {
        await chromeApi.tabs.group({ tabIds: currentTabIds, groupId: appliedGroupId });
        for (const tabId of currentTabIds) assignedGroupByTab.set(tabId, appliedGroupId);
        reusedGroups += 1;
      } else {
        appliedGroupId = await chromeApi.tabs.group({
          tabIds: currentTabIds,
          createProperties: { windowId }
        });
        createdGroupIds.push(appliedGroupId);
        for (const tabId of currentTabIds) assignedGroupByTab.set(tabId, appliedGroupId);
        const updated = await chromeApi.tabGroups.update(appliedGroupId, {
          title: item.category.name,
          color: item.category.color
        });
        if (!updated) throw new Error(`グループ「${item.category.name}」を設定できませんでした。`);
        createdGroups += 1;
      }

      appendCompletedTabs(completedByCategory, item, currentTabIds, prepared.tabsBefore);
      await operationHooks.onProgress?.({
        windowId,
        sourceGroupId,
        categoryId: item.category.id,
        targetGroupId: appliedGroupId,
        tabIds: currentTabIds,
        createdGroupId: targetGroupId === null ? appliedGroupId : null,
        phase: 'applied'
      });

      const previous = prepared.managedByCategory.get(item.category.id);
      nextWindowRecords.set(item.category.id, {
        windowId,
        groupId: appliedGroupId,
        categoryId: item.category.id,
        title: item.category.name,
        color: item.category.color,
        memberHosts: mergeMemberHosts(previous?.memberHosts, currentTabIds, prepared.tabsBefore),
        createdAt: previous?.createdAt || now(),
        lastSeenAt: now()
      });
    }

    await saveManagedGroupRecords(chromeApi, [
      ...prepared.ownership.recordsToKeep,
      ...nextWindowRecords.values()
    ]);
  } catch (error) {
    const rollback = await rollbackAssignments({
      chromeApi,
      assignments: assignedGroupByTab,
      originalById
    });
    await saveManagedGroupRecords(chromeApi, prepared.storedRecords).catch(() => {});
    const failure = new Error(
      rollback.success
        ? '再構成中に問題が発生したため、今回の変更を元に戻しました。'
        : '再構成中に問題が発生し、一部を元に戻せなかった可能性があります。'
    );
    failure.name = 'SafeGroupReorganizationError';
    failure.cause = error;
    failure.rollback = rollback;
    throw failure;
  }

  const changedTabIds = [...assignedGroupByTab.keys()];
  return {
    success: true,
    changed: changedTabIds.length > 0,
    count: changedTabIds.length,
    retainedCount: prepared.totalCount - changedTabIds.length,
    createdGroups,
    reusedGroups,
    blockedCount: prepared.blockedCount,
    undoData: {
      windowId,
      originalTabs: changedTabIds.map((tabId) => originalById.get(tabId)),
      assignedTabs: [...assignedGroupByTab].map(([tabId, groupId]) => ({ tabId, groupId })),
      groupsBefore: prepared.groupsBefore.map(normalizeGroup),
      createdGroupIds,
      managedWindowRecordsBefore: prepared.ownership.managedRecordsBeforeForUndo,
      summary: {
        count: changedTabIds.length,
        groups: [...completedByCategory.values()]
      }
    },
    message: changedTabIds.length > 0
      ? `${changedTabIds.length}件を${completedByCategory.size}グループへ分け直しました。`
      : 'このグループは現在の設定で分け直す必要がありません。'
  };
}

export function createGroupFingerprint(sourceGroup, sourceTabs) {
  return {
    groupId: sourceGroup?.id,
    title: sourceGroup?.title || '',
    color: sourceGroup?.color || 'grey',
    tabs: [...sourceTabs]
      .sort(compareTabPosition)
      .map((tab) => ({
        id: tab.id,
        index: tab.index,
        url: tab.url || tab.pendingUrl || '',
        title: tab.title || ''
      }))
  };
}

export function fingerprintsEqual(current, expected) {
  if (!current || !expected) return false;
  return JSON.stringify(current) === JSON.stringify(expected);
}

function chooseRetainedCategoryId(buckets, sourceCategoryId) {
  if (sourceCategoryId && buckets.has(sourceCategoryId)) return sourceCategoryId;
  return [...buckets.entries()]
    .sort((first, second) => {
      const countDifference = second[1].tabIds.length - first[1].tabIds.length;
      return countDifference || first[1].firstIndex - second[1].firstIndex;
    })[0]?.[0] || null;
}

function inferSourceCategoryId(sourceGroup, categories) {
  const matches = categories.filter((category) =>
    category?.enabled !== false
    && category.name === (sourceGroup?.title || '')
    && (category.color || 'grey') === (sourceGroup?.color || 'grey')
  );
  return matches.length === 1 ? matches[0].id : null;
}

function isEligibleForGroupReorganization(tab) {
  if (!tab || !Number.isInteger(tab.id) || tab.pinned) return false;
  try {
    const url = new URL(tab.url || tab.pendingUrl || '');
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

async function revalidateSourceTabs({
  chromeApi,
  tabIds,
  windowId,
  sourceGroupId,
  expectedCategoryId,
  categories,
  settings,
  classify,
  originalById
}) {
  const accepted = [];
  const safeSettings = { ...settings, groupUnmatchedAsOthers: false };
  for (const tabId of tabIds) {
    try {
      const current = await chromeApi.tabs.get(tabId);
      const original = originalById.get(tabId);
      const currentUrl = current.url || current.pendingUrl || '';
      if (
        current.windowId !== windowId
        || current.groupId !== sourceGroupId
        || currentUrl !== original?.url
        || (current.title || current.url || '') !== original?.title
        || !isEligibleForGroupReorganization(current)
      ) continue;
      const category = classify(current, categories, safeSettings);
      if (category?.id === expectedCategoryId) accepted.push(tabId);
    } catch (error) {
      // Closed or moved tabs are intentionally left alone.
    }
  }
  return accepted;
}

async function rollbackAssignments({ chromeApi, assignments, originalById }) {
  const errors = [];
  for (const [tabId, assignedGroupId] of assignments) {
    try {
      const current = await chromeApi.tabs.get(tabId);
      const original = originalById.get(tabId);
      if (!original || current.groupId !== assignedGroupId) continue;
      await chromeApi.tabs.group({ tabIds: [tabId], groupId: original.groupId });
      if (Number.isInteger(original.index)) {
        const restored = await chromeApi.tabs.get(tabId);
        if (restored.index !== original.index) {
          await chromeApi.tabs.move(tabId, { index: original.index });
        }
      }
    } catch (error) {
      errors.push(error);
    }
  }
  return { success: errors.length === 0, errors };
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

function mergeMemberHosts(existing, tabIds, tabs) {
  const tabById = new Map(tabs.map((tab) => [tab.id, tab]));
  const hosts = new Set(existing || []);
  for (const tabId of tabIds) {
    try {
      const url = new URL(tabById.get(tabId)?.url || tabById.get(tabId)?.pendingUrl || '');
      if (url.protocol === 'http:' || url.protocol === 'https:') hosts.add(url.hostname.toLowerCase());
    } catch (error) {
      // Restricted URLs are not used as ownership fingerprints.
    }
  }
  return [...hosts].slice(-40);
}

function findCategoryIdForTab(items, tabId) {
  return items.find((item) => item.tabIds.includes(tabId))?.category.id || null;
}

function normalizeCategory(category) {
  return {
    id: category.id,
    name: category.name,
    color: category.color || 'grey'
  };
}

function normalizeGroup(group) {
  return {
    id: group?.id,
    windowId: group?.windowId,
    title: group?.title || '',
    color: group?.color || 'grey',
    collapsed: group?.collapsed === true,
    shared: group?.shared === true
  };
}

function compareTabPosition(first, second) {
  return (first?.index ?? Number.MAX_SAFE_INTEGER) - (second?.index ?? Number.MAX_SAFE_INTEGER);
}

function mergeById(primary, fallback) {
  const merged = new Map();
  for (const item of [...(primary || []), ...(fallback || [])]) {
    if (Number.isInteger(item?.id)) merged.set(item.id, item);
  }
  return [...merged.values()];
}

function staleGroupError() {
  const error = new Error('確認後にグループの状態が変わりました。もう一度確認してください。');
  error.name = 'StaleGroupReorganizationError';
  return error;
}

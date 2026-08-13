import {
  loadManagedGroupRecords,
  saveManagedGroupRecords
} from './safe_organizer.js';
import { getUndoRecord, updateUndoRecord } from './undo_manager.js';

export async function correctTabClassification({
  chromeApi,
  windowId,
  operationId,
  tabId,
  targetCategoryId,
  categories,
  now = () => Date.now()
}) {
  const undoRecord = await getUndoRecord(chromeApi, windowId, now);
  if (!undoRecord || undoRecord.operationId !== operationId) {
    throw new Error('この整理結果は期限切れです。');
  }

  const assigned = undoRecord.assignedTabs?.find((item) => item.tabId === tabId);
  const targetCategory = categories.find((item) =>
    item.id === targetCategoryId && item.enabled !== false
  );
  if (!assigned || !targetCategory) throw new Error('修正先を確認できませんでした。');

  const currentTab = await chromeApi.tabs.get(tabId);
  if (currentTab.windowId !== windowId || currentTab.groupId !== assigned.groupId) {
    throw new Error('このタブは後から変更されているため、そのまま残しました。');
  }
  const hostname = getHttpHostname(currentTab.url || currentTab.pendingUrl || '');
  if (!hostname) throw new Error('このページはドメインルールへ登録できません。');

  const sourceGroup = undoRecord.summary?.groups?.find((group) =>
    group.tabs?.some((tab) => tab.tabId === tabId)
  );
  if (sourceGroup?.categoryId === targetCategoryId) {
    return { success: true, undo: toPublicState(undoRecord), message: 'すでにこの分類です。' };
  }

  const categoriesBefore = structuredClone(categories);
  const categoriesNext = categories.map((category) => ({
    ...category,
    domains: (category.domains || []).filter((domain) => domain !== hostname)
  }));
  const nextTarget = categoriesNext.find((category) => category.id === targetCategoryId);
  nextTarget.domains = [...new Set([...(nextTarget.domains || []), hostname])];

  const managedBefore = await loadManagedGroupRecords(chromeApi);
  const groupsBefore = await chromeApi.tabGroups.query({ windowId });
  const currentGroupById = new Map(groupsBefore.map((group) => [group.id, group]));
  const targetRecord = managedBefore.find((record) => {
    if (record.windowId !== windowId || record.categoryId !== targetCategoryId) return false;
    const group = currentGroupById.get(record.groupId);
    return group
      && group.title === record.title
      && group.color === record.color;
  });

  let targetGroupId = targetRecord?.groupId ?? null;
  let createdGroupId = null;
  try {
    await chromeApi.storage.sync.set({ categories: categoriesNext });

    if (targetGroupId === null) {
      targetGroupId = await chromeApi.tabs.group({
        tabIds: [tabId],
        createProperties: { windowId }
      });
      createdGroupId = targetGroupId;
      await chromeApi.tabGroups.update(targetGroupId, {
        title: targetCategory.name,
        color: targetCategory.color || 'grey'
      });
    } else {
      await chromeApi.tabs.group({ tabIds: [tabId], groupId: targetGroupId });
    }

    const currentGroups = await chromeApi.tabGroups.query({ windowId });
    const currentGroupIds = new Set(currentGroups.map((group) => group.id));
    const managedNext = managedBefore.filter((record) =>
      record.windowId !== windowId || currentGroupIds.has(record.groupId)
    );
    if (createdGroupId !== null) {
      managedNext.push({
        windowId,
        groupId: targetGroupId,
        categoryId: targetCategory.id,
        title: targetCategory.name,
        color: targetCategory.color || 'grey',
        memberHosts: [hostname],
        createdAt: now(),
        lastSeenAt: now()
      });
    } else {
      const index = managedNext.findIndex((record) =>
        record.windowId === windowId && record.groupId === targetGroupId
      );
      if (index >= 0) {
        managedNext[index] = {
          ...managedNext[index],
          memberHosts: [...new Set([...(managedNext[index].memberHosts || []), hostname])],
          lastSeenAt: now()
        };
      }
    }
    await saveManagedGroupRecords(chromeApi, managedNext);

    const undo = await updateUndoRecord(chromeApi, {
      windowId,
      operationId,
      now,
      updater: (record) => updateCorrectionRecord(record, {
        tabId,
        targetGroupId,
        targetCategory,
        createdGroupId
      })
    });

    return {
      success: true,
      undo,
      hostname,
      targetCategoryId,
      message: `${hostname} を「${targetCategory.name}」へ登録しました。`
    };
  } catch (error) {
    await chromeApi.storage.sync.set({ categories: categoriesBefore }).catch(() => {});
    const restoredGroupId = await restorePreviousGroup(chromeApi, {
      tabId,
      windowId,
      previousGroupId: assigned.groupId,
      sourceGroup
    });
    const managedToRestore = Number.isInteger(restoredGroupId)
      ? managedBefore.map((record) =>
        record.windowId === windowId && record.groupId === assigned.groupId
          ? { ...record, groupId: restoredGroupId, lastSeenAt: now() }
          : record
      )
      : managedBefore.filter((record) =>
        record.windowId !== windowId || record.groupId !== assigned.groupId
      );
    await saveManagedGroupRecords(chromeApi, managedToRestore).catch(() => {});
    throw error;
  }
}

function updateCorrectionRecord(record, {
  tabId,
  targetGroupId,
  targetCategory,
  createdGroupId
}) {
  const summary = record.summary || { count: 0, groups: [] };
  let movedTab = null;
  const groups = (summary.groups || []).map((group) => {
    const tabs = (group.tabs || []).filter((tab) => {
      if (tab.tabId !== tabId) return true;
      movedTab = tab;
      return false;
    });
    return { ...group, tabs, count: tabs.length };
  }).filter((group) => group.tabs.length > 0);

  if (!movedTab) movedTab = { tabId, title: 'タブ', url: '' };
  let targetGroup = groups.find((group) => group.categoryId === targetCategory.id);
  if (!targetGroup) {
    targetGroup = {
      categoryId: targetCategory.id,
      name: targetCategory.name,
      color: targetCategory.color || 'grey',
      tabs: [],
      count: 0
    };
    groups.push(targetGroup);
  }
  targetGroup.tabs.push(movedTab);
  targetGroup.count = targetGroup.tabs.length;

  return {
    ...record,
    assignedTabs: (record.assignedTabs || []).map((item) =>
      item.tabId === tabId ? { ...item, groupId: targetGroupId } : item
    ),
    createdGroupIds: createdGroupId === null
      ? record.createdGroupIds
      : [...new Set([...(record.createdGroupIds || []), createdGroupId])],
    summary: { ...summary, groups }
  };
}

async function restorePreviousGroup(chromeApi, {
  tabId,
  windowId,
  previousGroupId,
  sourceGroup
}) {
  try {
    await chromeApi.tabs.group({ tabIds: [tabId], groupId: previousGroupId });
    return previousGroupId;
  } catch (error) {
    if (!sourceGroup) return null;
  }

  try {
    const groupId = await chromeApi.tabs.group({
      tabIds: [tabId],
      createProperties: { windowId }
    });
    await chromeApi.tabGroups.update(groupId, {
      title: sourceGroup.name,
      color: sourceGroup.color || 'grey'
    });
    return groupId;
  } catch (error) {
    // The original error remains the actionable failure.
    return null;
  }
}

function getHttpHostname(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.hostname.toLowerCase()
      : '';
  } catch (error) {
    return '';
  }
}

function toPublicState(record) {
  return {
    available: true,
    operationId: record.operationId,
    windowId: record.windowId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    summary: record.summary
  };
}

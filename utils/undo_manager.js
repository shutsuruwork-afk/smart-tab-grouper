import { MANAGED_GROUPS_STORAGE_KEY } from './safe_organizer.js';

export const ACTIVE_OPERATION_STORAGE_KEY = 'smartTabGrouperActiveOperationV1';
export const UNDO_RECORDS_STORAGE_KEY = 'smartTabGrouperUndoRecordsV1';
export const UNDO_TTL_MS = 30 * 60 * 1000;
export const OPERATION_LEASE_MS = 60 * 1000;

export async function acquireOperationLease(
  chromeApi,
  { windowId, type = 'organize', now = () => Date.now(), operationId = createOperationId() }
) {
  const timestamp = now();
  const current = await loadActiveOperation(chromeApi);
  if (current && Number(current.leaseExpiresAt) > timestamp) {
    return { acquired: false, operation: current };
  }

  const operation = {
    version: 1,
    operationId,
    type,
    windowId,
    status: 'preparing',
    startedAt: timestamp,
    updatedAt: timestamp,
    leaseExpiresAt: timestamp + OPERATION_LEASE_MS,
    progress: []
  };
  await chromeApi.storage.session.set({ [ACTIVE_OPERATION_STORAGE_KEY]: operation });
  return { acquired: true, operation };
}

export async function prepareOperationJournal(
  chromeApi,
  operationId,
  prepared,
  now = () => Date.now()
) {
  return updateOwnedOperation(chromeApi, operationId, (operation) => ({
    ...operation,
    status: 'mutating',
    prepared,
    updatedAt: now(),
    leaseExpiresAt: now() + OPERATION_LEASE_MS
  }));
}

export async function appendOperationProgress(
  chromeApi,
  operationId,
  entry,
  now = () => Date.now()
) {
  return updateOwnedOperation(chromeApi, operationId, (operation) => {
    const progress = Array.isArray(operation.progress) ? operation.progress : [];
    return {
      ...operation,
      progress: [...progress, entry],
      updatedAt: now(),
      leaseExpiresAt: now() + OPERATION_LEASE_MS
    };
  });
}

export async function releaseOperationLease(chromeApi, operationId) {
  const current = await loadActiveOperation(chromeApi);
  if (current?.operationId !== operationId) return false;
  await chromeApi.storage.session.remove([ACTIVE_OPERATION_STORAGE_KEY]);
  return true;
}

export async function completeUndoRecord(
  chromeApi,
  { operationId, undoData, now = () => Date.now() }
) {
  const timestamp = now();
  const records = await loadUndoRecords(chromeApi, timestamp);
  const windowKey = String(undoData.windowId);

  if (!(undoData.summary?.count > 0)) {
    await releaseOperationLease(chromeApi, operationId);
    return records[windowKey] ? toPublicUndoState(records[windowKey]) : null;
  }

  records[windowKey] = {
    version: 1,
    operationId,
    windowId: undoData.windowId,
    createdAt: timestamp,
    expiresAt: timestamp + UNDO_TTL_MS,
    ...undoData
  };
  await chromeApi.storage.session.set({ [UNDO_RECORDS_STORAGE_KEY]: records });
  // The undo record is the commit marker. A leftover lease is harmless and is
  // cleared by stale recovery without rolling back a committed operation.
  await releaseOperationLease(chromeApi, operationId).catch(() => {});
  return toPublicUndoState(records[windowKey]);
}

export async function getUndoState(chromeApi, windowId, now = () => Date.now()) {
  const records = await loadUndoRecords(chromeApi, now());
  const record = records[String(windowId)];
  return record ? toPublicUndoState(record) : null;
}

export async function getUndoRecord(chromeApi, windowId, now = () => Date.now()) {
  const records = await loadUndoRecords(chromeApi, now());
  return records[String(windowId)] || null;
}

export async function updateUndoRecord(
  chromeApi,
  { windowId, operationId, updater, now = () => Date.now() }
) {
  const records = await loadUndoRecords(chromeApi, now());
  const key = String(windowId);
  const current = records[key];
  if (!current || current.operationId !== operationId) {
    throw new Error('この整理結果は期限切れです。');
  }
  const next = updater(structuredClone(current));
  records[key] = next;
  await chromeApi.storage.session.set({ [UNDO_RECORDS_STORAGE_KEY]: records });
  return toPublicUndoState(next);
}

export async function clearUndoForWindow(chromeApi, windowId, now = () => Date.now()) {
  const records = await loadUndoRecords(chromeApi, now());
  delete records[String(windowId)];
  await chromeApi.storage.session.set({ [UNDO_RECORDS_STORAGE_KEY]: records });
}

export async function undoLastOperation(chromeApi, windowId, now = () => Date.now()) {
  const records = await loadUndoRecords(chromeApi, now());
  const windowKey = String(windowId);
  const record = records[windowKey];
  if (!record) {
    return { success: false, message: '元に戻せる整理はありません。' };
  }

  const restored = await restoreRecordedTabs(chromeApi, {
    windowId,
    originalTabs: record.originalTabs,
    assignedTabs: record.assignedTabs
  });
  const restoredGroups = await restoreRecordedGroups(chromeApi, {
    windowId,
    editedGroups: record.editedGroups || []
  });
  if (canRestoreManagedRecords(record.editedGroups, restoredGroups)) {
    await restoreManagedRecordsForWindow(
      chromeApi,
      windowId,
      record.managedWindowRecordsBefore || []
    );
  }

  delete records[windowKey];
  await chromeApi.storage.session.set({ [UNDO_RECORDS_STORAGE_KEY]: records });
  return {
    success: true,
    restoredCount: restored.restoredCount,
    skippedCount: restored.skippedCount,
    restoredGroupCount: restoredGroups.restoredCount,
    skippedGroupCount: restoredGroups.skippedCount,
    errorCount: restored.errors.length + restoredGroups.errors.length,
    partial: restored.skippedCount > 0
      || restored.errors.length > 0
      || restoredGroups.skippedCount > 0
      || restoredGroups.errors.length > 0,
    message: buildUndoMessage(restored, restoredGroups)
  };
}

export async function recoverStaleOperation(chromeApi, now = () => Date.now()) {
  const operation = await loadActiveOperation(chromeApi);
  if (!operation) return { recovered: false, active: false };
  if (Number(operation.leaseExpiresAt) > now()) {
    return { recovered: false, active: true, operation };
  }

  const committed = await getRawUndoRecord(chromeApi, operation.windowId);
  if (committed?.operationId === operation.operationId) {
    await chromeApi.storage.session.remove([ACTIVE_OPERATION_STORAGE_KEY]);
    return {
      recovered: true,
      active: false,
      committed: true,
      windowId: operation.windowId,
      restoredCount: 0,
      skippedCount: 0,
      errors: []
    };
  }

  let restoration = { restoredCount: 0, skippedCount: 0, errors: [] };
  let groupRestoration = { restoredCount: 0, skippedCount: 0, errors: [] };
  if (operation.prepared && Array.isArray(operation.progress) && operation.progress.length > 0) {
    const assignedByTab = new Map();
    for (const entry of operation.progress) {
      for (const tabId of entry.tabIds || []) {
        assignedByTab.set(tabId, {
          tabId,
          groupId: Number.isInteger(entry.targetGroupId) ? entry.targetGroupId : null,
          allowUnknownTarget: !Number.isInteger(entry.targetGroupId)
        });
      }
    }
    restoration = await restoreRecordedTabs(chromeApi, {
      windowId: operation.windowId,
      originalTabs: operation.prepared.plannedTabs || [],
      assignedTabs: [...assignedByTab.values()]
    });
    groupRestoration = await restoreRecordedGroups(chromeApi, {
      windowId: operation.windowId,
      editedGroups: operation.prepared.groupEdits || []
    });
    if (canRestoreManagedRecords(operation.prepared.groupEdits, groupRestoration)) {
      await restoreManagedRecordsForWindow(
        chromeApi,
        operation.windowId,
        operation.prepared.managedWindowRecordsBefore || []
      );
    }
  }

  await chromeApi.storage.session.remove([ACTIVE_OPERATION_STORAGE_KEY]);
  return {
    recovered: true,
    active: false,
    windowId: operation.windowId,
    ...restoration,
    restoredGroupCount: groupRestoration.restoredCount,
    skippedGroupCount: groupRestoration.skippedCount,
    errors: [...restoration.errors, ...groupRestoration.errors]
  };
}

export async function rollbackCompletedOperation(chromeApi, undoData) {
  const restored = await restoreRecordedTabs(chromeApi, {
    windowId: undoData.windowId,
    originalTabs: undoData.originalTabs || [],
    assignedTabs: undoData.assignedTabs || []
  });
  const restoredGroups = await restoreRecordedGroups(chromeApi, {
    windowId: undoData.windowId,
    editedGroups: undoData.editedGroups || []
  });
  if (canRestoreManagedRecords(undoData.editedGroups, restoredGroups)) {
    await restoreManagedRecordsForWindow(
      chromeApi,
      undoData.windowId,
      undoData.managedWindowRecordsBefore || []
    );
  }
  return {
    ...restored,
    restoredGroupCount: restoredGroups.restoredCount,
    skippedGroupCount: restoredGroups.skippedCount,
    errors: [...restored.errors, ...restoredGroups.errors]
  };
}

export async function getActiveOperation(chromeApi) {
  return loadActiveOperation(chromeApi);
}

async function restoreRecordedTabs(chromeApi, { windowId, originalTabs = [], assignedTabs = [] }) {
  const originalById = new Map(originalTabs.map((item) => [item.tabId, item]));
  const expectedById = new Map(assignedTabs.map((item) => [item.tabId, item]));
  const accepted = [];
  const errors = [];
  const failedTabIds = new Set();
  let skippedCount = 0;

  for (const [tabId, assignment] of expectedById) {
    const original = originalById.get(tabId);
    if (!original) {
      skippedCount += 1;
      continue;
    }
    try {
      const current = await chromeApi.tabs.get(tabId);
      const sameUrl = !original.url || original.url === (current.url || current.pendingUrl || '');
      const targetKnown = Number.isInteger(assignment.groupId);
      if (
        current.windowId !== windowId
        || (targetKnown && current.groupId !== assignment.groupId)
        || !sameUrl
      ) {
        skippedCount += 1;
        continue;
      }
      if (!targetKnown && current.groupId === original.groupId) continue;
      accepted.push({ tabId, original });
    } catch (error) {
      // Closed tabs are intentionally skipped instead of being recreated.
      skippedCount += 1;
    }
  }

  const noneGroupId = chromeApi.tabGroups.TAB_GROUP_ID_NONE;
  for (const item of accepted) {
    try {
      if (item.original.groupId === noneGroupId) {
        await chromeApi.tabs.ungroup([item.tabId]);
      } else {
        await chromeApi.tabs.group({
          tabIds: [item.tabId],
          groupId: item.original.groupId
        });
      }
    } catch (error) {
      errors.push(error);
      failedTabIds.add(item.tabId);
    }
  }

  for (const item of accepted
    .filter((entry) => Number.isInteger(entry.original.index))
    .sort((first, second) => first.original.index - second.original.index)) {
    try {
      const current = await chromeApi.tabs.get(item.tabId);
      if (current.index !== item.original.index) {
        await chromeApi.tabs.move(item.tabId, { index: item.original.index });
      }
    } catch (error) {
      errors.push(error);
      failedTabIds.add(item.tabId);
    }
  }

  return {
    restoredCount: Math.max(0, accepted.length - failedTabIds.size),
    skippedCount,
    errors
  };
}

async function restoreRecordedGroups(chromeApi, { windowId, editedGroups = [] }) {
  let restoredCount = 0;
  let skippedCount = 0;
  const errors = [];

  for (const edit of editedGroups) {
    if (!Number.isInteger(edit?.groupId) || !edit.original || !edit.applied) {
      skippedCount += 1;
      continue;
    }
    let current;
    try {
      current = await chromeApi.tabGroups.get(edit.groupId);
    } catch (error) {
      skippedCount += 1;
      continue;
    }
    if (
      current.windowId !== windowId
      || current.shared === true
      || !sameGroupProperties(current, edit.applied)
    ) {
      skippedCount += 1;
      continue;
    }
    try {
      const updated = await chromeApi.tabGroups.update(edit.groupId, {
        title: edit.original.title || '',
        color: edit.original.color || 'grey',
        collapsed: edit.original.collapsed === true
      });
      if (!updated || !sameGroupProperties(updated, edit.original)) {
        throw new Error('グループの表示を元に戻せませんでした。');
      }
      restoredCount += 1;
    } catch (error) {
      errors.push(error);
    }
  }

  return { restoredCount, skippedCount, errors };
}

function sameGroupProperties(group, expected) {
  return (group.title || '') === (expected.title || '')
    && (group.color || 'grey') === (expected.color || 'grey')
    && (group.collapsed === true) === (expected.collapsed === true);
}

function buildUndoMessage(restoredTabs, restoredGroups) {
  const groupOnly = restoredGroups.restoredCount + restoredGroups.skippedCount + restoredGroups.errors.length > 0
    && restoredTabs.restoredCount + restoredTabs.skippedCount + restoredTabs.errors.length === 0;
  if (groupOnly) {
    if (restoredGroups.errors.length > 0) {
      return `${restoredGroups.restoredCount}件のグループ変更を元に戻しました。一部は復元できませんでした。`;
    }
    if (restoredGroups.skippedCount > 0) {
      return `${restoredGroups.restoredCount}件のグループ変更を元に戻しました。後から変更されたグループはそのまま残しました。`;
    }
    return `${restoredGroups.restoredCount}件のグループ変更を元に戻しました。`;
  }
  if (restoredTabs.errors.length > 0 || restoredGroups.errors.length > 0) {
    return `${restoredTabs.restoredCount}件を元に戻しました。一部は復元できませんでした。`;
  }
  if (restoredTabs.skippedCount > 0 || restoredGroups.skippedCount > 0) {
    return `${restoredTabs.restoredCount}件を元に戻しました。後から変更された項目はそのまま残しました。`;
  }
  return `${restoredTabs.restoredCount}件を元に戻しました。`;
}

function canRestoreManagedRecords(editedGroups, restoration) {
  const edits = Array.isArray(editedGroups) ? editedGroups : [];
  return edits.length === 0
    || (restoration.restoredCount === edits.length
      && restoration.skippedCount === 0
      && restoration.errors.length === 0);
}

async function restoreManagedRecordsForWindow(chromeApi, windowId, recordsBefore) {
  const data = await chromeApi.storage.local.get([MANAGED_GROUPS_STORAGE_KEY]);
  const current = Array.isArray(data[MANAGED_GROUPS_STORAGE_KEY])
    ? data[MANAGED_GROUPS_STORAGE_KEY]
    : [];
  await chromeApi.storage.local.set({
    [MANAGED_GROUPS_STORAGE_KEY]: [
      ...current.filter((record) => record.windowId !== windowId),
      ...recordsBefore
    ]
  });
}

async function updateOwnedOperation(chromeApi, operationId, updater) {
  const current = await loadActiveOperation(chromeApi);
  if (current?.operationId !== operationId) {
    throw new Error('整理の操作記録を更新できませんでした。');
  }
  const next = updater(current);
  await chromeApi.storage.session.set({ [ACTIVE_OPERATION_STORAGE_KEY]: next });
  return next;
}

async function loadActiveOperation(chromeApi) {
  const data = await chromeApi.storage.session.get([ACTIVE_OPERATION_STORAGE_KEY]);
  return data[ACTIVE_OPERATION_STORAGE_KEY] || null;
}

async function loadUndoRecords(chromeApi, timestamp) {
  const data = await chromeApi.storage.session.get([UNDO_RECORDS_STORAGE_KEY]);
  const source = data[UNDO_RECORDS_STORAGE_KEY];
  const records = source && typeof source === 'object' ? { ...source } : {};
  let changed = false;
  for (const [key, record] of Object.entries(records)) {
    if (!record || Number(record.expiresAt) <= timestamp) {
      delete records[key];
      changed = true;
    }
  }
  if (changed) {
    await chromeApi.storage.session.set({ [UNDO_RECORDS_STORAGE_KEY]: records });
  }
  return records;
}

async function getRawUndoRecord(chromeApi, windowId) {
  const data = await chromeApi.storage.session.get([UNDO_RECORDS_STORAGE_KEY]);
  const source = data[UNDO_RECORDS_STORAGE_KEY];
  return source && typeof source === 'object' ? source[String(windowId)] || null : null;
}

function toPublicUndoState(record) {
  return {
    available: true,
    operationId: record.operationId,
    windowId: record.windowId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    summary: record.summary
  };
}

function createOperationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

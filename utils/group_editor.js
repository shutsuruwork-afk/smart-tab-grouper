import {
  loadManagedGroupRecords,
  saveManagedGroupRecords
} from './safe_organizer.js';

export const GROUP_TITLE_MAX_LENGTH = 80;
export const GROUP_COLORS = Object.freeze([
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange'
]);

export function normalizeGroupEdit(value = {}) {
  const title = String(value.title ?? '').trim();
  if (title.length > GROUP_TITLE_MAX_LENGTH) {
    throw validationError(`グループ名は${GROUP_TITLE_MAX_LENGTH}文字以内にしてください。`);
  }
  const color = String(value.color || 'grey');
  if (!GROUP_COLORS.includes(color)) {
    throw validationError('選択された色は使用できません。');
  }
  return {
    title,
    color,
    collapsed: value.collapsed === true
  };
}

export function createGroupEditFingerprint(group) {
  return {
    groupId: group?.id,
    windowId: group?.windowId,
    title: group?.title || '',
    color: group?.color || 'grey',
    collapsed: group?.collapsed === true,
    shared: group?.shared === true
  };
}

export function groupEditFingerprintsEqual(current, expected) {
  return JSON.stringify(current) === JSON.stringify(expected);
}

export async function editGroupSafely({
  chromeApi,
  windowId,
  groupId,
  expectedFingerprint,
  changes,
  now = () => Date.now(),
  operationHooks = {}
}) {
  if (!Number.isInteger(groupId)) throw staleGroupError();
  const desired = normalizeGroupEdit(changes);
  const current = await chromeApi.tabGroups.get(groupId).catch(() => null);
  if (!current || current.windowId !== windowId) throw staleGroupError();
  if (current.shared === true) throw sharedGroupError();

  const currentFingerprint = createGroupEditFingerprint(current);
  if (
    !expectedFingerprint
    || !groupEditFingerprintsEqual(currentFingerprint, expectedFingerprint)
  ) throw staleGroupError();

  const original = normalizeGroupEdit(current);
  if (sameEditableProperties(original, desired)) {
    return {
      success: true,
      changed: false,
      count: 0,
      undoData: emptyUndoData(windowId),
      message: 'グループの表示に変更はありません。'
    };
  }

  const storedRecords = await loadManagedGroupRecords(chromeApi);
  const managedWindowRecordsBefore = storedRecords
    .filter((record) => record.windowId === windowId)
    .map((record) => structuredClone(record));
  const edit = {
    groupId,
    original: { ...original, windowId },
    applied: { ...desired, windowId }
  };

  await operationHooks.onPrepared?.({
    windowId,
    plannedTabs: [],
    groupsBefore: [createGroupEditFingerprint(current)],
    groupEdits: [edit],
    managedWindowRecordsBefore
  });

  let updateApplied = false;
  try {
    await operationHooks.onBeforeMutation?.({
      type: 'group-update',
      windowId,
      groupId,
      expectedApplied: edit.applied,
      phase: 'pending'
    });
    const updated = await chromeApi.tabGroups.update(groupId, desired);
    updateApplied = Boolean(updated && sameEditableProperties(updated, desired));
    if (!updateApplied) throw new Error('グループの表示を変更できませんでした。');

    const nextRecords = storedRecords.map((record) =>
      record.windowId === windowId && record.groupId === groupId
        ? {
            ...record,
            title: desired.title,
            color: desired.color,
            lastSeenAt: now()
          }
        : record
    );
    await saveManagedGroupRecords(chromeApi, nextRecords);
  } catch (error) {
    const rollback = updateApplied
      ? await rollbackGroupEdit(chromeApi, groupId, desired, original)
      : { success: true, skipped: false, errors: [] };
    const failure = new Error(
      rollback.success
        ? 'グループの変更中に問題が発生したため、今回の変更を元に戻しました。'
        : 'グループの変更中に問題が発生し、元に戻せなかった可能性があります。'
    );
    failure.name = 'SafeGroupEditError';
    failure.cause = error;
    failure.rollback = rollback;
    throw failure;
  }

  const displayName = desired.title || '名称なし';
  return {
    success: true,
    changed: true,
    count: 1,
    group: createGroupEditFingerprint({ id: groupId, windowId, ...desired }),
    undoData: {
      windowId,
      originalTabs: [],
      assignedTabs: [],
      groupsBefore: [createGroupEditFingerprint(current)],
      editedGroups: [edit],
      createdGroupIds: [],
      managedWindowRecordsBefore,
      summary: {
        kind: 'group-edit',
        count: 1,
        groups: [],
        message: `「${displayName}」の表示を変更しました。`
      }
    },
    message: `「${displayName}」の表示を変更しました。`
  };
}

async function rollbackGroupEdit(chromeApi, groupId, applied, original) {
  const errors = [];
  try {
    const current = await chromeApi.tabGroups.get(groupId);
    if (!sameEditableProperties(current, applied)) {
      return { success: true, skipped: true, errors };
    }
    const restored = await chromeApi.tabGroups.update(groupId, original);
    if (!restored || !sameEditableProperties(restored, original)) {
      throw new Error('グループの表示を復元できませんでした。');
    }
  } catch (error) {
    errors.push(error);
  }
  return { success: errors.length === 0, skipped: false, errors };
}

function sameEditableProperties(group, expected) {
  return (group?.title || '') === (expected?.title || '')
    && (group?.color || 'grey') === (expected?.color || 'grey')
    && (group?.collapsed === true) === (expected?.collapsed === true);
}

function emptyUndoData(windowId) {
  return {
    windowId,
    originalTabs: [],
    assignedTabs: [],
    editedGroups: [],
    managedWindowRecordsBefore: [],
    summary: { kind: 'group-edit', count: 0, groups: [] }
  };
}

function staleGroupError() {
  const error = new Error('編集中にグループの状態が変わりました。もう一度開き直してください。');
  error.name = 'StaleGroupEditError';
  return error;
}

function sharedGroupError() {
  const error = new Error('共有タブグループは現在の編集対象外です。Chromeのタブバーから編集してください。');
  error.name = 'SharedGroupUnsupportedError';
  return error;
}

function validationError(message) {
  const error = new Error(message);
  error.name = 'GroupEditValidationError';
  return error;
}

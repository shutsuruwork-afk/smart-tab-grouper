import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGroupEditFingerprint,
  editGroupSafely,
  GROUP_TITLE_MAX_LENGTH,
  normalizeGroupEdit
} from '../utils/group_editor.js';
import { MANAGED_GROUPS_STORAGE_KEY } from '../utils/safe_organizer.js';
import {
  acquireOperationLease,
  appendOperationProgress,
  completeUndoRecord,
  prepareOperationJournal,
  recoverStaleOperation,
  undoLastOperation
} from '../utils/undo_manager.js';

test('グループ名を整形し、未対応色と長すぎる名前を拒否する', () => {
  assert.deepEqual(normalizeGroupEdit({
    title: '  調査  ',
    color: 'blue',
    collapsed: 1
  }), {
    title: '調査',
    color: 'blue',
    collapsed: false
  });
  assert.throws(() => normalizeGroupEdit({ color: 'teal' }), { name: 'GroupEditValidationError' });
  assert.throws(() => normalizeGroupEdit({
    title: 'a'.repeat(GROUP_TITLE_MAX_LENGTH + 1),
    color: 'grey'
  }), { name: 'GroupEditValidationError' });
});

test('名称・色・折りたたみ状態を一度に変更し、所有権表示も追従する', async () => {
  const chromeApi = createChromeFake({
    group: makeGroup(),
    records: [managedRecord()]
  });
  const expectedFingerprint = createGroupEditFingerprint(chromeApi.state.group);

  const result = await editGroupSafely({
    chromeApi,
    windowId: 7,
    groupId: 50,
    expectedFingerprint,
    changes: { title: '新しい開発', color: 'blue', collapsed: true },
    now: () => 1_000
  });

  assert.equal(result.changed, true);
  assert.deepEqual(editable(chromeApi.state.group), {
    title: '新しい開発',
    color: 'blue',
    collapsed: true
  });
  const [record] = chromeApi.state.local[MANAGED_GROUPS_STORAGE_KEY];
  assert.equal(record.title, '新しい開発');
  assert.equal(record.color, 'blue');
  assert.equal(record.categoryId, 'cat_dev');
  assert.equal(result.undoData.editedGroups.length, 1);
});

test('編集開始後に外部変更されたグループを上書きしない', async () => {
  const chromeApi = createChromeFake({ group: makeGroup(), records: [] });
  const expectedFingerprint = createGroupEditFingerprint(chromeApi.state.group);
  chromeApi.state.group.color = 'red';

  await assert.rejects(() => editGroupSafely({
    chromeApi,
    windowId: 7,
    groupId: 50,
    expectedFingerprint,
    changes: { title: '変更', color: 'blue', collapsed: false }
  }), { name: 'StaleGroupEditError' });
  assert.equal(chromeApi.state.group.color, 'red');
});

test('共有グループを編集しない', async () => {
  const chromeApi = createChromeFake({
    group: makeGroup({ shared: true }),
    records: []
  });

  await assert.rejects(() => editGroupSafely({
    chromeApi,
    windowId: 7,
    groupId: 50,
    expectedFingerprint: createGroupEditFingerprint(chromeApi.state.group),
    changes: { title: '変更', color: 'blue', collapsed: false }
  }), { name: 'SharedGroupUnsupportedError' });
  assert.equal(chromeApi.state.group.title, '開発');
});

test('所有権保存に失敗した場合はグループ表示を即時ロールバックする', async () => {
  const chromeApi = createChromeFake({
    group: makeGroup(),
    records: [managedRecord()]
  });
  chromeApi.state.failNextLocalSet = true;

  await assert.rejects(() => editGroupSafely({
    chromeApi,
    windowId: 7,
    groupId: 50,
    expectedFingerprint: createGroupEditFingerprint(chromeApi.state.group),
    changes: { title: '変更', color: 'blue', collapsed: true }
  }), { name: 'SafeGroupEditError' });
  assert.deepEqual(editable(chromeApi.state.group), {
    title: '開発',
    color: 'purple',
    collapsed: false
  });
});

test('グループ表示の変更をCtrl+Zで所有権情報ごと元に戻す', async () => {
  const chromeApi = createChromeFake({
    group: makeGroup(),
    records: [managedRecord()]
  });
  const now = () => 1_000;
  const lease = await acquireOperationLease(chromeApi, {
    windowId: 7,
    type: 'group-edit',
    now
  });
  const result = await editGroupSafely({
    chromeApi,
    windowId: 7,
    groupId: 50,
    expectedFingerprint: createGroupEditFingerprint(chromeApi.state.group),
    changes: { title: '新しい開発', color: 'green', collapsed: true },
    now,
    operationHooks: hooks(chromeApi, lease.operation.operationId, now)
  });
  await completeUndoRecord(chromeApi, {
    operationId: lease.operation.operationId,
    undoData: result.undoData,
    now
  });

  const undone = await undoLastOperation(chromeApi, 7, now);
  assert.equal(undone.restoredGroupCount, 1);
  assert.equal(undone.restoredCount, 0);
  assert.deepEqual(editable(chromeApi.state.group), {
    title: '開発',
    color: 'purple',
    collapsed: false
  });
  assert.equal(chromeApi.state.local[MANAGED_GROUPS_STORAGE_KEY][0].title, '開発');
});

test('編集後にユーザーが再変更したグループはCtrl+Zで上書きしない', async () => {
  const chromeApi = createChromeFake({ group: makeGroup(), records: [managedRecord()] });
  const now = () => 1_000;
  const lease = await acquireOperationLease(chromeApi, { windowId: 7, type: 'group-edit', now });
  const result = await editGroupSafely({
    chromeApi,
    windowId: 7,
    groupId: 50,
    expectedFingerprint: createGroupEditFingerprint(chromeApi.state.group),
    changes: { title: '拡張機能の変更', color: 'blue', collapsed: false },
    now,
    operationHooks: hooks(chromeApi, lease.operation.operationId, now)
  });
  await completeUndoRecord(chromeApi, {
    operationId: lease.operation.operationId,
    undoData: result.undoData,
    now
  });
  chromeApi.state.group.title = 'ユーザーの変更';

  const undone = await undoLastOperation(chromeApi, 7, now);
  assert.equal(undone.restoredGroupCount, 0);
  assert.equal(undone.skippedGroupCount, 1);
  assert.equal(chromeApi.state.group.title, 'ユーザーの変更');
  assert.equal(
    chromeApi.state.local[MANAGED_GROUPS_STORAGE_KEY][0].title,
    '拡張機能の変更'
  );
});

test('service workerが編集直後に止まっても期限後に元へ戻す', async () => {
  const chromeApi = createChromeFake({ group: makeGroup(), records: [] });
  const lease = await acquireOperationLease(chromeApi, {
    windowId: 7,
    type: 'group-edit',
    now: () => 0
  });
  await editGroupSafely({
    chromeApi,
    windowId: 7,
    groupId: 50,
    expectedFingerprint: createGroupEditFingerprint(chromeApi.state.group),
    changes: { title: '中断される変更', color: 'orange', collapsed: true },
    now: () => 0,
    operationHooks: hooks(chromeApi, lease.operation.operationId, () => 0)
  });

  const recovered = await recoverStaleOperation(chromeApi, () => 61_000);
  assert.equal(recovered.restoredGroupCount, 1);
  assert.deepEqual(editable(chromeApi.state.group), {
    title: '開発',
    color: 'purple',
    collapsed: false
  });
});

function hooks(chromeApi, operationId, now) {
  return {
    onPrepared: (prepared) => prepareOperationJournal(chromeApi, operationId, prepared, now),
    onBeforeMutation: (progress) => appendOperationProgress(chromeApi, operationId, progress, now)
  };
}

function makeGroup(overrides = {}) {
  return {
    id: 50,
    windowId: 7,
    title: '開発',
    color: 'purple',
    collapsed: false,
    shared: false,
    ...overrides
  };
}

function managedRecord() {
  return {
    windowId: 7,
    groupId: 50,
    categoryId: 'cat_dev',
    title: '開発',
    color: 'purple',
    memberHosts: ['github.com'],
    createdAt: 100,
    lastSeenAt: 200
  };
}

function editable(group) {
  return {
    title: group.title || '',
    color: group.color || 'grey',
    collapsed: group.collapsed === true
  };
}

function createChromeFake({ group, records }) {
  const state = {
    group: structuredClone(group),
    session: {},
    local: { [MANAGED_GROUPS_STORAGE_KEY]: structuredClone(records) },
    failNextLocalSet: false
  };
  const storageArea = (area) => ({
    async get() { return structuredClone(state[area]); },
    async set(value) {
      if (area === 'local' && state.failNextLocalSet) {
        state.failNextLocalSet = false;
        throw new Error('storage failed');
      }
      Object.assign(state[area], structuredClone(value));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[area][key];
    }
  });

  return {
    state,
    tabs: {
      async get() { throw new Error('No tab'); },
      async group() {},
      async ungroup() {},
      async move() {}
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      async get(groupId) {
        if (!state.group || state.group.id !== groupId) throw new Error('No group');
        return { ...state.group };
      },
      async update(groupId, changes) {
        if (!state.group || state.group.id !== groupId) return undefined;
        Object.assign(state.group, changes);
        return { ...state.group };
      }
    },
    storage: {
      session: storageArea('session'),
      local: storageArea('local')
    }
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acquireOperationLease,
  appendOperationProgress,
  completeUndoRecord,
  getUndoState,
  prepareOperationJournal,
  recoverStaleOperation,
  rollbackCompletedOperation,
  undoLastOperation,
  UNDO_TTL_MS
} from '../utils/undo_manager.js';
import { MANAGED_GROUPS_STORAGE_KEY } from '../utils/safe_organizer.js';

test('完了した整理はsessionから再表示でき、元の順序と未分類状態へ戻せる', async () => {
  const chromeApi = createChromeFake([
    tab(1, { index: 0, groupId: 101, url: 'https://example.com/a' }),
    tab(2, { index: 1, groupId: 101, url: 'https://example.com/b' })
  ]);
  chromeApi.state.local[MANAGED_GROUPS_STORAGE_KEY] = [{
    windowId: 7,
    groupId: 101,
    categoryId: 'cat_dev',
    title: '開発',
    color: 'purple'
  }];

  const lease = await acquireOperationLease(chromeApi, {
    windowId: 7,
    operationId: 'op-complete',
    now: () => 1_000
  });
  assert.equal(lease.acquired, true);
  const undo = await completeUndoRecord(chromeApi, {
    operationId: 'op-complete',
    now: () => 2_000,
    undoData: undoDataForTwoTabs()
  });

  assert.equal(undo.available, true);
  assert.equal((await getUndoState(chromeApi, 7, () => 2_500)).summary.count, 2);

  const result = await undoLastOperation(chromeApi, 7, () => 2_500);
  assert.equal(result.success, true);
  assert.equal(result.restoredCount, 2);
  assert.deepEqual(chromeApi.state.tabs.map((item) => item.groupId), [-1, -1]);
  assert.deepEqual(chromeApi.state.local[MANAGED_GROUPS_STORAGE_KEY], []);
  assert.equal(await getUndoState(chromeApi, 7, () => 2_500), null);
});

test('整理後にユーザーが別グループへ動かしたタブはCtrl+Zで上書きしない', async () => {
  const chromeApi = createChromeFake([
    tab(1, { index: 0, groupId: 999, url: 'https://example.com/a' }),
    tab(2, { index: 1, groupId: 101, url: 'https://example.com/b' })
  ]);
  await chromeApi.storage.session.set({
    smartTabGrouperUndoRecordsV1: {
      7: {
        version: 1,
        operationId: 'op-later-move',
        windowId: 7,
        createdAt: 1_000,
        expiresAt: 10_000,
        ...undoDataForTwoTabs()
      }
    }
  });

  const result = await undoLastOperation(chromeApi, 7, () => 2_000);
  assert.equal(result.restoredCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(chromeApi.state.tabs[0].groupId, 999);
  assert.equal(chromeApi.state.tabs[1].groupId, -1);
});

test('service workerが中断した操作は期限後にジャーナルから復元する', async () => {
  const chromeApi = createChromeFake([
    tab(1, { index: 0, groupId: 202, url: 'https://example.com/a' })
  ]);
  await acquireOperationLease(chromeApi, {
    windowId: 7,
    operationId: 'op-stale',
    now: () => 0
  });
  await prepareOperationJournal(chromeApi, 'op-stale', {
    windowId: 7,
    plannedTabs: [{
      tabId: 1,
      index: 0,
      groupId: -1,
      windowId: 7,
      url: 'https://example.com/a',
      title: 'A'
    }],
    groupsBefore: [],
    managedWindowRecordsBefore: []
  }, () => 0);
  await appendOperationProgress(chromeApi, 'op-stale', {
    windowId: 7,
    categoryId: 'cat_dev',
    targetGroupId: 202,
    tabIds: [1],
    createdGroupId: 202
  }, () => 0);

  const active = await recoverStaleOperation(chromeApi, () => 30_000);
  assert.equal(active.active, true);
  assert.equal(chromeApi.state.tabs[0].groupId, 202);

  const recovered = await recoverStaleOperation(chromeApi, () => 61_000);
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.restoredCount, 1);
  assert.equal(chromeApi.state.tabs[0].groupId, -1);
});

test('Undoは30分を過ぎると表示も実行もされない', async () => {
  const chromeApi = createChromeFake([]);
  chromeApi.state.session.smartTabGrouperUndoRecordsV1 = {
    7: {
      version: 1,
      operationId: 'expired',
      windowId: 7,
      createdAt: 1,
      expiresAt: 1 + UNDO_TTL_MS,
      summary: { count: 1, groups: [] }
    }
  };

  assert.equal(await getUndoState(chromeApi, 7, () => UNDO_TTL_MS + 2), null);
  assert.equal((await undoLastOperation(chromeApi, 7, () => UNDO_TTL_MS + 2)).success, false);
});

test('変更直後に中断して対象グループIDが未記録でも元の状態へ戻す', async () => {
  const chromeApi = createChromeFake([
    tab(1, { groupId: 202, url: 'https://example.com/a' })
  ]);
  await acquireOperationLease(chromeApi, {
    windowId: 7,
    operationId: 'op-pending',
    now: () => 0
  });
  await prepareOperationJournal(chromeApi, 'op-pending', {
    windowId: 7,
    plannedTabs: [{
      tabId: 1,
      index: 0,
      groupId: -1,
      windowId: 7,
      url: 'https://example.com/a',
      title: 'A'
    }],
    groupsBefore: [],
    managedWindowRecordsBefore: []
  }, () => 0);
  await appendOperationProgress(chromeApi, 'op-pending', {
    windowId: 7,
    categoryId: 'cat_dev',
    targetGroupId: null,
    tabIds: [1],
    phase: 'pending'
  }, () => 0);

  const recovered = await recoverStaleOperation(chromeApi, () => 61_000);
  assert.equal(recovered.restoredCount, 1);
  assert.equal(chromeApi.state.tabs[0].groupId, -1);
});

test('Undo記録済みの操作はleaseだけ残っても巻き戻さない', async () => {
  const chromeApi = createChromeFake([
    tab(1, { groupId: 101, url: 'https://example.com/a' })
  ]);
  await acquireOperationLease(chromeApi, {
    windowId: 7,
    operationId: 'op-committed',
    now: () => 0
  });
  await prepareOperationJournal(chromeApi, 'op-committed', {
    windowId: 7,
    plannedTabs: undoDataForTwoTabs().originalTabs.slice(0, 1),
    groupsBefore: [],
    managedWindowRecordsBefore: []
  }, () => 0);
  await appendOperationProgress(chromeApi, 'op-committed', {
    targetGroupId: 101,
    tabIds: [1]
  }, () => 0);
  chromeApi.state.session.smartTabGrouperUndoRecordsV1 = {
    7: {
      version: 1,
      operationId: 'op-committed',
      windowId: 7,
      createdAt: 1,
      expiresAt: 10,
      ...undoDataForTwoTabs()
    }
  };

  const recovered = await recoverStaleOperation(chromeApi, () => 61_000);
  assert.equal(recovered.committed, true);
  assert.equal(chromeApi.state.tabs[0].groupId, 101);
  assert.equal(chromeApi.state.session.smartTabGrouperActiveOperationV1, undefined);
});

test('0件の整理は以前のUndo履歴を消さない', async () => {
  const chromeApi = createChromeFake([]);
  chromeApi.state.session.smartTabGrouperUndoRecordsV1 = {
    7: {
      version: 1,
      operationId: 'previous',
      windowId: 7,
      createdAt: 1_000,
      expiresAt: 100_000,
      ...undoDataForTwoTabs()
    }
  };
  await acquireOperationLease(chromeApi, {
    windowId: 7,
    operationId: 'no-op',
    now: () => 2_000
  });
  const undo = await completeUndoRecord(chromeApi, {
    operationId: 'no-op',
    now: () => 3_000,
    undoData: {
      ...undoDataForTwoTabs(),
      summary: { count: 0, groups: [] },
      originalTabs: [],
      assignedTabs: []
    }
  });

  assert.equal(undo.operationId, 'previous');
  assert.equal((await getUndoState(chromeApi, 7, () => 4_000)).operationId, 'previous');
});

test('Undoのグループ解除が失敗したタブを復元済み件数に含めない', async () => {
  const chromeApi = createChromeFake([
    tab(1, { groupId: 101, url: 'https://example.com/a' }),
    tab(2, { index: 1, groupId: 101, url: 'https://example.com/b' })
  ]);
  chromeApi.tabs.ungroup = async () => { throw new Error('ungroup failed'); };
  chromeApi.state.session.smartTabGrouperUndoRecordsV1 = {
    7: {
      version: 1,
      operationId: 'op-failure-count',
      windowId: 7,
      createdAt: 1,
      expiresAt: 10_000,
      ...undoDataForTwoTabs()
    }
  };

  const result = await undoLastOperation(chromeApi, 7, () => 2_000);
  assert.equal(result.restoredCount, 0);
  assert.equal(result.errorCount, 2);
  assert.deepEqual(chromeApi.state.tabs.map((item) => item.groupId), [101, 101]);
});

test('Undo記録の保存に失敗した整理結果を即時ロールバックできる', async () => {
  const chromeApi = createChromeFake([
    tab(1, { groupId: 101, url: 'https://example.com/a' }),
    tab(2, { index: 1, groupId: 101, url: 'https://example.com/b' })
  ]);
  chromeApi.state.local[MANAGED_GROUPS_STORAGE_KEY] = [{
    windowId: 7,
    groupId: 101,
    categoryId: 'cat_dev',
    title: '開発',
    color: 'purple'
  }];

  const result = await rollbackCompletedOperation(chromeApi, undoDataForTwoTabs());
  assert.equal(result.restoredCount, 2);
  assert.deepEqual(chromeApi.state.tabs.map((item) => item.groupId), [-1, -1]);
  assert.deepEqual(chromeApi.state.local[MANAGED_GROUPS_STORAGE_KEY], []);
});

function undoDataForTwoTabs() {
  return {
    windowId: 7,
    originalTabs: [
      { tabId: 1, index: 0, groupId: -1, windowId: 7, url: 'https://example.com/a', title: 'A' },
      { tabId: 2, index: 1, groupId: -1, windowId: 7, url: 'https://example.com/b', title: 'B' }
    ],
    assignedTabs: [
      { tabId: 1, groupId: 101 },
      { tabId: 2, groupId: 101 }
    ],
    groupsBefore: [],
    createdGroupIds: [101],
    managedWindowRecordsBefore: [],
    summary: {
      count: 2,
      groups: [{ categoryId: 'cat_dev', name: '開発', color: 'purple', count: 2, tabs: [] }]
    }
  };
}

function tab(id, overrides = {}) {
  return {
    id,
    windowId: 7,
    index: id - 1,
    groupId: -1,
    pinned: false,
    url: `https://example.com/${id}`,
    title: `Tab ${id}`,
    ...overrides
  };
}

function createChromeFake(tabs) {
  const state = { tabs, session: {}, local: {} };
  const makeStorageArea = (area) => ({
    async get() { return { ...state[area] }; },
    async set(value) { Object.assign(state[area], structuredClone(value)); },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[area][key];
    }
  });

  return {
    state,
    tabGroups: { TAB_GROUP_ID_NONE: -1 },
    storage: {
      session: makeStorageArea('session'),
      local: makeStorageArea('local')
    },
    tabs: {
      async get(tabId) {
        const found = state.tabs.find((item) => item.id === tabId);
        if (!found) throw new Error('No tab');
        return { ...found };
      },
      async ungroup(tabIds) {
        for (const tabId of Array.isArray(tabIds) ? tabIds : [tabIds]) {
          const found = state.tabs.find((item) => item.id === tabId);
          if (found) found.groupId = -1;
        }
      },
      async group({ tabIds, groupId }) {
        for (const tabId of Array.isArray(tabIds) ? tabIds : [tabIds]) {
          const found = state.tabs.find((item) => item.id === tabId);
          if (found) found.groupId = groupId;
        }
        return groupId;
      },
      async move(tabId, { index }) {
        const found = state.tabs.find((item) => item.id === tabId);
        if (found) found.index = index;
        return found;
      }
    }
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGroupReorganizationPlan,
  prepareGroupReorganization,
  reorganizeGroupSafely
} from '../utils/group_reorganizer.js';
import { MANAGED_GROUPS_STORAGE_KEY } from '../utils/safe_organizer.js';
import {
  acquireOperationLease,
  appendOperationProgress,
  completeUndoRecord,
  prepareOperationJournal,
  undoLastOperation
} from '../utils/undo_manager.js';

const categories = [
  category('cat_dev', '開発', 'purple', ['github.com']),
  category('cat_search', '検索', 'cyan', ['google.com']),
  category('cat_news', 'ニュース', 'orange', ['bbc.com'])
];

test('元グループに対応する分類と判定不能タブは残し、明確な別分類だけを外へ出す', () => {
  const source = group(50, { title: '開発', color: 'purple' });
  const plan = buildGroupReorganizationPlan([
    tab(1, 0, 50, 'https://github.com/project'),
    tab(2, 1, 50, 'https://google.com/search?q=test'),
    tab(3, 2, 50, 'https://unknown.example/')
  ], source, categories, { groupUnmatchedAsOthers: true });

  assert.equal(plan.retainedCategoryId, 'cat_dev');
  assert.deepEqual(plan.retainedTabIds, [1, 3]);
  assert.equal(plan.movedCount, 1);
  assert.deepEqual(plan.items.map((item) => [item.category.id, item.tabIds]), [
    ['cat_search', [2]]
  ]);
});

test('分類名ではないグループは最大のまとまりを残して移動量を最小化する', () => {
  const source = group(50, { title: '調査中', color: 'blue' });
  const plan = buildGroupReorganizationPlan([
    tab(1, 0, 50, 'https://google.com/one'),
    tab(2, 1, 50, 'https://google.com/two'),
    tab(3, 2, 50, 'https://github.com/project'),
    tab(4, 3, 50, 'https://bbc.com/news')
  ], source, categories, {});

  assert.equal(plan.retainedCategoryId, 'cat_search');
  assert.deepEqual(plan.retainedTabIds, [1, 2]);
  assert.equal(plan.movedCount, 2);
  assert.equal(plan.targetGroupCount, 2);
});

test('結果が一分類だけならグループを作り直さない', () => {
  const source = group(50, { title: '一時置き場', color: 'grey' });
  const plan = buildGroupReorganizationPlan([
    tab(1, 0, 50, 'https://github.com/one'),
    tab(2, 1, 50, 'https://github.com/two')
  ], source, categories, {});

  assert.equal(plan.retainedCount, 2);
  assert.equal(plan.movedCount, 0);
  assert.equal(plan.targetGroupCount, 0);
});

test('再構成を一つのUndoで元グループと元順序へ戻す', async () => {
  const chromeApi = createChromeFake({
    tabs: [
      tab(1, 0, 50, 'https://github.com/project'),
      tab(2, 1, 50, 'https://bbc.com/news')
    ],
    groups: [group(50, { title: '開発', color: 'purple' })],
    records: []
  });
  const now = () => 1_000;
  const lease = await acquireOperationLease(chromeApi, {
    windowId: 7,
    type: 'reorganize-group',
    now
  });

  const result = await reorganizeGroupSafely({
    chromeApi,
    windowId: 7,
    sourceGroupId: 50,
    categories,
    settings: {},
    now,
    operationHooks: {
      onPrepared: (prepared) => prepareOperationJournal(
        chromeApi,
        lease.operation.operationId,
        prepared,
        now
      ),
      onBeforeMutation: (progress) => appendOperationProgress(
        chromeApi,
        lease.operation.operationId,
        progress,
        now
      ),
      onProgress: (progress) => appendOperationProgress(
        chromeApi,
        lease.operation.operationId,
        progress,
        now
      )
    }
  });
  await completeUndoRecord(chromeApi, {
    operationId: lease.operation.operationId,
    undoData: result.undoData,
    now
  });

  const moved = chromeApi.state.tabs.find((item) => item.id === 2);
  assert.notEqual(moved.groupId, 50);
  assert.equal(chromeApi.state.groups.find((item) => item.id === moved.groupId)?.title, 'ニュース');
  assert.equal(chromeApi.state.local[MANAGED_GROUPS_STORAGE_KEY].length, 1);

  const undone = await undoLastOperation(chromeApi, 7, now);
  assert.equal(undone.success, true);
  assert.equal(chromeApi.state.tabs.find((item) => item.id === 2).groupId, 50);
  assert.equal(chromeApi.state.tabs.find((item) => item.id === 2).index, 1);
  assert.deepEqual(chromeApi.state.local[MANAGED_GROUPS_STORAGE_KEY], []);
});

test('確認後に名称や内容が変わったグループは実行しない', async () => {
  const chromeApi = createChromeFake({
    tabs: [
      tab(1, 0, 50, 'https://github.com/project'),
      tab(2, 1, 50, 'https://bbc.com/news')
    ],
    groups: [group(50, { title: '開発', color: 'purple' })],
    records: []
  });
  const preview = await prepareGroupReorganization({
    chromeApi,
    windowId: 7,
    sourceGroupId: 50,
    categories,
    settings: {}
  });
  chromeApi.state.groups[0].title = 'ユーザーが変更';

  await assert.rejects(() => reorganizeGroupSafely({
    chromeApi,
    windowId: 7,
    sourceGroupId: 50,
    expectedFingerprint: preview.fingerprint,
    categories,
    settings: {}
  }), { name: 'StaleGroupReorganizationError' });
  assert.equal(chromeApi.state.tabs.every((item) => item.groupId === 50), true);
});

test('記録後にユーザーが動かしたタブを再構成で上書きしない', async () => {
  const chromeApi = createChromeFake({
    tabs: [
      tab(1, 0, 50, 'https://github.com/project'),
      tab(2, 1, 50, 'https://bbc.com/news'),
      tab(3, 2, 99, 'https://example.com/')
    ],
    groups: [
      group(50, { title: '開発', color: 'purple' }),
      group(99, { title: '手動', color: 'blue' })
    ],
    records: []
  });

  const result = await reorganizeGroupSafely({
    chromeApi,
    windowId: 7,
    sourceGroupId: 50,
    categories,
    settings: {},
    operationHooks: {
      onBeforeMutation() {
        chromeApi.state.tabs.find((item) => item.id === 2).groupId = 99;
      }
    }
  });

  assert.equal(result.count, 0);
  assert.equal(chromeApi.state.tabs.find((item) => item.id === 2).groupId, 99);
});

test('所有権を確認できる既存グループだけを移動先として再利用する', async () => {
  const chromeApi = createChromeFake({
    tabs: [
      tab(1, 0, 50, 'https://github.com/project'),
      tab(2, 1, 50, 'https://google.com/search?q=test'),
      tab(3, 2, 60, 'https://google.com/search?q=old')
    ],
    groups: [
      group(50, { title: '開発', color: 'purple' }),
      group(60, { title: '検索', color: 'cyan' })
    ],
    records: [{
      windowId: 7,
      groupId: 60,
      categoryId: 'cat_search',
      title: '検索',
      color: 'cyan',
      memberHosts: ['google.com'],
      createdAt: 100,
      lastSeenAt: 200
    }]
  });

  const result = await reorganizeGroupSafely({
    chromeApi,
    windowId: 7,
    sourceGroupId: 50,
    categories,
    settings: {},
    now: () => 1_000
  });

  assert.equal(result.createdGroups, 0);
  assert.equal(result.reusedGroups, 1);
  assert.equal(chromeApi.state.tabs.find((item) => item.id === 2).groupId, 60);
});

test('新規グループの設定に失敗した場合は移動済みタブも元へ戻す', async () => {
  const chromeApi = createChromeFake({
    tabs: [
      tab(1, 0, 50, 'https://github.com/project'),
      tab(2, 1, 50, 'https://bbc.com/news')
    ],
    groups: [group(50, { title: '開発', color: 'purple' })],
    records: []
  });
  chromeApi.tabGroups.update = async () => undefined;

  await assert.rejects(() => reorganizeGroupSafely({
    chromeApi,
    windowId: 7,
    sourceGroupId: 50,
    categories,
    settings: {}
  }), { name: 'SafeGroupReorganizationError' });

  assert.equal(chromeApi.state.tabs.every((item) => item.groupId === 50), true);
  assert.deepEqual(chromeApi.state.groups.map((item) => item.id), [50]);
});

test('共有タブグループは再構成しない', async () => {
  const chromeApi = createChromeFake({
    tabs: [
      tab(1, 0, 50, 'https://github.com/project'),
      tab(2, 1, 50, 'https://bbc.com/news')
    ],
    groups: [group(50, { title: '共有', color: 'purple', shared: true })],
    records: []
  });

  await assert.rejects(() => prepareGroupReorganization({
    chromeApi,
    windowId: 7,
    sourceGroupId: 50,
    categories,
    settings: {}
  }), { name: 'SharedGroupUnsupportedError' });
  assert.equal(chromeApi.state.tabs.every((item) => item.groupId === 50), true);
});

function category(id, name, color, domains) {
  return { id, name, color, domains, titleKeywords: [], enabled: true };
}

function tab(id, index, groupId, url) {
  return {
    id,
    windowId: 7,
    index,
    groupId,
    pinned: false,
    url,
    title: `Tab ${id}`
  };
}

function group(id, overrides = {}) {
  return {
    id,
    windowId: 7,
    title: '',
    color: 'grey',
    collapsed: false,
    ...overrides
  };
}

function createChromeFake({ tabs, groups, records }) {
  const state = {
    tabs: structuredClone(tabs),
    groups: structuredClone(groups),
    nextGroupId: 1_000,
    local: { [MANAGED_GROUPS_STORAGE_KEY]: structuredClone(records) },
    session: {}
  };

  function removeEmptyGroups() {
    state.groups = state.groups.filter((candidate) =>
      state.tabs.some((item) => item.groupId === candidate.id)
    );
  }

  return {
    state,
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      async query({ windowId } = {}) {
        return state.groups
          .filter((item) => !Number.isInteger(windowId) || item.windowId === windowId)
          .map((item) => ({ ...item }));
      },
      async update(groupId, changes) {
        const target = state.groups.find((item) => item.id === groupId);
        if (!target) return undefined;
        Object.assign(target, changes);
        return { ...target };
      }
    },
    tabs: {
      async query({ windowId } = {}) {
        return state.tabs
          .filter((item) => !Number.isInteger(windowId) || item.windowId === windowId)
          .map((item) => ({ ...item }));
      },
      async get(tabId) {
        const target = state.tabs.find((item) => item.id === tabId);
        if (!target) throw new Error('No tab');
        return { ...target };
      },
      async group({ tabIds, groupId, createProperties }) {
        let targetGroupId = groupId;
        if (Number.isInteger(targetGroupId)) {
          if (!state.groups.some((item) => item.id === targetGroupId)) throw new Error('No group');
        } else {
          targetGroupId = state.nextGroupId;
          state.nextGroupId += 1;
          state.groups.push(group(targetGroupId, { windowId: createProperties.windowId }));
        }
        for (const tabId of tabIds) {
          const target = state.tabs.find((item) => item.id === tabId);
          if (target) target.groupId = targetGroupId;
        }
        removeEmptyGroups();
        return targetGroupId;
      },
      async ungroup(tabIds) {
        for (const tabId of tabIds) {
          const target = state.tabs.find((item) => item.id === tabId);
          if (target) target.groupId = -1;
        }
        removeEmptyGroups();
      },
      async move(tabId, { index }) {
        const target = state.tabs.find((item) => item.id === tabId);
        if (target) target.index = index;
      }
    },
    storage: {
      local: storageArea(state, 'local'),
      session: storageArea(state, 'session')
    }
  };
}

function storageArea(state, area) {
  return {
    async get(keys) {
      const names = Array.isArray(keys) ? keys : Object.keys(state[area]);
      return Object.fromEntries(names
        .filter((key) => Object.hasOwn(state[area], key))
        .map((key) => [key, structuredClone(state[area][key])]));
    },
    async set(value) {
      Object.assign(state[area], structuredClone(value));
    },
    async remove(keys) {
      for (const key of keys) delete state[area][key];
    }
  };
}

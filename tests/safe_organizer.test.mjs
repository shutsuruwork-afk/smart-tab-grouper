import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MANAGED_GROUPS_STORAGE_KEY,
  organizeTabsSafely
} from '../utils/safe_organizer.js';

const category = {
  id: 'cat_dev',
  name: '開発',
  color: 'purple',
  enabled: true,
  domains: ['github.com'],
  titleKeywords: []
};

test('再起動でIDが変わっても所有ホストが一致する一意なグループを再利用する', async () => {
  const chromeApi = createChromeFake({
    tabs: [
      makeTab(1, { groupId: 901, url: 'https://github.com/old/project' }),
      makeTab(2, { index: 1, groupId: -1, url: 'https://github.com/new/project' })
    ],
    groups: [{ id: 901, windowId: 7, title: '開発', color: 'purple', collapsed: false }],
    records: [{
      windowId: 1,
      groupId: 101,
      categoryId: 'cat_dev',
      title: '開発',
      color: 'purple',
      memberHosts: ['github.com'],
      createdAt: 100,
      lastSeenAt: 200
    }]
  });

  const result = await organizeTabsSafely({
    chromeApi,
    windowId: 7,
    categories: [category],
    settings: {},
    now: () => 1_000
  });

  assert.equal(result.createdGroups, 0);
  assert.equal(result.reusedGroups, 1);
  assert.equal(chromeApi.state.tabs.find((tab) => tab.id === 2).groupId, 901);
  const [record] = chromeApi.state.local[MANAGED_GROUPS_STORAGE_KEY];
  assert.equal(record.windowId, 7);
  assert.equal(record.groupId, 901);
});

test('同名・同色グループを一意に照合できない場合は重複を作らず触らない', async () => {
  const chromeApi = createChromeFake({
    tabs: [
      makeTab(1, { groupId: 901, url: 'https://github.com/one' }),
      makeTab(2, { index: 1, groupId: 902, url: 'https://github.com/two' }),
      makeTab(3, { index: 2, groupId: -1, url: 'https://github.com/new' })
    ],
    groups: [
      { id: 901, windowId: 7, title: '開発', color: 'purple', collapsed: false },
      { id: 902, windowId: 7, title: '開発', color: 'purple', collapsed: false }
    ],
    records: [{
      windowId: 1,
      groupId: 101,
      categoryId: 'cat_dev',
      title: '開発',
      color: 'purple',
      memberHosts: ['github.com'],
      createdAt: 100,
      lastSeenAt: 200
    }]
  });

  const result = await organizeTabsSafely({
    chromeApi,
    windowId: 7,
    categories: [category],
    settings: {},
    now: () => 1_000
  });

  assert.equal(result.createdGroups, 0);
  assert.equal(result.reusedGroups, 0);
  assert.equal(result.ownershipConflicts, 1);
  assert.equal(chromeApi.state.tabs.find((tab) => tab.id === 3).groupId, -1);
});

test('別の開いているウィンドウの所有権は現在のウィンドウへ移さない', async () => {
  const chromeApi = createChromeFake({
    tabs: [
      makeTab(1, { groupId: 901, url: 'https://github.com/current/old' }),
      makeTab(2, { index: 1, groupId: -1, url: 'https://github.com/current/new' }),
      makeTab(3, { windowId: 8, groupId: 101, url: 'https://github.com/other/live' })
    ],
    groups: [
      { id: 901, windowId: 7, title: '開発', color: 'purple', collapsed: false },
      { id: 101, windowId: 8, title: '開発', color: 'purple', collapsed: false }
    ],
    records: [{
      windowId: 8,
      groupId: 101,
      categoryId: 'cat_dev',
      title: '開発',
      color: 'purple',
      memberHosts: ['github.com'],
      createdAt: 100,
      lastSeenAt: 200
    }]
  });

  const result = await organizeTabsSafely({
    chromeApi,
    windowId: 7,
    categories: [category],
    settings: {},
    now: () => 1_000
  });

  assert.equal(result.createdGroups, 1);
  assert.equal(result.reusedGroups, 0);
  const records = chromeApi.state.local[MANAGED_GROUPS_STORAGE_KEY];
  assert.equal(records.some((record) => record.windowId === 8 && record.groupId === 101), true);
  assert.equal(records.some((record) => record.windowId === 7 && record.groupId !== 901), true);
});

test('変更予定の記録に失敗した場合はタブへ触らない', async () => {
  const chromeApi = createChromeFake({
    tabs: [makeTab(1, { groupId: -1, url: 'https://github.com/new' })],
    groups: [],
    records: []
  });

  await assert.rejects(() => organizeTabsSafely({
    chromeApi,
    windowId: 7,
    categories: [category],
    settings: {},
    operationHooks: {
      async onBeforeMutation() {
        throw new Error('journal failed');
      }
    }
  }), { name: 'SafeOrganizeError' });

  assert.equal(chromeApi.state.tabs[0].groupId, -1);
  assert.equal(chromeApi.state.groups.length, 0);
});

function makeTab(id, overrides = {}) {
  return {
    id,
    windowId: 7,
    index: 0,
    groupId: -1,
    pinned: false,
    url: 'https://github.com/example',
    title: `Tab ${id}`,
    ...overrides
  };
}

function createChromeFake({ tabs, groups, records }) {
  const state = {
    tabs,
    groups,
    nextGroupId: 1_000,
    local: { [MANAGED_GROUPS_STORAGE_KEY]: structuredClone(records) }
  };
  return {
    state,
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      async query({ windowId }) {
        return state.groups
          .filter((group) => !Number.isInteger(windowId) || group.windowId === windowId)
          .map((group) => ({ ...group }));
      },
      async update(groupId, changes) {
        const group = state.groups.find((item) => item.id === groupId);
        if (!group) return undefined;
        Object.assign(group, changes);
        return { ...group };
      }
    },
    tabs: {
      async query({ windowId }) {
        return state.tabs
          .filter((tab) => !Number.isInteger(windowId) || tab.windowId === windowId)
          .map((tab) => ({ ...tab }));
      },
      async get(tabId) {
        const tab = state.tabs.find((item) => item.id === tabId);
        if (!tab) throw new Error('No tab');
        return { ...tab };
      },
      async group({ tabIds, groupId, createProperties }) {
        let target = groupId;
        if (!Number.isInteger(target)) {
          target = state.nextGroupId;
          state.nextGroupId += 1;
          state.groups.push({
            id: target,
            windowId: createProperties.windowId,
            title: '',
            color: 'grey',
            collapsed: false
          });
        }
        for (const tabId of tabIds) {
          state.tabs.find((tab) => tab.id === tabId).groupId = target;
        }
        return target;
      },
      async ungroup(tabIds) {
        for (const tabId of tabIds) state.tabs.find((tab) => tab.id === tabId).groupId = -1;
      },
      async move(tabId, { index }) {
        state.tabs.find((tab) => tab.id === tabId).index = index;
      }
    },
    storage: {
      local: {
        async get() { return structuredClone(state.local); },
        async set(value) { Object.assign(state.local, structuredClone(value)); }
      }
    }
  };
}

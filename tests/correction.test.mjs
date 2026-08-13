import test from 'node:test';
import assert from 'node:assert/strict';

import { correctTabClassification } from '../utils/correction.js';
import { MANAGED_GROUPS_STORAGE_KEY } from '../utils/safe_organizer.js';
import { undoLastOperation, UNDO_RECORDS_STORAGE_KEY } from '../utils/undo_manager.js';

const settingsStorage = globalThis.SmartTabSettingsStorage;

test('完了画面の修正で現在のタブ移動と最長一致ドメイン登録を一度に行う', async () => {
  const categories = [
    {
      id: 'cat_search', name: '検索', color: 'cyan', enabled: true,
      domains: ['google.com', 'mail.google.com'], titleKeywords: []
    },
    {
      id: 'cat_work', name: '仕事', color: 'blue', enabled: true,
      domains: [], titleKeywords: []
    }
  ];
  const chromeApi = createChromeFake(categories);

  const result = await correctTabClassification({
    chromeApi,
    windowId: 7,
    operationId: 'op-correct',
    tabId: 1,
    targetCategoryId: 'cat_work',
    categories,
    now: () => 2_000
  });

  assert.equal(result.success, true);
  assert.equal(chromeApi.state.tabs[0].groupId, 202);
  const savedCategories = await settingsStorage.loadCategories(chromeApi.storage.sync, []);
  assert.deepEqual(savedCategories[0].domains, ['google.com']);
  assert.deepEqual(savedCategories[1].domains, ['mail.google.com']);
  assert.equal(result.undo.summary.groups.find((group) => group.categoryId === 'cat_work').count, 1);

  const undone = await undoLastOperation(chromeApi, 7, () => 2_500);
  assert.equal(undone.success, true);
  assert.equal(chromeApi.state.tabs[0].groupId, -1);
});

test('完了後に手動で移動されたタブは修正対象にしない', async () => {
  const categories = [
    { id: 'cat_search', name: '検索', color: 'cyan', enabled: true, domains: ['google.com'] },
    { id: 'cat_work', name: '仕事', color: 'blue', enabled: true, domains: [] }
  ];
  const chromeApi = createChromeFake(categories);
  chromeApi.state.tabs[0].groupId = 999;

  await assert.rejects(
    correctTabClassification({
      chromeApi,
      windowId: 7,
      operationId: 'op-correct',
      tabId: 1,
      targetCategoryId: 'cat_work',
      categories,
      now: () => 2_000
    }),
    /後から変更/
  );
  assert.deepEqual(chromeApi.state.sync.categories, categories);
});

test('完了後に分類設定が更新された場合は古い結果から上書きしない', async () => {
  const categories = [
    { id: 'cat_search', name: '検索', color: 'cyan', enabled: true, domains: ['google.com'] },
    { id: 'cat_work', name: '仕事', color: 'blue', enabled: true, domains: [] }
  ];
  const chromeApi = createChromeFake(categories);
  const updated = structuredClone(categories);
  updated[1].domains.push('example.com');
  chromeApi.state.sync.categories = updated;

  await assert.rejects(correctTabClassification({
    chromeApi,
    windowId: 7,
    operationId: 'op-correct',
    tabId: 1,
    targetCategoryId: 'cat_work',
    categories,
    now: () => 2_000
  }), /分類設定が更新/);

  assert.deepEqual(await settingsStorage.loadCategories(chromeApi.storage.sync, []), updated);
  assert.equal(chromeApi.state.tabs[0].groupId, 101);
});

test('修正保存に失敗して元グループを再作成した場合は所有権IDも更新する', async () => {
  const categories = [
    { id: 'cat_search', name: '検索', color: 'cyan', enabled: true, domains: ['google.com'] },
    { id: 'cat_work', name: '仕事', color: 'blue', enabled: true, domains: [] }
  ];
  const chromeApi = createChromeFake(categories);
  chromeApi.storage.session.set = async () => { throw new Error('session write failed'); };
  chromeApi.tabs.group = async ({ tabIds, groupId, createProperties }) => {
    if (Number.isInteger(groupId)) {
      const group = chromeApi.state.groups.find((item) => item.id === groupId);
      if (!group) throw new Error('No group');
      for (const tabId of tabIds) chromeApi.state.tabs.find((tab) => tab.id === tabId).groupId = groupId;
      if (groupId === 202) {
        chromeApi.state.groups = chromeApi.state.groups.filter((item) => item.id !== 101);
      }
      return groupId;
    }
    const recreatedId = 303;
    chromeApi.state.groups.push({
      id: recreatedId,
      windowId: createProperties.windowId,
      title: '',
      color: 'grey'
    });
    for (const tabId of tabIds) chromeApi.state.tabs.find((tab) => tab.id === tabId).groupId = recreatedId;
    return recreatedId;
  };

  await assert.rejects(() => correctTabClassification({
    chromeApi,
    windowId: 7,
    operationId: 'op-correct',
    tabId: 1,
    targetCategoryId: 'cat_work',
    categories,
    now: () => 2_000
  }), /session write failed/);

  assert.equal(chromeApi.state.tabs[0].groupId, 303);
  const restored = chromeApi.state.local[MANAGED_GROUPS_STORAGE_KEY]
    .find((record) => record.categoryId === 'cat_search');
  assert.equal(restored.groupId, 303);
  assert.equal(chromeApi.state.groups.find((group) => group.id === 303).title, '検索');
  assert.deepEqual(await settingsStorage.loadCategories(chromeApi.storage.sync, []), categories);
});

test('修正のロールバック中も別画面の分類設定を上書きしない', async () => {
  const categories = [
    { id: 'cat_search', name: '検索', color: 'cyan', enabled: true, domains: ['google.com'] },
    { id: 'cat_work', name: '仕事', color: 'blue', enabled: true, domains: [] }
  ];
  const concurrent = structuredClone(categories);
  concurrent[0].domains.push('maps.google.com');
  const chromeApi = createChromeFake(categories);
  chromeApi.storage.session.set = async () => {
    await settingsStorage.saveCategories(chromeApi.storage.sync, concurrent);
    throw new Error('session write failed');
  };

  await assert.rejects(correctTabClassification({
    chromeApi,
    windowId: 7,
    operationId: 'op-correct',
    tabId: 1,
    targetCategoryId: 'cat_work',
    categories,
    now: () => 2_000
  }), /session write failed/);

  assert.deepEqual(await settingsStorage.loadCategories(chromeApi.storage.sync, []), concurrent);
});

function createChromeFake(categories) {
  const state = {
    tabs: [{
      id: 1,
      windowId: 7,
      index: 0,
      groupId: 101,
      pinned: false,
      url: 'https://mail.google.com/mail/u/0/',
      title: 'Inbox'
    }],
    groups: [
      { id: 101, windowId: 7, title: '検索', color: 'cyan', collapsed: false },
      { id: 202, windowId: 7, title: '仕事', color: 'blue', collapsed: false }
    ],
    session: {
      [UNDO_RECORDS_STORAGE_KEY]: {
        7: {
          version: 1,
          operationId: 'op-correct',
          windowId: 7,
          createdAt: 1_000,
          expiresAt: 20_000,
          originalTabs: [{
            tabId: 1,
            index: 0,
            groupId: -1,
            windowId: 7,
            url: 'https://mail.google.com/mail/u/0/',
            title: 'Inbox'
          }],
          assignedTabs: [{ tabId: 1, groupId: 101 }],
          groupsBefore: [],
          createdGroupIds: [101],
          managedWindowRecordsBefore: [],
          summary: {
            count: 1,
            groups: [{
              categoryId: 'cat_search',
              name: '検索',
              color: 'cyan',
              count: 1,
              tabs: [{
                tabId: 1,
                title: 'Inbox',
                url: 'https://mail.google.com/mail/u/0/'
              }]
            }]
          }
        }
      }
    },
    local: {
      [MANAGED_GROUPS_STORAGE_KEY]: [
        { windowId: 7, groupId: 101, categoryId: 'cat_search', title: '検索', color: 'cyan' },
        { windowId: 7, groupId: 202, categoryId: 'cat_work', title: '仕事', color: 'blue' }
      ]
    },
    sync: { categories: structuredClone(categories) }
  };
  const area = (name) => ({
    async get() { return structuredClone(state[name]); },
    async set(value) { Object.assign(state[name], structuredClone(value)); },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[name][key];
    }
  });
  return {
    state,
    storage: { session: area('session'), local: area('local'), sync: area('sync') },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      async query({ windowId }) {
        return state.groups.filter((group) => group.windowId === windowId).map((group) => ({ ...group }));
      },
      async update(groupId, changes) {
        const group = state.groups.find((item) => item.id === groupId);
        if (!group) return undefined;
        Object.assign(group, changes);
        return { ...group };
      }
    },
    tabs: {
      async get(tabId) {
        const found = state.tabs.find((tab) => tab.id === tabId);
        if (!found) throw new Error('No tab');
        return { ...found };
      },
      async group({ tabIds, groupId, createProperties }) {
        const targetGroupId = Number.isInteger(groupId) ? groupId : 303;
        if (!Number.isInteger(groupId)) {
          state.groups.push({ id: targetGroupId, windowId: createProperties.windowId, title: '', color: 'grey' });
        }
        for (const tabId of tabIds) state.tabs.find((tab) => tab.id === tabId).groupId = targetGroupId;
        return targetGroupId;
      },
      async ungroup(tabIds) {
        for (const tabId of tabIds) state.tabs.find((tab) => tab.id === tabId).groupId = -1;
      },
      async move(tabId, { index }) {
        state.tabs.find((tab) => tab.id === tabId).index = index;
      }
    }
  };
}

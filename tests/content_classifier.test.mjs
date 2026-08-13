import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTENT_CLASSIFICATION_MAX_TABS,
  classifyContentSignals,
  createContentAssistedClassifier,
  prepareContentClassifications
} from '../utils/content_classifier.js';
import { DEFAULT_SETTINGS } from '../utils/default_rules.js';

const categories = [
  {
    id: 'cat_dev',
    name: '開発',
    color: 'purple',
    enabled: true,
    domains: ['github.com'],
    titleKeywords: ['GitHub']
  },
  {
    id: 'cat_shopping',
    name: '買い物',
    color: 'yellow',
    enabled: true,
    domains: [],
    titleKeywords: []
  }
];

test('補助分類は既定でオフ', async () => {
  let permissionChecks = 0;
  const chromeApi = createChromeFake({ executeScript: async () => [] });
  chromeApi.permissions.contains = async () => {
    permissionChecks += 1;
    return true;
  };

  const result = await prepareContentClassifications({
    chromeApi,
    tabs: [],
    categories,
    settings: DEFAULT_SETTINGS
  });

  assert.equal(DEFAULT_SETTINGS.contentClassificationEnabled, false);
  assert.equal(result.status, 'disabled');
  assert.equal(permissionChecks, 0);
});

test('説明と見出しに複数の根拠がある場合だけ分類する', () => {
  const result = classifyContentSignals({
    meta: 'JavaScript API reference for developers',
    headings: 'Source code examples',
    body: ''
  }, categories);

  assert.equal(result.categoryId, 'cat_dev');
  assert.ok(result.confidence >= 0.8);
  assert.equal(classifyContentSignals({ meta: 'JavaScript', headings: '', body: '' }, categories), null);
});

test('二つの分類が拮抗する場合は決めつけない', () => {
  const ambiguous = [
    { id: 'first', name: 'A', enabled: true, contentKeywords: ['alpha', 'beta'] },
    { id: 'second', name: 'B', enabled: true, contentKeywords: ['alpha', 'beta'] }
  ];
  assert.equal(classifyContentSignals({ meta: 'alpha beta', headings: '', body: '' }, ambiguous), null);
});

test('登録ドメインを補助分類より優先し、最後にだけOthersを使う', () => {
  const assisted = new Map([[1, {
    categoryId: 'cat_shopping',
    url: 'https://github.com/example',
    title: 'Repository'
  }]]);
  const classify = createContentAssistedClassifier(assisted, { groupUnmatchedAsOthers: true });

  assert.equal(classify({ id: 1, url: 'https://github.com/example', title: 'Repository' }, categories).id, 'cat_dev');
  assert.equal(classify({ id: 2, url: 'https://unknown.example/', title: 'Unknown' }, categories).id, 'cat_others');
});

test('未解決が30件を超えたらページを読まずに補助分類を止める', async () => {
  let executions = 0;
  const chromeApi = createChromeFake({
    executeScript: async () => {
      executions += 1;
      return [];
    }
  });
  const tabs = Array.from({ length: CONTENT_CLASSIFICATION_MAX_TABS + 1 }, (_, index) => ({
    id: index + 1,
    index,
    windowId: 1,
    groupId: -1,
    pinned: false,
    url: `https://unknown${index}.example/`,
    title: `Unknown ${index}`
  }));

  const result = await prepareContentClassifications({
    chromeApi,
    tabs,
    categories,
    settings: { contentClassificationEnabled: true }
  });

  assert.equal(result.status, 'limit-exceeded');
  assert.equal(result.unresolved, 31);
  assert.equal(executions, 0);
});

test('説明だけで十分なときは本文を読まず分類する', async () => {
  const calledExtractors = [];
  const chromeApi = createChromeFake({
    executeScript: async ({ func }) => {
      calledExtractors.push(func.name);
      return [{ result: { meta: 'JavaScript API reference', headings: 'Source code', body: '' } }];
    }
  });
  const tab = {
    id: 7,
    index: 0,
    windowId: 1,
    groupId: -1,
    pinned: false,
    url: 'https://unknown.example/docs',
    title: 'Reference'
  };

  const result = await prepareContentClassifications({
    chromeApi,
    tabs: [tab],
    categories,
    settings: { contentClassificationEnabled: true }
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.classifications.get(tab.id).categoryId, 'cat_dev');
  assert.deepEqual(calledExtractors, ['extractMetadataSignals']);
});

test('全体の3秒予算を超えた候補は読み取らず未分類のまま残す', async () => {
  let executions = 0;
  let clockCalls = 0;
  const chromeApi = createChromeFake({
    executeScript: async () => {
      executions += 1;
      return [];
    }
  });
  const result = await prepareContentClassifications({
    chromeApi,
    tabs: [{
      id: 9,
      index: 0,
      windowId: 1,
      groupId: -1,
      pinned: false,
      url: 'https://slow.example/',
      title: 'Slow'
    }],
    categories,
    settings: { contentClassificationEnabled: true },
    monotonicNow: () => {
      clockCalls += 1;
      return clockCalls === 1 ? 0 : 3_100;
    }
  });

  assert.equal(result.status, 'budget-exhausted');
  assert.equal(result.attempted, 0);
  assert.equal(executions, 0);
});

function createChromeFake({ executeScript }) {
  let session = {};
  return {
    tabGroups: { TAB_GROUP_ID_NONE: -1 },
    permissions: { contains: async () => true },
    scripting: { executeScript },
    storage: {
      session: {
        get: async () => session,
        set: async (value) => { session = { ...session, ...value }; }
      }
    }
  };
}

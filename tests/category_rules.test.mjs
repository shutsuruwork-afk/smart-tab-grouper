import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyTab } from '../utils/classifier.js';
import { normalizeCategories, normalizeRuleSettings } from '../utils/category_rules.js';

test('enabledを省略した旧分類ルールも既定で有効として扱う', () => {
  const legacy = [{
    id: 'legacy-search',
    name: '検索',
    color: 'cyan',
    domains: [' Example.COM ', 'example.com'],
    titleKeywords: []
  }];

  const normalized = normalizeCategories(legacy);

  assert.equal(normalized[0].enabled, true);
  assert.deepEqual(normalized[0].domains, ['example.com']);
  assert.equal(classifyTab({ url: 'https://www.example.com/' }, normalized).id, 'legacy-search');
  assert.equal(legacy[0].enabled, undefined);
});

test('明示的に無効化した分類ルールは有効化し直さない', () => {
  const normalized = normalizeCategories([{
    id: 'disabled',
    name: '無効',
    color: 'red',
    enabled: false,
    domains: ['example.com']
  }]);

  assert.equal(normalized[0].enabled, false);
  assert.equal(classifyTab({ url: 'https://example.com/' }, normalized), null);
});

test('壊れた要素と重複IDを除きChrome非対応色を安全な色へ揃える', () => {
  const normalized = normalizeCategories([
    null,
    { id: '', name: 'IDなし' },
    { id: 'work', name: '', color: 'gray', domains: [42], titleKeywords: [null, ' Docs '] },
    { id: 'work', name: '重複', color: 'invalid' }
  ]);

  assert.deepEqual(normalized, [{
    id: 'work',
    name: 'work',
    color: 'grey',
    enabled: true,
    domains: ['42'],
    titleKeywords: ['Docs']
  }]);
});

test('分類配列がない場合だけ既定ルールを複製して使う', () => {
  const fallback = [{ id: 'default', name: '既定', color: 'blue', domains: [] }];
  const normalized = normalizeCategories(null, fallback);
  normalized[0].domains.push('example.com');

  assert.deepEqual(fallback[0].domains, []);
  assert.deepEqual(normalizeCategories([], fallback), []);
});

test('旧設定の欠損値と不正な型を安全な既定値へ揃える', () => {
  const defaults = {
    contentClassificationEnabled: false,
    groupUnmatchedAsOthers: false,
    strictDomainPriority: true,
    previewMode: false,
    exclusions: ['chrome://']
  };

  assert.deepEqual(normalizeRuleSettings(null, defaults), {
    ...defaults,
    autoGroupOnUpdate: false,
    groupPinnedTabs: false,
    groupByDomainAsFallback: false,
    collapseInactiveGroups: false,
    exclusions: ['chrome://']
  });
  assert.deepEqual(normalizeRuleSettings({
    contentClassificationEnabled: 'true',
    groupUnmatchedAsOthers: true,
    strictDomainPriority: false,
    previewMode: 1,
    exclusions: [null, ' Example.COM ', 'example.com']
  }, defaults), {
    ...defaults,
    autoGroupOnUpdate: false,
    contentClassificationEnabled: false,
    groupPinnedTabs: false,
    groupByDomainAsFallback: false,
    groupUnmatchedAsOthers: true,
    collapseInactiveGroups: false,
    strictDomainPriority: false,
    previewMode: false,
    exclusions: ['example.com']
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  confirmedTabStateMatches,
  createConfirmedTabStates,
  createOrganizationPreviewToken,
  organizationPreviewTokensEqual
} from '../utils/organize_preview.js';

const categories = [{
  id: 'cat_dev',
  name: '開発',
  color: 'purple',
  enabled: true,
  domains: ['github.com'],
  titleKeywords: ['GitHub']
}];
const settings = {
  contentClassificationEnabled: false,
  groupUnmatchedAsOthers: false,
  exclusions: []
};

test('同じ確認対象はタブの取得順が違っても同じトークンになる', async () => {
  const first = tab(1, { title: 'GitHub' });
  const second = tab(2, { url: 'https://example.com/' });
  const tokenA = await token([first, second]);
  const tokenB = await token([second, first]);

  assert.equal(organizationPreviewTokensEqual(tokenA, tokenB), true);
});

test('タブ・分類設定・権限の変更は確認トークンを無効にする', async () => {
  const original = await token([tab(1)]);
  const changes = [
    await token([tab(1), tab(2)]),
    await token([tab(1, { groupId: 4 })]),
    await token([tab(1)], [{ ...categories[0], enabled: false }]),
    await token([tab(1)], categories, { ...settings, groupUnmatchedAsOthers: true })
  ];

  for (const changed of changes) {
    assert.equal(organizationPreviewTokensEqual(original, changed), false);
  }
  assert.equal(organizationPreviewTokensEqual(
    await token([tab(1, { url: 'https://example.com/', title: 'GitHub' })]),
    await token([tab(1, { url: 'https://example.com/', title: 'Changed' })])
  ), false);

  const contentSettings = { ...settings, contentClassificationEnabled: true };
  assert.equal(organizationPreviewTokensEqual(
    await token([tab(1)], categories, contentSettings, false),
    await token([tab(1)], categories, contentSettings, true)
  ), false);
});

test('機能がオフの権限変更と対象外タブの題名変更では再確認を求めない', async () => {
  assert.equal(organizationPreviewTokensEqual(
    await token([tab(1)], categories, settings, false),
    await token([tab(1)], categories, settings, true)
  ), true);
  assert.equal(organizationPreviewTokensEqual(
    await token([tab(1, { pinned: true, title: 'First' })]),
    await token([tab(1, { pinned: true, title: 'Changed' })])
  ), true);
  assert.equal(organizationPreviewTokensEqual(
    await token([tab(1, { title: 'First' })]),
    await token([tab(1, { title: 'Changed' })])
  ), true);
});

test('確認済みタブ状態は並び順だけを許容し、分類に関わる変更を拒否する', () => {
  const expected = createConfirmedTabStates([tab(1)])[0];
  assert.equal(confirmedTabStateMatches(tab(1, { index: 99 }), expected), true);
  assert.equal(confirmedTabStateMatches(tab(1, { title: 'Changed' }), expected), false);
  assert.equal(confirmedTabStateMatches(tab(1, { pinned: true }), expected), false);
  assert.equal(confirmedTabStateMatches(tab(1, { groupId: 8 }), expected), false);

  const domainMatched = createConfirmedTabStates([tab(1)], -1, { categories, settings })[0];
  assert.equal(confirmedTabStateMatches(tab(1, { title: 'Changed' }), domainMatched, {
    categories,
    settings
  }), true);
});

test('確認後の無関係な題名が分類キーワードへ変わった場合は実行対象から外す', () => {
  const keywordCategories = [{
    ...categories[0],
    domains: [],
    titleKeywords: ['Build']
  }];
  const before = tab(1, { url: 'https://example.com/', title: 'Dashboard' });
  const expected = createConfirmedTabStates([before], -1, {
    categories: keywordCategories,
    settings
  })[0];

  assert.equal(confirmedTabStateMatches(
    { ...before, title: 'Build dashboard' },
    expected,
    { categories: keywordCategories, settings }
  ), false);
});

function token(
  tabs,
  tokenCategories = categories,
  tokenSettings = settings,
  contentAccessGranted = false
) {
  return createOrganizationPreviewToken({
    windowId: 7,
    tabs,
    categories: tokenCategories,
    settings: tokenSettings,
    contentAccessGranted,
    noneGroupId: -1
  });
}

function tab(id, overrides = {}) {
  return {
    id,
    windowId: 7,
    index: id - 1,
    groupId: -1,
    pinned: false,
    url: 'https://github.com/example',
    title: 'GitHub',
    ...overrides
  };
}

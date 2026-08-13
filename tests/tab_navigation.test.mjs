import test from 'node:test';
import assert from 'node:assert/strict';

await import('../utils/tab_navigation.js');

const {
  isSameOptionsPage,
  isReplaceableNewTab,
  chooseSettingsDestination
} = globalThis.SmartTabNavigation;

test('設定URLはqueryとhashが違っても同じ設定タブとして扱う', () => {
  const optionsUrl = 'chrome-extension://extension-id/options/options.html';
  assert.equal(isSameOptionsPage(
    'chrome-extension://extension-id/options/options.html?windowId=7#organizer',
    optionsUrl
  ), true);
  assert.equal(isSameOptionsPage(
    'chrome-extension://extension-id/options/other.html',
    optionsUrl
  ), false);
  assert.equal(isSameOptionsPage('not a url', optionsUrl), false);
});

test('通常のChrome新しいタブだけを設定タブへの置換対象にする', () => {
  assert.equal(isReplaceableNewTab(tab('chrome://newtab/')), true);
  assert.equal(isReplaceableNewTab(tab('chrome-search://local-ntp/local-ntp.html')), true);
  assert.equal(isReplaceableNewTab(tab('https://example.com/')), false);
  assert.equal(isReplaceableNewTab(tab('chrome://settings/')), false);
});

test('ピン留め・グループ化された新しいタブは置換しない', () => {
  assert.equal(isReplaceableNewTab(tab('chrome://newtab/', { pinned: true })), false);
  assert.equal(isReplaceableNewTab(tab('chrome://newtab/', { groupId: 12 })), false);
  assert.equal(isReplaceableNewTab({ id: null, url: 'chrome://newtab/', groupId: -1 }), false);
});

test('読み込み前のnewtabはpendingUrlから安全に認識する', () => {
  assert.equal(isReplaceableNewTab({
    id: 4,
    url: '',
    pendingUrl: 'chrome://newtab/',
    pinned: false,
    groupId: -1
  }), true);
});

test('既存設定タブがある場合は新しいタブより既存タブを優先する', () => {
  const result = chooseSettingsDestination([
    { ...tab('chrome://newtab/'), id: 1, windowId: 7, active: true },
    {
      id: 2,
      windowId: 8,
      active: false,
      pinned: false,
      groupId: -1,
      url: 'chrome-extension://extension-id/options/options.html#organizer'
    }
  ], 7, 'chrome-extension://extension-id/options/options.html');
  assert.equal(result.type, 'reuse');
  assert.equal(result.tab.id, 2);
});

test('既存設定タブがなければ対象ウィンドウのnewtabを置換する', () => {
  const result = chooseSettingsDestination([
    { ...tab('chrome://newtab/'), id: 3, windowId: 7, active: true },
    { ...tab('https://example.com/'), id: 4, windowId: 8, active: true }
  ], 7, 'chrome-extension://extension-id/options/options.html');
  assert.equal(result.type, 'replace');
  assert.equal(result.tab.id, 3);
});

test('通常ページから設定を開く場合は新規タブを選ぶ', () => {
  const result = chooseSettingsDestination([
    { ...tab('https://example.com/'), id: 5, windowId: 7, active: true }
  ], 7, 'chrome-extension://extension-id/options/options.html');
  assert.equal(result.type, 'create');
  assert.equal(result.tab, null);
});

function tab(url, overrides = {}) {
  return {
    id: 1,
    url,
    pinned: false,
    groupId: -1,
    ...overrides
  };
}

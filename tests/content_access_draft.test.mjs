import test from 'node:test';
import assert from 'node:assert/strict';

import {
  abandonContentAccessDraft,
  beginContentAccessDraft,
  commitContentAccessDraft,
  CONTENT_ACCESS_CLEANUP_KEY,
  CONTENT_ACCESS_DRAFTS_KEY,
  reconcileContentAccessDrafts,
  shouldAbandonContentAccessDraft
} from '../utils/content_access_draft.js';

const OPTIONS_URL = 'chrome-extension://extension-id/options/options.html';

test('未保存のサイトアクセスは設定タブが開いている間だけ保持する', async () => {
  const chromeApi = createChromeFake([
    tab(7, `${OPTIONS_URL}?preview=0#organizer`)
  ]);

  const started = await beginContentAccessDraft(chromeApi, 7, OPTIONS_URL);
  const reconciled = await reconcileContentAccessDrafts(chromeApi, OPTIONS_URL);

  assert.equal(started.tracked, true);
  assert.equal(reconciled.activeCount, 1);
  assert.equal(reconciled.staleCount, 0);
  assert.equal(chromeApi.state.permissionGranted, true);
  assert.equal(chromeApi.state.permissionRemoveCalls, 0);
});

test('保存せず設定タブを閉じると付与したサイトアクセスを回収する', async () => {
  const chromeApi = createChromeFake([tab(7, OPTIONS_URL)]);
  await beginContentAccessDraft(chromeApi, 7, OPTIONS_URL);
  chromeApi.state.tabs = [];

  const result = await abandonContentAccessDraft(chromeApi, 7, OPTIONS_URL);

  assert.equal(result.removed, true);
  assert.equal(result.permissionRemoved, true);
  assert.equal(chromeApi.state.permissionGranted, false);
  assert.equal(chromeApi.state.local[CONTENT_ACCESS_DRAFTS_KEY], undefined);
});

test('設定を保存した後はタブを閉じてもサイトアクセスを回収しない', async () => {
  const chromeApi = createChromeFake([tab(7, OPTIONS_URL)]);
  await beginContentAccessDraft(chromeApi, 7, OPTIONS_URL);
  chromeApi.state.sync.settings = { contentClassificationEnabled: true };

  const committed = await commitContentAccessDraft(chromeApi, 7);
  chromeApi.state.tabs = [];
  const reconciled = await reconcileContentAccessDrafts(chromeApi, OPTIONS_URL);

  assert.equal(committed.removed, true);
  assert.equal(reconciled.activeCount, 0);
  assert.equal(chromeApi.state.permissionGranted, true);
  assert.equal(chromeApi.state.permissionRemoveCalls, 0);
});

test('別の設定タブにも未保存の許可が残る間はサイトアクセスを回収しない', async () => {
  const chromeApi = createChromeFake([
    tab(7, OPTIONS_URL),
    tab(8, `${OPTIONS_URL}#organizer`)
  ]);
  await beginContentAccessDraft(chromeApi, 7, OPTIONS_URL);
  await beginContentAccessDraft(chromeApi, 8, OPTIONS_URL);
  chromeApi.state.tabs = [tab(8, `${OPTIONS_URL}#organizer`)];

  const first = await abandonContentAccessDraft(chromeApi, 7, OPTIONS_URL);
  assert.equal(first.permissionRemoved, false);
  assert.equal(chromeApi.state.permissionGranted, true);

  chromeApi.state.tabs = [];
  const last = await abandonContentAccessDraft(chromeApi, 8, OPTIONS_URL);
  assert.equal(last.permissionRemoved, true);
  assert.equal(chromeApi.state.permissionGranted, false);
});

test('複数タブが同時に許可しても未保存記録を失わない', async () => {
  const chromeApi = createChromeFake([
    tab(7, OPTIONS_URL),
    tab(8, `${OPTIONS_URL}#organizer`)
  ]);

  await Promise.all([
    beginContentAccessDraft(chromeApi, 7, OPTIONS_URL),
    beginContentAccessDraft(chromeApi, 8, OPTIONS_URL)
  ]);

  assert.deepEqual(
    Object.keys(chromeApi.state.local[CONTENT_ACCESS_DRAFTS_KEY]).sort(),
    ['7', '8']
  );
});

test('ブラウザー再起動をまたいだ未保存の許可は次回起動時に回収する', async () => {
  const chromeApi = createChromeFake([tab(7, OPTIONS_URL)]);
  chromeApi.state.local[CONTENT_ACCESS_DRAFTS_KEY] = {
    7: { sessionId: 'previous-browser-session', createdAt: 1 }
  };

  const result = await reconcileContentAccessDrafts(chromeApi, OPTIONS_URL);

  assert.equal(result.activeCount, 0);
  assert.equal(result.staleCount, 1);
  assert.equal(result.permissionRemoved, true);
  assert.equal(chromeApi.state.permissionGranted, false);
});

test('保存済み設定がオンなら古い未保存記録があっても権限を維持する', async () => {
  const chromeApi = createChromeFake([]);
  chromeApi.state.local[CONTENT_ACCESS_DRAFTS_KEY] = {
    7: { sessionId: 'previous-browser-session', createdAt: 1 }
  };
  chromeApi.state.sync.settings = { contentClassificationEnabled: true };

  const result = await reconcileContentAccessDrafts(chromeApi, OPTIONS_URL);

  assert.equal(result.staleCount, 1);
  assert.equal(result.permissionRemoved, false);
  assert.equal(result.cleanupDeferred, false);
  assert.equal(chromeApi.state.permissionGranted, true);
  assert.equal(chromeApi.state.permissionRemoveCalls, 0);
});

test('設定タブ以外へ移動した未保存の許可も回収対象にする', async () => {
  const chromeApi = createChromeFake([tab(7, OPTIONS_URL)]);
  await beginContentAccessDraft(chromeApi, 7, OPTIONS_URL);
  chromeApi.state.tabs = [tab(7, 'https://example.com/')];

  const result = await reconcileContentAccessDrafts(chromeApi, OPTIONS_URL);

  assert.equal(result.staleCount, 1);
  assert.equal(result.permissionRemoved, true);
  assert.equal(chromeApi.state.permissionGranted, false);
});

test('同じ設定URLの再読み込みでも古い未保存許可を破棄する', () => {
  assert.equal(shouldAbandonContentAccessDraft({ status: 'loading' }, OPTIONS_URL), true);
  assert.equal(shouldAbandonContentAccessDraft({ status: 'complete' }, OPTIONS_URL), false);
  assert.equal(shouldAbandonContentAccessDraft({ url: `${OPTIONS_URL}#organizer` }, OPTIONS_URL), false);
  assert.equal(shouldAbandonContentAccessDraft({ url: 'https://example.com/' }, OPTIONS_URL), true);
});

test('権限回収に失敗した場合は次のService Worker起動で再試行する', async () => {
  const chromeApi = createChromeFake([tab(7, OPTIONS_URL)]);
  await beginContentAccessDraft(chromeApi, 7, OPTIONS_URL);
  chromeApi.state.tabs = [];
  chromeApi.state.permissionRemoveSucceeds = false;

  const failed = await abandonContentAccessDraft(chromeApi, 7, OPTIONS_URL);
  assert.equal(failed.permissionRemoved, false);
  assert.equal(chromeApi.state.permissionGranted, true);
  assert.equal(chromeApi.state.local[CONTENT_ACCESS_CLEANUP_KEY], true);

  chromeApi.state.permissionRemoveSucceeds = true;
  const retried = await reconcileContentAccessDrafts(chromeApi, OPTIONS_URL);
  assert.equal(retried.permissionRemoved, true);
  assert.equal(retried.cleanupDeferred, false);
  assert.equal(chromeApi.state.permissionGranted, false);
  assert.equal(chromeApi.state.local[CONTENT_ACCESS_CLEANUP_KEY], undefined);
});

function tab(id, url) {
  return { id, url, pendingUrl: '', windowId: 1 };
}

function createChromeFake(tabs) {
  const state = {
    tabs,
    session: {},
    local: {},
    sync: { settings: { contentClassificationEnabled: false } },
    permissionGranted: true,
    permissionRemoveSucceeds: true,
    permissionRemoveCalls: 0
  };

  const storageArea = (name) => ({
    async get(keys) {
      const selected = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (Object.hasOwn(state[name], key)) selected[key] = structuredClone(state[name][key]);
      }
      return selected;
    },
    async set(value) {
      Object.assign(state[name], structuredClone(value));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[name][key];
    }
  });

  return {
    state,
    storage: {
      session: storageArea('session'),
      local: storageArea('local'),
      sync: storageArea('sync')
    },
    tabs: {
      async get(tabId) {
        const found = state.tabs.find((item) => item.id === tabId);
        if (!found) throw new Error('No tab');
        return structuredClone(found);
      },
      async query() {
        return structuredClone(state.tabs);
      }
    },
    permissions: {
      async contains() {
        return state.permissionGranted;
      },
      async remove() {
        state.permissionRemoveCalls += 1;
        if (!state.permissionRemoveSucceeds) return false;
        state.permissionGranted = false;
        return true;
      }
    }
  };
}

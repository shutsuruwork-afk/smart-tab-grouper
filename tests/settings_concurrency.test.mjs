import test from 'node:test';
import assert from 'node:assert/strict';

await import('../utils/settings_concurrency.js');

const { ACTIONS, classify, reconcile, deepEqual } = globalThis.SmartTabSettingsConcurrency;

test('編集していない画面は外部の設定変更を自動反映する', () => {
  assert.equal(classify({
    saved: snapshot(['github.com'], 'rose'),
    current: snapshot(['github.com'], 'rose'),
    incoming: snapshot(['github.com', 'gitlab.com'], 'rose'),
    dirty: false
  }), ACTIONS.RELOAD);
});

test('異なる設定領域の外部変更は編集中の内容を残して自動統合する', () => {
  const result = reconcile({
    saved: snapshot(['github.com'], 'rose'),
    current: snapshot(['github.com'], 'blue'),
    incoming: snapshot(['github.com', 'gitlab.com'], 'rose'),
    dirty: true
  });
  assert.equal(result.action, ACTIONS.MERGE);
  assert.equal(result.value.uiTheme.mode, 'blue');
  assert.deepEqual(result.value.categories[0].domains, ['github.com', 'gitlab.com']);
});

test('同じ設定領域を別々に変更した場合だけサイレント上書きを止める', () => {
  assert.equal(classify({
    saved: snapshot(['github.com'], 'rose'),
    current: snapshot(['github.com', 'local.dev'], 'rose'),
    incoming: snapshot(['github.com', 'remote.dev'], 'rose'),
    dirty: true
  }), ACTIONS.CONFLICT);
});

test('別画面が同じ内容を先に保存した場合は現在の編集を保存済みとして扱う', () => {
  const current = snapshot(['github.com'], 'blue');
  assert.equal(classify({
    saved: snapshot(['github.com'], 'rose'),
    current,
    incoming: structuredClone(current),
    dirty: true
  }), ACTIONS.CURRENT);
});

test('保存基準と同じ通知は外部変更として扱わない', () => {
  const saved = snapshot(['github.com'], 'rose');
  assert.equal(classify({
    saved,
    current: snapshot(['github.com'], 'blue'),
    incoming: structuredClone(saved),
    dirty: true
  }), ACTIONS.UNCHANGED);
});

test('オブジェクトのキー順だけが違う設定は同一と判定する', () => {
  assert.equal(deepEqual(
    { settings: { groupUnmatchedAsOthers: false, contentClassificationEnabled: true } },
    { settings: { contentClassificationEnabled: true, groupUnmatchedAsOthers: false } }
  ), true);
});

function snapshot(domains, mode) {
  return {
    categories: [{ id: 'dev', domains }],
    uiTheme: { mode, scheme: 'system' },
    settings: { contentClassificationEnabled: false, groupUnmatchedAsOthers: false }
  };
}

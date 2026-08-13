import test from 'node:test';
import assert from 'node:assert/strict';

await import('../utils/settings_history.js');

const { create } = globalThis.SmartTabSettingsHistory;
const clone = (value) => structuredClone(value);
const equals = (first, second) => JSON.stringify(first) === JSON.stringify(second);

test('自動保存後は直前の編集開始時点へ一度だけ戻せる', () => {
  const history = create({ clone, equals });
  history.beginEdit({ color: 'rose' });
  history.commit({ color: 'blue' });

  assert.equal(history.hasUndo(), true);
  assert.deepEqual(history.takeRevertTarget({
    dirty: false,
    savedSnapshot: { color: 'blue' }
  }), { color: 'rose' });
  assert.equal(history.hasUndo(), false);
});

test('保存待ちの変更は保存済み状態へ戻す', () => {
  const history = create({ clone, equals });
  history.beginEdit({ others: false });

  assert.deepEqual(history.takeRevertTarget({
    dirty: true,
    savedSnapshot: { others: false }
  }), { others: false });
});

test('保存中に次の変更が入っても編集開始時点を維持する', () => {
  const history = create({ clone, equals });
  history.beginEdit({ seed: '#111111' });
  history.commit({ seed: '#222222' }, { continueEditing: true });
  history.commit({ seed: '#333333' });

  assert.deepEqual(history.takeRevertTarget({
    dirty: false,
    savedSnapshot: { seed: '#333333' }
  }), { seed: '#111111' });
});

test('変更が元に戻った場合は過去のUndoを消さず編集基準だけ破棄する', () => {
  const history = create({ clone, equals });
  history.beginEdit({ value: 1 });
  history.commit({ value: 2 });
  history.beginEdit({ value: 2 });
  history.cancelEdit();

  assert.equal(history.hasUndo(), true);
  assert.deepEqual(history.takeRevertTarget({
    dirty: false,
    savedSnapshot: { value: 2 }
  }), { value: 1 });
});

test('外部更新時は古い編集履歴を破棄できる', () => {
  const history = create({ clone, equals });
  history.beginEdit({ value: 1 });
  history.commit({ value: 2 });
  history.clear();

  assert.equal(history.hasUndo(), false);
  assert.equal(history.takeRevertTarget({
    dirty: false,
    savedSnapshot: { value: 3 }
  }), null);
});

test('復元準備に失敗しても確定するまでは履歴を保持する', () => {
  const history = create({ clone, equals });
  history.beginEdit({ enabled: true });
  history.commit({ enabled: false });

  assert.deepEqual(history.getRevertTarget({
    dirty: false,
    savedSnapshot: { enabled: false }
  }), { enabled: true });
  assert.equal(history.hasUndo(), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';

await import('../utils/list_focus.js');

const { chooseKey } = globalThis.SmartTabListFocus;

test('再描画後も同じ項目があればその操作位置を保つ', () => {
  assert.equal(chooseKey(['ungrouped', '11', '12'], 11, 'ungrouped'), '11');
});

test('項目が消えた場合は新しい選択項目へ移す', () => {
  assert.equal(chooseKey(['ungrouped', '12'], '11', '12'), '12');
});

test('選択項目もなければ先頭へ移し、空一覧では移動しない', () => {
  assert.equal(chooseKey(['12', '13'], '11', '14'), '12');
  assert.equal(chooseKey([], '11', '12'), null);
});

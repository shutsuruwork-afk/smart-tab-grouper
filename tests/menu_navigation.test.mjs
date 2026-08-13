import test from 'node:test';
import assert from 'node:assert/strict';

await import('../utils/menu_navigation.js');

const { getNextIndex, getVerticalNextIndex } = globalThis.SmartTabMenuNavigation;

test('修正候補は上下左右の矢印キーで循環する', () => {
  assert.equal(getNextIndex('ArrowDown', 0, 3), 1);
  assert.equal(getNextIndex('ArrowRight', 2, 3), 0);
  assert.equal(getNextIndex('ArrowUp', 0, 3), 2);
  assert.equal(getNextIndex('ArrowLeft', 1, 3), 0);
});

test('HomeとEndは修正候補の端へ移動する', () => {
  assert.equal(getNextIndex('Home', 2, 4), 0);
  assert.equal(getNextIndex('End', 0, 4), 3);
});

test('対象外キーや空メニューではフォーカスを動かさない', () => {
  assert.equal(getNextIndex('Tab', 0, 3), null);
  assert.equal(getNextIndex('ArrowDown', 0, 0), null);
});

test('現在位置が不明なら矢印方向の端から開始する', () => {
  assert.equal(getNextIndex('ArrowDown', -1, 3), 0);
  assert.equal(getNextIndex('ArrowUp', -1, 3), 2);
});

test('縦一覧では上下とHome・Endだけを移動に使う', () => {
  assert.equal(getVerticalNextIndex('ArrowDown', 0, 3), 1);
  assert.equal(getVerticalNextIndex('ArrowUp', 0, 3), 2);
  assert.equal(getVerticalNextIndex('Home', 2, 3), 0);
  assert.equal(getVerticalNextIndex('End', 0, 3), 2);
  assert.equal(getVerticalNextIndex('ArrowLeft', 1, 3), null);
  assert.equal(getVerticalNextIndex('ArrowRight', 1, 3), null);
});

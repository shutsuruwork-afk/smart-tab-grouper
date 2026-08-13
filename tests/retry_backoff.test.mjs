import test from 'node:test';
import assert from 'node:assert/strict';

await import('../utils/retry_backoff.js');

const { create } = globalThis.SmartTabRetryBackoff;

test('指定した間隔だけ再試行し、その後は停止する', () => {
  const retry = create({ delays: [100, 250, 800] });

  assert.equal(retry.nextDelay(), 100);
  assert.equal(retry.nextDelay(), 250);
  assert.equal(retry.isExhausted(), false);
  assert.equal(retry.nextDelay(), 800);
  assert.equal(retry.isExhausted(), true);
  assert.equal(retry.nextDelay(), null);
});

test('成功または手動再確認時に先頭からやり直せる', () => {
  const retry = create({ delays: [120, 240] });

  assert.equal(retry.nextDelay(), 120);
  retry.reset();
  assert.equal(retry.nextDelay(), 120);
  assert.equal(retry.nextDelay(), 240);
});

test('不正な間隔を安全なタイマー値へ正規化する', () => {
  const retry = create({ delays: [-1, '30', Number.NaN] });

  assert.deepEqual(
    [retry.nextDelay(), retry.nextDelay(), retry.nextDelay()],
    [0, 30, 0]
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';

await import('../utils/action_expiry.js');

const {
  MAX_TIMER_DELAY_MS,
  TIMER_GRACE_MS,
  clampDuration,
  getDelay,
  isExpired
} = globalThis.SmartTabActionExpiry;

test('期限までの待機時間に短い猶予を加えて早すぎる失効を防ぐ', () => {
  assert.equal(getDelay(2_000, 1_000), 1_000 + TIMER_GRACE_MS);
  assert.equal(isExpired(2_000, 1_999), false);
  assert.equal(isExpired(2_000, 2_000), true);
});

test('期限切れは即時更新し、ブラウザーのタイマー上限を超えない', () => {
  assert.equal(getDelay(900, 1_000), 0);
  assert.equal(getDelay(Number.MAX_SAFE_INTEGER, 0), MAX_TIMER_DELAY_MS);
});

test('期限がない古い公開状態ではタイマーを作らない', () => {
  assert.equal(getDelay(undefined, 1_000), null);
  assert.equal(getDelay(null, 1_000), null);
  assert.equal(getDelay('', 1_000), null);
  assert.equal(getDelay('invalid', 1_000), null);
  assert.equal(isExpired(undefined, 1_000), false);
});

test('UI Labの30分と短縮値を待機時間用の5秒上限で潰さない', () => {
  const thirtyMinutes = 30 * 60 * 1000;
  assert.equal(clampDuration('1800000', thirtyMinutes, thirtyMinutes), thirtyMinutes);
  assert.equal(clampDuration('2000', thirtyMinutes, thirtyMinutes), 2_000);
  assert.equal(clampDuration('9999999', thirtyMinutes, thirtyMinutes), thirtyMinutes);
  assert.equal(clampDuration('invalid', thirtyMinutes, thirtyMinutes), thirtyMinutes);
});

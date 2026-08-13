(function exposeSmartTabActionExpiry(root) {
  const MAX_TIMER_DELAY_MS = 2_147_483_647;
  const TIMER_GRACE_MS = 25;

  function getDelay(expiresAt, now = Date.now()) {
    if (!isTimestampValue(expiresAt)) return null;
    const expiry = Number(expiresAt);
    const timestamp = Number(now);
    if (!Number.isFinite(expiry) || !Number.isFinite(timestamp)) return null;
    return Math.min(
      MAX_TIMER_DELAY_MS,
      Math.max(0, expiry - timestamp + TIMER_GRACE_MS)
    );
  }

  function isExpired(expiresAt, now = Date.now()) {
    if (!isTimestampValue(expiresAt)) return false;
    const expiry = Number(expiresAt);
    const timestamp = Number(now);
    return Number.isFinite(expiry)
      && Number.isFinite(timestamp)
      && expiry <= timestamp;
  }

  function clampDuration(value, fallback, maximum = fallback) {
    const safeFallback = Math.max(0, Number(fallback) || 0);
    const safeMaximum = Math.max(safeFallback, Number(maximum) || safeFallback);
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return safeFallback;
    return Math.min(Math.max(parsed, 0), safeMaximum);
  }

  function isTimestampValue(value) {
    return (typeof value === 'number' || typeof value === 'string')
      && String(value).trim() !== '';
  }

  root.SmartTabActionExpiry = Object.freeze({
    MAX_TIMER_DELAY_MS,
    TIMER_GRACE_MS,
    clampDuration,
    getDelay,
    isExpired
  });
})(globalThis);

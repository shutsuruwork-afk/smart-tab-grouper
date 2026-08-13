(function exposeSmartTabRetryBackoff(root) {
  function create({ delays = [1200, 2400, 5000] } = {}) {
    const retryDelays = Array.from(delays, (delay) => {
      const value = Number(delay);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    });
    let nextIndex = 0;

    function nextDelay() {
      if (nextIndex >= retryDelays.length) return null;
      const delay = retryDelays[nextIndex];
      nextIndex += 1;
      return delay;
    }

    function reset() {
      nextIndex = 0;
    }

    return Object.freeze({
      nextDelay,
      reset,
      isExhausted: () => nextIndex >= retryDelays.length
    });
  }

  root.SmartTabRetryBackoff = Object.freeze({ create });
})(globalThis);

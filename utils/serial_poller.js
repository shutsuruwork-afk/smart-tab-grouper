(function exposeSmartTabSerialPoller(root) {
  function create({
    load,
    onValue,
    shouldContinue,
    interval = 500,
    schedule = root.setTimeout?.bind(root),
    cancel = root.clearTimeout?.bind(root),
    onError = () => {}
  }) {
    if (typeof load !== 'function' || typeof onValue !== 'function') {
      throw new TypeError('load and onValue are required');
    }
    if (typeof shouldContinue !== 'function') {
      throw new TypeError('shouldContinue is required');
    }
    if (typeof schedule !== 'function' || typeof cancel !== 'function') {
      throw new TypeError('timer functions are required');
    }

    let active = false;
    let generation = 0;
    let timer = null;
    let inFlight = false;

    function clearScheduled() {
      if (timer === null) return;
      cancel(timer);
      timer = null;
    }

    function queue(expectedGeneration, delay = interval) {
      if (!active || inFlight || timer !== null || expectedGeneration !== generation) return;
      timer = schedule(() => {
        timer = null;
        void run(expectedGeneration);
      }, Math.max(0, Number(delay) || 0));
    }

    async function run(expectedGeneration) {
      if (!active || inFlight || expectedGeneration !== generation) return;
      inFlight = true;
      let value;
      let succeeded = false;
      try {
        value = await load();
        succeeded = true;
      } catch (error) {
        onError(error);
      } finally {
        inFlight = false;
      }

      if (!active) return;
      if (expectedGeneration !== generation) {
        queue(generation);
        return;
      }

      if (succeeded) {
        try {
          onValue(value);
        } catch (error) {
          active = false;
          generation += 1;
          onError(error);
          return;
        }
      }

      if (!active) return;
      if (expectedGeneration !== generation) {
        queue(generation);
        return;
      }
      if (!succeeded || shouldContinue(value)) {
        queue(expectedGeneration);
      } else {
        active = false;
      }
    }

    function start({ immediate = false } = {}) {
      active = true;
      generation += 1;
      clearScheduled();
      if (!inFlight) queue(generation, immediate ? 0 : interval);
    }

    function stop() {
      active = false;
      generation += 1;
      clearScheduled();
    }

    return Object.freeze({
      start,
      stop,
      isActive: () => active,
      isInFlight: () => inFlight
    });
  }

  root.SmartTabSerialPoller = Object.freeze({ create });
})(globalThis);

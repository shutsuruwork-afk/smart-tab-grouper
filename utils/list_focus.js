(function exposeSmartTabListFocus(root) {
  function chooseKey(availableKeys, previousKey, fallbackKey = null) {
    const keys = Array.from(availableKeys || [], normalizeKey).filter((key) => key !== null);
    const previous = normalizeKey(previousKey);
    const fallback = normalizeKey(fallbackKey);
    if (previous !== null && keys.includes(previous)) return previous;
    if (fallback !== null && keys.includes(fallback)) return fallback;
    return keys[0] ?? null;
  }

  function normalizeKey(value) {
    return value === null || value === undefined ? null : String(value);
  }

  root.SmartTabListFocus = Object.freeze({ chooseKey });
})(globalThis);

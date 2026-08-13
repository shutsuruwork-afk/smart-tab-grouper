(function exposeSmartTabMenuNavigation(root) {
  function getNextIndex(key, currentIndex, itemCount) {
    const count = Number.isInteger(itemCount) ? itemCount : 0;
    if (count <= 0) return null;

    const hasCurrent = Number.isInteger(currentIndex) && currentIndex >= 0;
    const current = hasCurrent ? Math.min(currentIndex, count - 1) : -1;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    if (key === 'ArrowDown' || key === 'ArrowRight') {
      return hasCurrent ? (current + 1) % count : 0;
    }
    if (key === 'ArrowUp' || key === 'ArrowLeft') {
      return hasCurrent ? (current - 1 + count) % count : count - 1;
    }
    return null;
  }

  function getVerticalNextIndex(key, currentIndex, itemCount) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return null;
    return getNextIndex(key, currentIndex, itemCount);
  }

  root.SmartTabMenuNavigation = Object.freeze({ getNextIndex, getVerticalNextIndex });
})(globalThis);

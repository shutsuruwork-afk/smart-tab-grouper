(function exposeSmartTabKeyboardShortcuts(root) {
  function isApplePlatform(navigatorLike = root.navigator) {
    const platform = navigatorLike?.userAgentData?.platform || navigatorLike?.platform || '';
    return /mac|iphone|ipad|ipod/i.test(String(platform));
  }

  function getUndoShortcut(navigatorLike = root.navigator) {
    const modifier = isApplePlatform(navigatorLike) ? '⌘' : 'Ctrl';
    return Object.freeze({
      modifier,
      key: 'Z',
      compact: `${modifier}+Z`,
      ariaKeyShortcuts: 'Control+Z Meta+Z'
    });
  }

  function matchesUndoShortcut(event) {
    if (!event || event.defaultPrevented || String(event.key || '').toLowerCase() !== 'z') {
      return false;
    }
    if (event.altKey || event.shiftKey) return false;

    // Accept the native primary modifier on every desktop platform. Requiring
    // exactly one avoids claiming unusual Ctrl+Cmd combinations.
    return Boolean(event.ctrlKey) !== Boolean(event.metaKey);
  }

  root.SmartTabKeyboardShortcuts = Object.freeze({
    isApplePlatform,
    getUndoShortcut,
    matchesUndoShortcut
  });
})(globalThis);

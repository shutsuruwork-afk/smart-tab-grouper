(function exposeSmartTabNavigation(root) {
  function isSameOptionsPage(rawUrl, optionsUrl) {
    try {
      const candidate = new URL(rawUrl || '');
      const expected = new URL(optionsUrl);
      return candidate.origin === expected.origin && candidate.pathname === expected.pathname;
    } catch (error) {
      return false;
    }
  }

  function isReplaceableNewTab(tab) {
    if (!Number.isInteger(tab?.id) || tab.pinned === true || Number(tab.groupId) >= 0) return false;
    const rawUrl = tab.pendingUrl || tab.url || '';
    try {
      const url = new URL(rawUrl);
      return (
        (url.protocol === 'chrome:' && url.hostname === 'newtab')
        || (
          url.protocol === 'chrome-search:'
          && url.hostname === 'local-ntp'
          && url.pathname === '/local-ntp.html'
        )
      );
    } catch (error) {
      return false;
    }
  }

  function chooseSettingsDestination(tabs, targetWindowId, optionsUrl) {
    const source = Array.isArray(tabs) ? tabs : [];
    const existing = source.find((tab) => isSameOptionsPage(tab?.url || tab?.pendingUrl, optionsUrl));
    if (Number.isInteger(existing?.id)) return { type: 'reuse', tab: existing };

    const active = source.find((tab) =>
      tab?.windowId === targetWindowId
      && tab.active === true
    );
    if (isReplaceableNewTab(active)) return { type: 'replace', tab: active };
    return { type: 'create', tab: null };
  }

  root.SmartTabNavigation = Object.freeze({
    isSameOptionsPage,
    isReplaceableNewTab,
    chooseSettingsDestination
  });
})(globalThis);

(function initializeSettingsConcurrency(global) {
  const ACTIONS = Object.freeze({
    CURRENT: 'current',
    UNCHANGED: 'unchanged',
    RELOAD: 'reload',
    MERGE: 'merge',
    CONFLICT: 'conflict'
  });
  const SECTION_KEYS = Object.freeze(['categories', 'uiTheme', 'settings']);

  function classify({ saved, current, incoming, dirty }) {
    return reconcile({ saved, current, incoming, dirty }).action;
  }

  function reconcile({ saved, current, incoming, dirty }) {
    if (deepEqual(incoming, current)) {
      return { action: ACTIONS.CURRENT, value: incoming, conflicts: [] };
    }
    if (deepEqual(incoming, saved)) {
      return { action: ACTIONS.UNCHANGED, value: current, conflicts: [] };
    }
    if (!dirty) {
      return { action: ACTIONS.RELOAD, value: incoming, conflicts: [] };
    }

    const value = {};
    const conflicts = [];
    let retainedLocalChange = false;
    for (const key of SECTION_KEYS) {
      const localChanged = !deepEqual(current[key], saved[key]);
      const remoteChanged = !deepEqual(incoming[key], saved[key]);
      if (localChanged && remoteChanged && !deepEqual(current[key], incoming[key])) {
        conflicts.push(key);
        value[key] = current[key];
      } else if (localChanged) {
        retainedLocalChange = true;
        value[key] = current[key];
      } else {
        value[key] = incoming[key];
      }
    }

    return conflicts.length > 0
      ? { action: ACTIONS.CONFLICT, value: current, conflicts }
      : {
          action: retainedLocalChange ? ACTIONS.MERGE : ACTIONS.CURRENT,
          value,
          conflicts: []
        };
  }

  function deepEqual(first, second) {
    if (Object.is(first, second)) return true;
    if (Array.isArray(first) || Array.isArray(second)) {
      if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) {
        return false;
      }
      return first.every((value, index) => deepEqual(value, second[index]));
    }
    if (!isPlainObject(first) || !isPlainObject(second)) return false;
    const firstKeys = Object.keys(first).sort();
    const secondKeys = Object.keys(second).sort();
    if (!deepEqual(firstKeys, secondKeys)) return false;
    return firstKeys.every((key) => deepEqual(first[key], second[key]));
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  global.SmartTabSettingsConcurrency = Object.freeze({ ACTIONS, classify, reconcile, deepEqual });
})(globalThis);

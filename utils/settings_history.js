(function exposeSmartTabSettingsHistory(root) {
  function create({ clone, equals }) {
    if (typeof clone !== 'function' || typeof equals !== 'function') {
      throw new TypeError('clone and equals are required');
    }

    let editBase = null;
    let undoSnapshot = null;

    function beginEdit(savedSnapshot) {
      if (editBase === null) editBase = clone(savedSnapshot);
    }

    function cancelEdit() {
      editBase = null;
    }

    function commit(savedSnapshot, { continueEditing = false } = {}) {
      if (editBase !== null && !equals(editBase, savedSnapshot)) {
        undoSnapshot = clone(editBase);
      }
      if (!continueEditing) editBase = null;
    }

    function hasUndo() {
      return undoSnapshot !== null;
    }

    function getRevertTarget({ dirty, savedSnapshot }) {
      const target = dirty
        ? editBase || savedSnapshot
        : undoSnapshot;
      return target === null ? null : clone(target);
    }

    function takeRevertTarget(context) {
      const target = getRevertTarget(context);
      clear();
      return target;
    }

    function clear() {
      editBase = null;
      undoSnapshot = null;
    }

    return Object.freeze({
      beginEdit,
      cancelEdit,
      commit,
      hasUndo,
      getRevertTarget,
      takeRevertTarget,
      clear
    });
  }

  root.SmartTabSettingsHistory = Object.freeze({ create });
})(globalThis);

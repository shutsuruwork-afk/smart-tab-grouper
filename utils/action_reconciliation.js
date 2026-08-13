(function initializeActionReconciliation(global) {
  const ACTIONS = Object.freeze({
    COMPLETED: 'completed',
    IN_PROGRESS: 'in-progress',
    UNCHANGED: 'unchanged',
    UNAVAILABLE: 'unavailable'
  });

  function reconcileMutationState(state, previousUndoOperationId = null) {
    if (!state?.success) return { action: ACTIONS.UNAVAILABLE };
    if (state.inProgress === true) return { action: ACTIONS.IN_PROGRESS };

    const undo = state.undo?.available === true ? state.undo : null;
    if (undo?.operationId && undo.operationId !== previousUndoOperationId) {
      return { action: ACTIONS.COMPLETED, undo };
    }
    return { action: ACTIONS.UNCHANGED, undo };
  }

  function isCorrectionApplied(undo, { operationId, tabId, targetCategoryId }) {
    if (
      undo?.available !== true
      || undo.operationId !== operationId
      || !Number.isInteger(tabId)
      || !targetCategoryId
    ) return false;
    return (undo.summary?.groups || []).some((group) =>
      group.categoryId === targetCategoryId
      && (group.tabs || []).some((tab) => tab.tabId === tabId)
    );
  }

  global.SmartTabActionReconciliation = Object.freeze({
    ACTIONS,
    reconcileMutationState,
    isCorrectionApplied
  });
})(globalThis);

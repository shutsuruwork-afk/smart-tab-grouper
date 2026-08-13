import test from 'node:test';
import assert from 'node:assert/strict';

await import('../utils/action_reconciliation.js');

const {
  ACTIONS,
  reconcileMutationState,
  isCorrectionApplied
} = globalThis.SmartTabActionReconciliation;

test('応答を失っても新しいUndo記録があれば操作完了と判定する', () => {
  const undo = { available: true, operationId: 'new-operation' };
  assert.deepEqual(
    reconcileMutationState({ success: true, inProgress: false, undo }, 'old-operation'),
    { action: ACTIONS.COMPLETED, undo }
  );
});

test('処理中の状態を再実行可能な失敗画面へ戻さない', () => {
  assert.deepEqual(
    reconcileMutationState({ success: true, inProgress: true, undo: null }, null),
    { action: ACTIONS.IN_PROGRESS }
  );
});

test('以前からあるUndo記録だけでは新しい操作の完了と決めつけない', () => {
  const undo = { available: true, operationId: 'same-operation' };
  assert.deepEqual(
    reconcileMutationState({ success: true, inProgress: false, undo }, 'same-operation'),
    { action: ACTIONS.UNCHANGED, undo }
  );
  assert.deepEqual(reconcileMutationState(null), { action: ACTIONS.UNAVAILABLE });
});

test('同じUndo記録でも対象タブが移動先へ入れば分類修正済みと判定する', () => {
  const undo = {
    available: true,
    operationId: 'correction-operation',
    summary: {
      groups: [{
        categoryId: 'work',
        tabs: [{ tabId: 42 }]
      }]
    }
  };
  assert.equal(isCorrectionApplied(undo, {
    operationId: 'correction-operation',
    tabId: 42,
    targetCategoryId: 'work'
  }), true);
  assert.equal(isCorrectionApplied(undo, {
    operationId: 'correction-operation',
    tabId: 42,
    targetCategoryId: 'search'
  }), false);
});

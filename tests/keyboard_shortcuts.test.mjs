import test from 'node:test';
import assert from 'node:assert/strict';

await import('../utils/keyboard_shortcuts.js');

const {
  isApplePlatform,
  getUndoShortcut,
  matchesUndoShortcut
} = globalThis.SmartTabKeyboardShortcuts;

test('Undo表示はmacOSではCommand、それ以外ではCtrlを使う', () => {
  assert.equal(isApplePlatform({ userAgentData: { platform: 'macOS' } }), true);
  assert.equal(isApplePlatform({ platform: 'MacIntel' }), true);
  assert.equal(isApplePlatform({ userAgentData: { platform: 'Windows' } }), false);
  assert.equal(getUndoShortcut({ userAgentData: { platform: 'macOS' } }).compact, '⌘+Z');
  assert.equal(getUndoShortcut({ platform: 'Win32' }).compact, 'Ctrl+Z');
  assert.equal(getUndoShortcut({ platform: 'Win32' }).ariaKeyShortcuts, 'Control+Z Meta+Z');
});

test('Ctrl+ZとCommand+Zの両方をUndoとして受け付ける', () => {
  assert.equal(matchesUndoShortcut(keyEvent({ ctrlKey: true })), true);
  assert.equal(matchesUndoShortcut(keyEvent({ metaKey: true })), true);
});

test('修飾キーの追加、既定処理済み、別キーはUndoにしない', () => {
  assert.equal(matchesUndoShortcut(keyEvent({ ctrlKey: true, shiftKey: true })), false);
  assert.equal(matchesUndoShortcut(keyEvent({ metaKey: true, altKey: true })), false);
  assert.equal(matchesUndoShortcut(keyEvent({ ctrlKey: true, metaKey: true })), false);
  assert.equal(matchesUndoShortcut(keyEvent({ ctrlKey: true, defaultPrevented: true })), false);
  assert.equal(matchesUndoShortcut(keyEvent({ key: 'x', ctrlKey: true })), false);
  assert.equal(matchesUndoShortcut(null), false);
});

function keyEvent(overrides = {}) {
  return {
    key: 'z',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    ...overrides
  };
}

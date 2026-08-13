import test from 'node:test';
import assert from 'node:assert/strict';

await import('../utils/theme.js');

test('Customテーマは全基準色でライト・ダーク双方のコントラストを保証する', () => {
  const theme = globalThis.SmartTabTheme;
  for (let red = 0; red <= 255; red += 17) {
    for (let green = 0; green <= 255; green += 17) {
      for (let blue = 0; blue <= 255; blue += 17) {
        const seed = `#${[red, green, blue]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('')}`;
        for (const mode of ['light', 'dark']) {
          const tokens = theme.getTokens({ mode: 'custom', seed }, mode).tokens;
          const surfaces = [
            tokens.surface,
            tokens.base,
            tokens.baseContainer,
            tokens.baseContainerElevated,
            tokens.header
          ];

          for (const surface of surfaces) {
            assertRatio(theme, tokens.onSurface, surface, 4.5, seed, mode, '本文');
            assertRatio(theme, tokens.onSurfaceSecondary, surface, 4.5, seed, mode, '補助文字');
            assertRatio(theme, tokens.error, surface, 4.5, seed, mode, 'エラー文字');
            assertRatio(theme, tokens.primary, surface, 3, seed, mode, '操作色');
            assertRatio(theme, tokens.outline, surface, 3, seed, mode, '枠線');
            assertRatio(theme, tokens.outlineSoft, surface, 3, seed, mode, '補助枠線');
          }
          assertRatio(theme, tokens.onPrimary, tokens.primary, 4.5, seed, mode, 'ボタン文字');
          assertRatio(
            theme,
            tokens.onTonalContainer,
            tokens.tonalContainer,
            4.5,
            seed,
            mode,
            'トーナル文字'
          );
        }
      }
    }
  }
});

function assertRatio(theme, foreground, background, minimum, seed, mode, role) {
  const ratio = theme.getContrastRatio(foreground, background);
  assert.ok(
    ratio >= minimum,
    `${seed} ${mode} ${role}: ${foreground}/${background} = ${ratio}`
  );
}

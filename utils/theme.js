(function initializeSmartTabTheme(globalObject) {
  'use strict';

  const DEFAULT_CONFIG = Object.freeze({
    mode: 'preset',
    preset: 'rose',
    seed: '#5b6f91'
  });

  const PRESET_META = Object.freeze({
    rose: Object.freeze({ label: 'ローズ', description: 'やわらかく落ち着いた色' }),
    blue: Object.freeze({ label: 'ブルー', description: 'Chromeらしい明快な色' }),
    green: Object.freeze({ label: 'グリーン', description: '目にやさしい自然な色' }),
    violet: Object.freeze({ label: 'バイオレット', description: '静かで上品な色' }),
    neutral: Object.freeze({ label: 'ニュートラル', description: '色味を抑えた標準色' })
  });

  const PRESETS = Object.freeze({
    rose: createPreset(
      {
        surface: '#fdfcfc', base: '#fbfafb', baseContainer: '#f5eff2',
        baseContainerElevated: '#fffbfa', header: '#f7e7ea', onSurface: '#201a1b',
        onSurfaceSecondary: '#66575a', primary: '#7d5260', onPrimary: '#ffffff',
        tonalContainer: '#f5e5e8', onTonalContainer: '#342024', outline: '#a39497',
        outlineSoft: '#e7dadd', error: '#ba1a1a'
      },
      {
        surface: '#181416', base: '#201b1d', baseContainer: '#292326',
        baseContainerElevated: '#332d2f', header: '#272023', onSurface: '#eee3e5',
        onSurfaceSecondary: '#d4c5c8', primary: '#e4b9c1', onPrimary: '#45242b',
        tonalContainer: '#56363d', onTonalContainer: '#f2dfe3', outline: '#9e9093',
        outlineSoft: '#51464a', error: '#ffb4ab'
      }
    ),
    blue: createPreset(
      {
        surface: '#fcfcfd', base: '#fafbfc', baseContainer: '#eef2f7',
        baseContainerElevated: '#fbfcfe', header: '#e3ebf6', onSurface: '#1f1f1f',
        onSurfaceSecondary: '#4c5054', primary: '#3d6399', onPrimary: '#ffffff',
        tonalContainer: '#e3ebf6', onTonalContainer: '#162b48', outline: '#858b94',
        outlineSoft: '#dce1e8', error: '#b3261e'
      },
      {
        surface: '#181b1f', base: '#1d2126', baseContainer: '#23282e',
        baseContainerElevated: '#2d3239', header: '#202832', onSurface: '#e5e6e8',
        onSurfaceSecondary: '#c6c9ce', primary: '#b5c9e7', onPrimary: '#22364f',
        tonalContainer: '#344a68', onTonalContainer: '#dfe8f5', outline: '#92979e',
        outlineSoft: '#454b53', error: '#f2b8b5'
      }
    ),
    green: createPreset(
      {
        surface: '#fbfcfb', base: '#fafbfa', baseContainer: '#edf3ee',
        baseContainerElevated: '#fbfdfb', header: '#deebe0', onSurface: '#1a201c',
        onSurfaceSecondary: '#4c554f', primary: '#456c51', onPrimary: '#ffffff',
        tonalContainer: '#e0ece2', onTonalContainer: '#203529', outline: '#858f88',
        outlineSoft: '#d9e1da', error: '#b3261e'
      },
      {
        surface: '#171b18', base: '#1c211e', baseContainer: '#222923',
        baseContainerElevated: '#2b332d', header: '#1f2922', onSurface: '#e0e7e1',
        onSurfaceSecondary: '#c2cbc4', primary: '#b0cfb8', onPrimary: '#253a2b',
        tonalContainer: '#36513d', onTonalContainer: '#dce9df', outline: '#909991',
        outlineSoft: '#454d47', error: '#ffb4ab'
      }
    ),
    violet: createPreset(
      {
        surface: '#fcfbfc', base: '#fbfafc', baseContainer: '#f2eef5',
        baseContainerElevated: '#fdfbfe', header: '#ece4f0', onSurface: '#211c23',
        onSurfaceSecondary: '#554f58', primary: '#6e577d', onPrimary: '#ffffff',
        tonalContainer: '#eee5f2', onTonalContainer: '#302638', outline: '#8f8592',
        outlineSoft: '#e2dbe5', error: '#ba1a1a'
      },
      {
        surface: '#19171a', base: '#201d22', baseContainer: '#28242b',
        baseContainerElevated: '#322e35', header: '#28222c', onSurface: '#e8e2e9',
        onSurfaceSecondary: '#cdc5cf', primary: '#d2c0dc', onPrimary: '#392c41',
        tonalContainer: '#4b3b55', onTonalContainer: '#e9e0ed', outline: '#969097',
        outlineSoft: '#4c474f', error: '#ffb4ab'
      }
    ),
    neutral: createPreset(
      {
        surface: '#fcfcfc', base: '#fbfbfb', baseContainer: '#f0f1f2',
        baseContainerElevated: '#fbfbfb', header: '#e8eaec', onSurface: '#1f1f1f',
        onSurfaceSecondary: '#4b4d50', primary: '#4f6684', onPrimary: '#ffffff',
        tonalContainer: '#e5eaf1', onTonalContainer: '#263445', outline: '#82868a',
        outlineSoft: '#dcdfe2', error: '#b3261e'
      },
      {
        surface: '#191a1b', base: '#202122', baseContainer: '#272829',
        baseContainerElevated: '#313234', header: '#282a2d', onSurface: '#e4e3e3',
        onSurfaceSecondary: '#c8c7c8', primary: '#bac7d8', onPrimary: '#2b3849',
        tonalContainer: '#3e4b5e', onTonalContainer: '#e2e7ee', outline: '#919396',
        outlineSoft: '#4a4b4d', error: '#ffb4ab'
      }
    )
  });

  const CSS_VARIABLES = Object.freeze({
    surface: ['--sys-color-surface', '--surface'],
    base: ['--sys-color-base'],
    baseContainer: ['--sys-color-base-container', '--surface-container'],
    baseContainerElevated: ['--sys-color-base-container-elevated', '--surface-elevated'],
    header: ['--sys-color-header', '--header'],
    onSurface: ['--sys-color-on-surface', '--on-surface'],
    onSurfaceSecondary: ['--sys-color-on-surface-secondary', '--on-surface-secondary'],
    primary: ['--sys-color-primary', '--primary'],
    onPrimary: ['--sys-color-on-primary', '--on-primary'],
    tonalContainer: ['--sys-color-tonal-container', '--tonal-container'],
    onTonalContainer: ['--sys-color-on-tonal-container', '--on-tonal-container'],
    outline: ['--sys-color-tonal-outline', '--outline'],
    outlineSoft: ['--outline-soft'],
    error: ['--sys-color-error', '--error'],
    shadow: ['--sys-color-shadow', '--shadow'],
    elevation: ['--sys-elevation-3', '--elevation-3'],
    hoverProminent: ['--sys-state-hover-on-prominent'],
    pressedProminent: ['--sys-state-pressed-on-prominent'],
    hoverSubtle: ['--sys-state-hover-on-subtle'],
    pressedSubtle: ['--sys-state-pressed-on-subtle']
  });

  function createPreset(light, dark) {
    return Object.freeze({
      light: Object.freeze(withStateTokens(light, 'light')),
      dark: Object.freeze(withStateTokens(dark, 'dark'))
    });
  }

  function withStateTokens(tokens, resolvedTheme) {
    const dark = resolvedTheme === 'dark';
    return {
      ...tokens,
      shadow: '#000000',
      elevation: dark
        ? '0 1px 2px rgb(0 0 0 / 32%), 0 4px 14px rgb(0 0 0 / 28%)'
        : '0 1px 2px rgb(0 0 0 / 16%), 0 4px 12px rgb(0 0 0 / 12%)',
      hoverProminent: dark ? 'rgb(32 26 27 / 6%)' : 'rgb(255 255 255 / 10%)',
      pressedProminent: dark ? 'rgb(32 26 27 / 12%)' : 'rgb(255 255 255 / 16%)',
      hoverSubtle: dark ? 'rgb(255 251 255 / 10%)' : 'rgb(32 26 27 / 6%)',
      pressedSubtle: dark ? 'rgb(255 251 255 / 16%)' : 'rgb(32 26 27 / 8%)'
    };
  }

  function normalizeConfig(value) {
    const seed = normalizeHex(value?.seed) || DEFAULT_CONFIG.seed;
    if (value?.mode === 'custom') {
      return { mode: 'custom', preset: 'custom', seed };
    }

    const preset = Object.hasOwn(PRESETS, value?.preset) ? value.preset : DEFAULT_CONFIG.preset;
    return { mode: 'preset', preset, seed };
  }

  function getTokens(config, requestedTheme = 'system') {
    const normalized = normalizeConfig(config);
    const resolvedTheme = resolveTheme(requestedTheme);
    const palette = normalized.mode === 'custom'
      ? createCustomPalette(normalized.seed)
      : PRESETS[normalized.preset];
    return { config: normalized, resolvedTheme, tokens: palette[resolvedTheme] };
  }

  function apply(config, options = {}) {
    const root = options.root || document.documentElement;
    const requestedTheme = options.theme || root.dataset.theme || 'system';
    const result = getTokens(config, requestedTheme);

    for (const [tokenName, variableNames] of Object.entries(CSS_VARIABLES)) {
      for (const variableName of variableNames) {
        root.style.setProperty(variableName, result.tokens[tokenName]);
      }
    }

    root.dataset.uiPalette = result.config.mode === 'custom' ? 'custom' : result.config.preset;
    root.dataset.resolvedTheme = result.resolvedTheme;
    return result;
  }

  function resolveTheme(requestedTheme) {
    if (requestedTheme === 'light' || requestedTheme === 'dark') return requestedTheme;
    return globalObject.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function createCustomPalette(seed) {
    const rgb = hexToRgb(seed) || hexToRgb(DEFAULT_CONFIG.seed);
    const { h, s, l } = rgbToHsl(rgb);
    const chroma = clamp(Math.max(s, 24), 24, 82);
    const softChroma = clamp(chroma * 0.24, 8, 22);
    const primaryLightness = clamp(l, 32, 45);
    const lightPrimary = colorFromHsl(h, Math.max(chroma, 40), primaryLightness);
    const darkPrimary = colorFromHsl(h, Math.max(chroma * 0.84, 34), 78);

    const light = {
      surface: colorFromHsl(h, 6, 99),
      base: colorFromHsl(h, 7, 98),
      baseContainer: colorFromHsl(h, softChroma, 94),
      baseContainerElevated: colorFromHsl(h, softChroma * 0.55, 98),
      header: colorFromHsl(h, clamp(chroma * 0.34, 12, 28), 92),
      onSurface: colorFromHsl(h, clamp(chroma * 0.18, 8, 18), 11),
      onSurfaceSecondary: colorFromHsl(h, clamp(chroma * 0.15, 7, 17), 34),
      primary: lightPrimary,
      onPrimary: readableText(lightPrimary),
      tonalContainer: colorFromHsl(h, clamp(chroma * 0.5, 18, 40), 91),
      onTonalContainer: colorFromHsl(h, clamp(chroma * 0.55, 22, 55), 18),
      outline: colorFromHsl(h, clamp(chroma * 0.2, 8, 18), 58),
      outlineSoft: colorFromHsl(h, clamp(chroma * 0.2, 8, 18), 85),
      error: '#ba1a1a'
    };

    const dark = {
      surface: colorFromHsl(h, clamp(chroma * 0.16, 8, 17), 9),
      base: colorFromHsl(h, clamp(chroma * 0.18, 8, 19), 11),
      baseContainer: colorFromHsl(h, clamp(chroma * 0.2, 9, 20), 14),
      baseContainerElevated: colorFromHsl(h, clamp(chroma * 0.2, 9, 20), 18),
      header: colorFromHsl(h, clamp(chroma * 0.2, 8, 18), 13),
      onSurface: colorFromHsl(h, clamp(chroma * 0.14, 6, 15), 90),
      onSurfaceSecondary: colorFromHsl(h, clamp(chroma * 0.15, 7, 17), 76),
      primary: darkPrimary,
      onPrimary: readableText(darkPrimary),
      tonalContainer: colorFromHsl(h, clamp(chroma * 0.42, 16, 36), 31),
      onTonalContainer: colorFromHsl(h, clamp(chroma * 0.34, 12, 30), 89),
      outline: colorFromHsl(h, clamp(chroma * 0.18, 7, 18), 60),
      outlineSoft: colorFromHsl(h, clamp(chroma * 0.2, 8, 20), 28),
      error: '#ffb4ab'
    };

    return {
      light: withStateTokens(enforcePaletteContrast(light, 'light'), 'light'),
      dark: withStateTokens(enforcePaletteContrast(dark, 'dark'), 'dark')
    };
  }

  function normalizeHex(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) return null;
    const hex = match[1].length === 3
      ? match[1].split('').map((character) => character + character).join('')
      : match[1];
    return `#${hex.toLowerCase()}`;
  }

  function hexToRgb(value) {
    const hex = normalizeHex(value);
    if (!hex) return null;
    return {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16)
    };
  }

  function rgbToHsl({ r, g, b }) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    let hue = 0;

    if (delta !== 0) {
      if (max === red) hue = ((green - blue) / delta) % 6;
      else if (max === green) hue = (blue - red) / delta + 2;
      else hue = (red - green) / delta + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }

    const lightness = (max + min) / 2;
    const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
    return { h: hue, s: saturation * 100, l: lightness * 100 };
  }

  function colorFromHsl(h, s, l) {
    const saturation = clamp(s, 0, 100) / 100;
    const lightness = clamp(l, 0, 100) / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const section = ((h % 360) + 360) % 360 / 60;
    const x = chroma * (1 - Math.abs((section % 2) - 1));
    let red = 0;
    let green = 0;
    let blue = 0;

    if (section < 1) [red, green] = [chroma, x];
    else if (section < 2) [red, green] = [x, chroma];
    else if (section < 3) [green, blue] = [chroma, x];
    else if (section < 4) [green, blue] = [x, chroma];
    else if (section < 5) [red, blue] = [x, chroma];
    else [red, blue] = [chroma, x];

    const adjustment = lightness - chroma / 2;
    return rgbToHex({
      r: Math.round((red + adjustment) * 255),
      g: Math.round((green + adjustment) * 255),
      b: Math.round((blue + adjustment) * 255)
    });
  }

  function rgbToHex({ r, g, b }) {
    const part = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
    return `#${part(r)}${part(g)}${part(b)}`;
  }

  function readableText(background) {
    const backgroundRgb = hexToRgb(background);
    const dark = '#000000';
    const light = '#ffffff';
    return contrastRatio(backgroundRgb, hexToRgb(light)) >= contrastRatio(backgroundRgb, hexToRgb(dark))
      ? light
      : dark;
  }

  function enforcePaletteContrast(tokens, mode) {
    const surfaces = [
      tokens.surface,
      tokens.base,
      tokens.baseContainer,
      tokens.baseContainerElevated,
      tokens.header
    ];
    const contrastDirection = mode === 'dark' ? '#ffffff' : '#000000';
    const primary = ensureContrast(tokens.primary, surfaces, 3, contrastDirection);
    return {
      ...tokens,
      onSurface: ensureContrast(tokens.onSurface, surfaces, 4.5, contrastDirection),
      onSurfaceSecondary: ensureContrast(
        tokens.onSurfaceSecondary,
        surfaces,
        4.5,
        contrastDirection
      ),
      primary,
      onPrimary: readableText(primary),
      onTonalContainer: ensureContrast(
        tokens.onTonalContainer,
        [tokens.tonalContainer],
        4.5,
        contrastDirection
      ),
      outline: ensureContrast(tokens.outline, surfaces, 3, contrastDirection),
      outlineSoft: ensureContrast(tokens.outlineSoft, surfaces, 3, contrastDirection),
      error: ensureContrast(tokens.error, surfaces, 4.5, contrastDirection)
    };
  }

  function ensureContrast(color, backgrounds, minimumRatio, fallbackColor) {
    const meetsMinimum = (candidate) => backgrounds.every((background) =>
      contrastRatio(hexToRgb(candidate), hexToRgb(background)) >= minimumRatio
    );
    if (meetsMinimum(color)) return color;

    for (let step = 1; step <= 20; step += 1) {
      const candidate = mixHex(color, fallbackColor, step / 20);
      if (meetsMinimum(candidate)) return candidate;
    }
    return fallbackColor;
  }

  function mixHex(first, second, amount) {
    const firstRgb = hexToRgb(first);
    const secondRgb = hexToRgb(second);
    return rgbToHex({
      r: firstRgb.r + (secondRgb.r - firstRgb.r) * amount,
      g: firstRgb.g + (secondRgb.g - firstRgb.g) * amount,
      b: firstRgb.b + (secondRgb.b - firstRgb.b) * amount
    });
  }

  function contrastRatio(first, second) {
    const firstLuminance = relativeLuminance(first);
    const secondLuminance = relativeLuminance(second);
    return (Math.max(firstLuminance, secondLuminance) + 0.05)
      / (Math.min(firstLuminance, secondLuminance) + 0.05);
  }

  function relativeLuminance({ r, g, b }) {
    const convert = (value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  globalObject.SmartTabTheme = Object.freeze({
    DEFAULT_CONFIG,
    PRESETS,
    PRESET_META,
    apply,
    getTokens,
    normalizeConfig,
    normalizeHex,
    getContrastRatio(first, second) {
      const firstRgb = hexToRgb(first);
      const secondRgb = hexToRgb(second);
      return firstRgb && secondRgb ? contrastRatio(firstRgb, secondRgb) : null;
    }
  });
})(globalThis);

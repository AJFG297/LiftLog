import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
// The package root pulls in its native module; the builder itself is pure.
import { createThemeFromSourceColor } from '@pchmn/expo-material3-theme/build/utils/createMaterial3Theme';
import {
  ACCENT_PRESETS,
  MIN_TEXT_CONTRAST,
  NEUTRALS,
  paperSchemeFromTokens,
  themeTokens,
  VERMILION,
  type ThemeTokens,
  type ThemeVariant,
} from './theme-tokens';

const VARIANTS: ThemeVariant[] = ['light', 'dark', 'trueBlack'];

// Plain WCAG 2 relative luminance straight from sRGB, independent of the HCT maths under test.
function luminance(hex: string): number {
  const int = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((int >> shift) & 0xff) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

function wcag(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Every pairing the design relies on for readable text. */
function legiblePairs(t: ThemeTokens): [string, string, string][] {
  return [
    ['onAccent on accent', t.onAccent, t.accent],
    ['accentInk on card', t.accentInk, t.card],
    ['accentInk on bg', t.accentInk, t.bg],
    ['accentSoftInk on accentSoft', t.accentSoftInk, t.accentSoft],
    ['invAccent on inverse', t.invAccent, t.inverse],
  ];
}

function expectLegible(source: string) {
  for (const variant of VARIANTS) {
    const tokens = themeTokens(source, variant);
    for (const [name, fg, bg] of legiblePairs(tokens)) {
      expect(wcag(fg, bg), `${source} ${variant}: ${name} (${fg} on ${bg})`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  }
}

const hexArb = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, '0')}`);

describe('themeTokens', () => {
  it.each(ACCENT_PRESETS.map((p) => [p.key, p.seed]))('keeps the %s preset legible', (_key, seed) => {
    expectLegible(seed);
  });

  it('keeps any picked colour legible', () => {
    fc.assert(
      fc.property(hexArb, (source) => expectLegible(source)),
      { numRuns: 50 },
    );
  });

  it('handles the extremes: white, black, grey, and bright hues that must be pulled down', () => {
    for (const source of ['#FFFFFF', '#000000', '#808080', '#FFFF00', '#00FFFF', '#00FF00', '#FF00FF']) {
      expectLegible(source);
    }
  });

  it('comes out close to the canvas for the default vermilion', () => {
    const canvas = { light: '#C2451E', dark: '#F08A64' };
    const light = themeTokens(VERMILION, 'light');
    const dark = themeTokens(VERMILION, 'dark');
    const distance = (a: string, b: string) => {
      const x = parseInt(a.slice(1), 16);
      const y = parseInt(b.slice(1), 16);
      return Math.max(...[16, 8, 0].map((s) => Math.abs(((x >> s) & 0xff) - ((y >> s) & 0xff))));
    };
    expect(distance(light.accent, canvas.light)).toBeLessThanOrEqual(6);
    expect(distance(dark.accentInk, canvas.dark)).toBeLessThanOrEqual(12);
  });

  it('keeps the neutral text scale legible on its own surfaces', () => {
    for (const variant of VARIANTS) {
      const n = NEUTRALS[variant];
      for (const surface of [n.bg, n.card]) {
        expect(wcag(n.ink, surface)).toBeGreaterThanOrEqual(7);
        expect(wcag(n.muted, surface)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
      expect(wcag(n.inverseInk, n.inverse)).toBeGreaterThanOrEqual(7);
    }
  });

  it('keeps white legible on the failure fill in both modes', () => {
    for (const variant of VARIANTS) {
      const t = themeTokens(VERMILION, variant);
      expect(wcag(t.onFailure, t.failure)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });
});

describe('paperSchemeFromTokens', () => {
  it('gives Paper a primary that works both as a fill and as text', () => {
    fc.assert(
      fc.property(hexArb, fc.constantFrom(...VARIANTS), (source, variant) => {
        const isDark = variant !== 'light';
        const tokens = themeTokens(source, variant);
        const base = createThemeFromSourceColor(source)[isDark ? 'dark' : 'light'];
        const scheme = paperSchemeFromTokens(tokens, base, isDark);
        expect(wcag(scheme.onPrimary, scheme.primary)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
        expect(wcag(scheme.primary, scheme.background)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
        expect(wcag(scheme.primary, scheme.surfaceContainer)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
        // Contained Cards, where most unconverted screens put accent text and buttons.
        expect(wcag(scheme.primary, scheme.surfaceVariant)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
        expect(wcag(scheme.onSurface, scheme.surfaceContainerHighest)).toBeGreaterThanOrEqual(7);
        expect(wcag(scheme.onSurfaceVariant, scheme.surfaceContainerHighest)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
        expect(wcag(scheme.onPrimaryContainer, scheme.primaryContainer)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }),
      { numRuns: 50 },
    );
  });
});

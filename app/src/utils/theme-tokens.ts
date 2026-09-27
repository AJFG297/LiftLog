import { argbFromHex, Contrast, Hct, hexFromArgb } from '@material/material-color-utilities';
import type { Material3Scheme } from '@pchmn/expo-material3-theme';
import type { HexColor } from '@/utils/color';

/**
 * The "Clarity" palette (docs/plans/redesign.md, D2): a fixed warm neutral scale per mode plus one
 * accent family generated from the colour the user picks. Redesigned screens read these tokens; the
 * Paper scheme for unconverted screens is mapped from them in `paperSchemeFromTokens`.
 */

export type ThemeVariant = 'light' | 'dark' | 'trueBlack';

export interface NeutralTokens {
  /** Page background. */
  bg: HexColor;
  /** Cards and raised rows. */
  card: HexColor;
  /** Hairline borders and dividers, from faintest to strongest. */
  line: HexColor;
  line2: HexColor;
  line3: HexColor;
  /** Primary text. */
  ink: HexColor;
  /** Secondary text; still ≥ 4.5:1 on `bg` and `card`. */
  muted: HexColor;
  /** Tertiary text and disabled icons. Decorative only: below 4.5:1. */
  faint: HexColor;
  /** Placeholder values (today's targets in an untouched field). */
  placeholder: HexColor;
  /** Progress bar and slider tracks. */
  track: HexColor;
  /** Number pad background and its keys. */
  keypad: HexColor;
  keypadKey: HexColor;
  /** Segmented control background. */
  segment: HexColor;
  /** Inverted surfaces (toasts, the in-progress bar): a dark slab in light mode, a light one in dark. */
  inverse: HexColor;
  inverseInk: HexColor;
  inverseMuted: HexColor;
  inverseTrack: HexColor;
  inverseRaised: HexColor;
  inverseRaised2: HexColor;
}

export interface AccentTokens {
  /** Filled buttons, the active tab, selected chips. White text on it is ≥ 4.5:1. */
  accent: HexColor;
  /** Text on `accent`. */
  onAccent: HexColor;
  /** Accent-coloured text and icons. ≥ 4.5:1 on `card` and `bg`. */
  accentInk: HexColor;
  /** Tinted backgrounds (the current set row, a PR badge) and the text on them. */
  accentSoft: HexColor;
  accentSoftInk: HexColor;
  /** The faintest tint: a highlighted card's background. */
  wash: HexColor;
  /** Borders of tinted surfaces. */
  accentLine: HexColor;
  accentLine2: HexColor;
  /** Accent on an `inverse` surface. ≥ 4.5:1 on it. */
  invAccent: HexColor;
}

/** Colours with fixed meanings that never follow the accent. */
export interface SemanticTokens {
  positive: HexColor;
  danger: HexColor;
  /** Failure sets. The same red in both modes, as a fill with `onFailure` on it. */
  failure: HexColor;
  onFailure: HexColor;
}

export type ThemeTokens = NeutralTokens & AccentTokens & SemanticTokens;

/** The default accent, and the fallback when there's no wallpaper colour to match. */
export const VERMILION: HexColor = '#C2451E';

/** The accent presets offered in the theme chooser, in display order. */
export const ACCENT_PRESETS = [
  { key: 'vermilion', seed: VERMILION },
  { key: 'forest', seed: '#2E6B3F' },
  { key: 'blue', seed: '#2F5BD3' },
  { key: 'violet', seed: '#6D4AD8' },
  { key: 'rose', seed: '#C2366B' },
  { key: 'teal', seed: '#0F7A7A' },
  { key: 'amber', seed: '#A86A00' },
] as const satisfies readonly { key: string; seed: HexColor }[];

export type AccentPresetKey = (typeof ACCENT_PRESETS)[number]['key'];

/** Generated tokens aim a little above the WCAG AA threshold so hex rounding can't dip below it. */
export const MIN_TEXT_CONTRAST = 4.5;
const TARGET_CONTRAST = 4.6;

const WHITE: HexColor = '#FFFFFF';

const lightNeutrals: NeutralTokens = {
  bg: '#F5F4F0',
  card: '#FFFFFF',
  line: '#E6E3DC',
  line2: '#D8D4CB',
  line3: '#CFCAC0',
  ink: '#17160F',
  muted: '#625E55',
  faint: '#9C978C',
  placeholder: '#8A857B',
  track: '#EFECE6',
  keypad: '#EAE7E0',
  keypadKey: '#DDD9D0',
  segment: '#E9E6DF',
  inverse: '#17160F',
  inverseInk: '#F5F4F0',
  inverseMuted: '#B9B4A8',
  inverseTrack: '#3A382F',
  inverseRaised: '#26251E',
  inverseRaised2: '#2C2B24',
};

const darkNeutrals: NeutralTokens = {
  bg: '#121110',
  card: '#1C1B18',
  line: '#2D2B26',
  line2: '#3E3B35',
  line3: '#4A463F',
  ink: '#F2EFE8',
  muted: '#A8A397',
  faint: '#6E6A61',
  placeholder: '#858074',
  track: '#2A2824',
  keypad: '#0B0A09',
  keypadKey: '#2A2824',
  segment: '#201F1B',
  inverse: '#F2EFE8',
  inverseInk: '#121110',
  inverseMuted: '#5C5850',
  inverseTrack: '#CFCAC0',
  inverseRaised: '#E2DED5',
  inverseRaised2: '#D6D1C7',
};

/** True black keeps the dark scale but drops the page and the keypad to #000 for OLED screens. */
const trueBlackNeutrals: NeutralTokens = {
  ...darkNeutrals,
  bg: '#000000',
  card: '#121110',
  keypad: '#000000',
  segment: '#171614',
  inverseInk: '#000000',
};

export const NEUTRALS: Record<ThemeVariant, NeutralTokens> = {
  light: lightNeutrals,
  dark: darkNeutrals,
  trueBlack: trueBlackNeutrals,
};

const lightSemantic: SemanticTokens = {
  positive: '#2E6B5E',
  danger: '#B42318',
  failure: '#C62828',
  onFailure: WHITE,
};

const darkSemantic: SemanticTokens = {
  positive: '#6CC0A8',
  danger: '#F97066',
  failure: '#C62828',
  onFailure: WHITE,
};

/**
 * Tone and chroma targets per accent token, measured from the canvas's vermilion. Chroma is a cap: a
 * muted source stays muted. `accent` itself has no target; it keeps the picked colour's tone when that
 * is legible (see `accentFill`).
 */
const ACCENT_SHAPE = {
  light: {
    accentSoft: { tone: 94, chroma: 6 },
    accentSoftInk: { tone: 34, chroma: 55 },
    wash: { tone: 97, chroma: 2 },
    accentLine: { tone: 87, chroma: 12 },
    accentLine2: { tone: 78, chroma: 18 },
    invAccent: { tone: 62, chroma: 54 },
  },
  dark: {
    accentInk: { tone: 68, chroma: 46 },
    accentSoft: { tone: 16, chroma: 16 },
    accentSoftInk: { tone: 80, chroma: 26 },
    wash: { tone: 11, chroma: 5 },
    accentLine: { tone: 24, chroma: 22 },
    accentLine2: { tone: 35, chroma: 30 },
  },
} as const;

/** The darkest a fill may get, so it still reads as colour rather than as ink. */
const MIN_FILL_TONE = 30;

function toneOf(hex: string): number {
  return Hct.fromInt(argbFromHex(hex)).tone;
}

/** WCAG contrast ratio between two colours. */
export function contrastRatio(a: string, b: string): number {
  return Contrast.ratioOfTones(toneOf(a), toneOf(b));
}

/**
 * Render a hue/chroma at a tone, then nudge the tone in `direction` until the rendered hex clears
 * `ratio` against every colour in `against`. Gamut mapping and hex rounding move the tone slightly, so
 * the check runs on the final hex rather than trusting the requested tone.
 */
function fit(
  hue: number,
  chroma: number,
  tone: number,
  against: string[],
  direction: 'darker' | 'lighter',
  ratio = TARGET_CONTRAST,
): HexColor {
  const step = direction === 'darker' ? -0.5 : 0.5;
  let t = tone;
  for (;;) {
    const hex = hexFromArgb(Hct.from(hue, chroma, t).toInt()) as HexColor;
    const exhausted = direction === 'darker' ? t <= 0 : t >= 100;
    if (exhausted || against.every((c) => contrastRatio(hex, c) >= ratio)) {
      return hex;
    }
    t = Math.min(100, Math.max(0, t + step));
  }
}

function at(hue: number, sourceChroma: number, shape: { tone: number; chroma: number }): HexColor {
  return hexFromArgb(Hct.from(hue, Math.min(sourceChroma, shape.chroma), shape.tone).toInt()) as HexColor;
}

/**
 * The fill keeps the picked colour's tone when white text on it (and, in light mode, the fill as text on
 * the page) is legible. A lighter pick is pulled down until it is, and a near-black one is lifted so the
 * fill still reads as a colour. Hue and chroma survive as far as the sRGB gamut allows.
 */
function accentFill(hue: number, chroma: number, sourceTone: number): HexColor {
  const tone = Math.max(MIN_FILL_TONE, sourceTone);
  return fit(hue, chroma, tone, [WHITE, lightNeutrals.bg], 'darker');
}

/** The accent family for one variant, generated from any source colour. */
export function accentTokens(source: string, variant: ThemeVariant): AccentTokens {
  const src = Hct.fromInt(argbFromHex(source));
  const { chroma } = src;
  // Greys have no meaningful hue, and pure white/black can report NaN; any finite hue renders them.
  const hue = Number.isFinite(src.hue) ? src.hue : 0;
  const neutrals = NEUTRALS[variant];
  const accent = accentFill(hue, chroma, src.tone);

  if (variant === 'light') {
    const shape = ACCENT_SHAPE.light;
    const accentSoft = at(hue, chroma, shape.accentSoft);
    return {
      accent,
      onAccent: WHITE,
      // The fill is already chosen to be legible on the page and on cards, so light mode reuses it.
      accentInk: accent,
      accentSoft,
      accentSoftInk: fit(
        hue,
        Math.min(chroma, shape.accentSoftInk.chroma),
        shape.accentSoftInk.tone,
        [accentSoft],
        'darker',
      ),
      wash: at(hue, chroma, shape.wash),
      accentLine: at(hue, chroma, shape.accentLine),
      accentLine2: at(hue, chroma, shape.accentLine2),
      invAccent: fit(
        hue,
        Math.min(chroma, shape.invAccent.chroma),
        shape.invAccent.tone,
        [neutrals.inverse],
        'lighter',
      ),
    };
  }

  const shape = ACCENT_SHAPE.dark;
  const accentSoft = at(hue, chroma, shape.accentSoft);
  return {
    accent,
    onAccent: WHITE,
    accentInk: fit(
      hue,
      Math.min(chroma, shape.accentInk.chroma),
      shape.accentInk.tone,
      [neutrals.card, neutrals.bg],
      'lighter',
    ),
    accentSoft,
    accentSoftInk: fit(
      hue,
      Math.min(chroma, shape.accentSoftInk.chroma),
      shape.accentSoftInk.tone,
      [accentSoft],
      'lighter',
    ),
    wash: at(hue, chroma, shape.wash),
    accentLine: at(hue, chroma, shape.accentLine),
    accentLine2: at(hue, chroma, shape.accentLine2),
    // On the light inverted slab the fill works as text, as long as it clears the slab too.
    invAccent: fit(hue, chroma, toneOf(accent), [neutrals.inverse], 'darker'),
  };
}

export function themeTokens(source: string, variant: ThemeVariant): ThemeTokens {
  return {
    ...NEUTRALS[variant],
    ...accentTokens(source, variant),
    ...(variant === 'light' ? lightSemantic : darkSemantic),
  };
}

/**
 * Map the tokens onto Material 3 roles so Paper components and unconverted screens pick up the new
 * palette. `base` is a full M3 scheme generated from the same source; it supplies the roles the tokens
 * don't have an opinion on (secondary, tertiary, the error containers), already harmonised with the accent.
 */
export function paperSchemeFromTokens(t: ThemeTokens, base: Material3Scheme, isDark: boolean): Material3Scheme {
  // M3 expects `primary` to work as text on the page as well as a fill. In dark mode the fill is too dark
  // for text, so Paper gets the text colour, with dark ink on it for contained buttons.
  const primary = isDark ? t.accentInk : t.accent;
  const onPrimary = isDark ? t.inverseInk : t.onAccent;
  // The one step up from `card`, for tracks and wells drawn inside cards.
  const inset = isDark ? t.track : t.segment;

  return {
    ...base,
    primary,
    onPrimary,
    primaryContainer: t.accentSoft,
    onPrimaryContainer: t.accentSoftInk,
    inversePrimary: t.invAccent,
    surfaceTint: t.accent,

    background: t.bg,
    onBackground: t.ink,
    surface: t.bg,
    onSurface: t.ink,
    // Paper paints contained Cards with `surfaceVariant`, and nearly every card in the unconverted screens
    // is one, so this is what makes them white (dark: raised) cards on the page, as in the design.
    surfaceVariant: t.card,
    onSurfaceVariant: t.muted,
    outline: t.faint,
    outlineVariant: t.line,
    inverseSurface: t.inverse,
    inverseOnSurface: t.inverseInk,

    surfaceContainerLowest: t.card,
    surfaceContainerLow: t.card,
    surfaceContainer: t.card,
    surfaceContainerHigh: t.card,
    surfaceContainerHighest: inset,
    surfaceBright: t.card,
    surfaceDim: isDark ? t.bg : t.track,

    error: t.danger,
    onError: isDark ? t.inverseInk : WHITE,

    elevation: {
      level0: 'transparent',
      level1: t.card,
      level2: t.card,
      level3: t.card,
      level4: t.card,
      level5: t.card,
    },
  };
}

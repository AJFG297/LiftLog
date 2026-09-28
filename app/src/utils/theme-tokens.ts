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

const FAILURE = { failure: '#C62828', onFailure: WHITE } as const;

const SEMANTIC: Record<'light' | 'dark', SemanticTokens> = {
  light: { positive: '#2E6B5E', danger: '#B42318', ...FAILURE },
  dark: { positive: '#6CC0A8', danger: '#F97066', ...FAILURE },
};

/** A target tone plus a chroma cap: a muted source stays muted. */
interface ToneShape {
  tone: number;
  chroma: number;
}

/**
 * Tone and chroma targets for the accent tints, measured from the design's vermilion (see
 * docs/plans/redesign.md). `accent` itself has no target; it keeps the picked colour's tone when that is
 * legible (see `accentFill`).
 */
const TINT_SHAPE = {
  light: {
    accentSoft: { tone: 94, chroma: 6 },
    accentSoftInk: { tone: 34, chroma: 55 },
    wash: { tone: 97, chroma: 2 },
    accentLine: { tone: 87, chroma: 12 },
    accentLine2: { tone: 78, chroma: 18 },
  },
  dark: {
    accentSoft: { tone: 16, chroma: 16 },
    accentSoftInk: { tone: 80, chroma: 26 },
    wash: { tone: 11, chroma: 5 },
    accentLine: { tone: 24, chroma: 22 },
    accentLine2: { tone: 35, chroma: 30 },
  },
} satisfies Record<'light' | 'dark', Record<string, ToneShape>>;

const LIGHT_INV_ACCENT: ToneShape = { tone: 62, chroma: 54 };
const DARK_ACCENT_INK: ToneShape = { tone: 68, chroma: 46 };

/** The darkest a fill may get, so it still reads as colour rather than as ink. */
const MIN_FILL_TONE = 30;

type Direction = 'darker' | 'lighter';

function toneOf(hex: HexColor): number {
  return Hct.fromInt(argbFromHex(hex)).tone;
}

/** WCAG contrast ratio between two colours. */
export function contrastRatio(a: HexColor, b: HexColor): number {
  return Contrast.ratioOfTones(toneOf(a), toneOf(b));
}

function hctOf(source: HexColor): { hue: number; chroma: number; tone: number } {
  const { hue, chroma, tone } = Hct.fromInt(argbFromHex(source));
  // Greys have no meaningful hue, and pure white/black can report NaN; any finite hue renders them.
  return { hue: Number.isFinite(hue) ? hue : 0, chroma, tone };
}

function colorAt(hue: number, sourceChroma: number, shape: ToneShape): HexColor {
  return hexFromArgb(Hct.from(hue, Math.min(sourceChroma, shape.chroma), shape.tone).toInt()) as HexColor;
}

/**
 * Like `colorAt`, but moves the tone in `direction` as far as needed for the colour to clear
 * TARGET_CONTRAST against everything in `against`. The tone is solved for directly; gamut mapping and hex
 * rounding can still shift the rendered colour slightly, so the final hex is checked and nudged if needed.
 */
function legibleColorAt(
  hue: number,
  sourceChroma: number,
  shape: ToneShape,
  against: HexColor[],
  direction: Direction,
): HexColor {
  const darker = direction === 'darker';
  const bound = darker ? 0 : 100;
  const againstTones = against.map(toneOf);
  const needed = againstTones.map((t) =>
    darker ? Contrast.darker(t, TARGET_CONTRAST) : Contrast.lighter(t, TARGET_CONTRAST),
  );
  // -1 means no tone in range clears the ratio; head for the end of the range and take the best there is.
  const limit = needed.includes(-1) ? bound : darker ? Math.min(...needed) : Math.max(...needed);
  let tone = darker ? Math.min(shape.tone, limit) : Math.max(shape.tone, limit);

  for (;;) {
    const hex = colorAt(hue, sourceChroma, { ...shape, tone });
    const rendered = toneOf(hex);
    if (tone === bound || againstTones.every((t) => Contrast.ratioOfTones(rendered, t) >= TARGET_CONTRAST)) {
      return hex;
    }
    tone = darker ? Math.max(bound, tone - 0.5) : Math.min(bound, tone + 0.5);
  }
}

/**
 * The accent fill, the same in every variant. It keeps the picked colour's tone when white text on it, and
 * the fill as text on the light page, are legible. A lighter pick is pulled down until they are, and a
 * near-black one is lifted so the fill still reads as a colour. Hue and chroma survive as far as the sRGB
 * gamut allows.
 */
export function accentFill(source: HexColor): HexColor {
  const { hue, chroma, tone } = hctOf(source);
  return legibleColorAt(
    hue,
    chroma,
    { tone: Math.max(MIN_FILL_TONE, tone), chroma },
    [WHITE, lightNeutrals.bg],
    'darker',
  );
}

/** The accent family for one variant, generated from any source colour. */
export function accentTokens(source: HexColor, variant: ThemeVariant): AccentTokens {
  const { hue, chroma } = hctOf(source);
  const mode = variant === 'light' ? 'light' : 'dark';
  const shape = TINT_SHAPE[mode];
  const neutrals = NEUTRALS[variant];
  const accent = accentFill(source);
  const accentSoft = colorAt(hue, chroma, shape.accentSoft);

  const tints = {
    accent,
    onAccent: WHITE,
    accentSoft,
    accentSoftInk: legibleColorAt(
      hue,
      chroma,
      shape.accentSoftInk,
      [accentSoft],
      mode === 'light' ? 'darker' : 'lighter',
    ),
    wash: colorAt(hue, chroma, shape.wash),
    accentLine: colorAt(hue, chroma, shape.accentLine),
    accentLine2: colorAt(hue, chroma, shape.accentLine2),
  };

  if (mode === 'light') {
    return {
      ...tints,
      // The fill is already legible on the page and on cards, so light mode reuses it as text.
      accentInk: accent,
      invAccent: legibleColorAt(hue, chroma, LIGHT_INV_ACCENT, [neutrals.inverse], 'lighter'),
    };
  }
  return {
    ...tints,
    accentInk: legibleColorAt(hue, chroma, DARK_ACCENT_INK, [neutrals.card, neutrals.bg], 'lighter'),
    // On the light inverted slab the fill works as text, as long as it clears the slab too.
    invAccent: legibleColorAt(hue, chroma, { tone: toneOf(accent), chroma }, [neutrals.inverse], 'darker'),
  };
}

export function themeTokens(source: HexColor, variant: ThemeVariant): ThemeTokens {
  return {
    ...NEUTRALS[variant],
    ...accentTokens(source, variant),
    ...SEMANTIC[variant === 'light' ? 'light' : 'dark'],
  };
}

/**
 * Map the tokens onto Material 3 roles so Paper components and unconverted screens pick up the new
 * palette. `base` is a full M3 scheme generated from the same source; it supplies the roles the tokens
 * don't have an opinion on (secondary, tertiary, the error containers), already harmonised with the accent.
 */
export function paperSchemeFromTokens(
  tokens: ThemeTokens,
  base: Material3Scheme,
  variant: ThemeVariant,
): Material3Scheme {
  const perMode =
    variant === 'light'
      ? {
          primary: tokens.accent,
          onPrimary: tokens.onAccent,
          surfaceContainerHighest: tokens.segment,
          surfaceDim: tokens.track,
        }
      : {
          // M3 expects `primary` to work as text on the page as well as a fill. In dark mode the fill is too
          // dark for text, so Paper gets the text colour, with dark ink on it for contained buttons.
          primary: tokens.accentInk,
          onPrimary: tokens.inverseInk,
          surfaceContainerHighest: tokens.track,
          surfaceDim: tokens.bg,
        };

  return {
    ...base,
    ...perMode,
    primaryContainer: tokens.accentSoft,
    onPrimaryContainer: tokens.accentSoftInk,
    inversePrimary: tokens.invAccent,
    surfaceTint: tokens.accent,

    background: tokens.bg,
    onBackground: tokens.ink,
    surface: tokens.bg,
    onSurface: tokens.ink,
    // Paper paints contained Cards with `surfaceVariant`, and nearly every card in the unconverted screens
    // is one, so this is what makes them white (dark: raised) cards on the page, as in the design.
    surfaceVariant: tokens.card,
    onSurfaceVariant: tokens.muted,
    // M3 uses `outline` for boundaries that must stay visible (field borders, focus rings), which need 3:1.
    // `faint` is decorative and falls short; the placeholder grey is the lightest neutral that clears it.
    outline: tokens.placeholder,
    outlineVariant: tokens.line,
    inverseSurface: tokens.inverse,
    inverseOnSurface: tokens.inverseInk,

    // Everything up to `High` is the card; `Highest` (in `perMode`) is the one step up, for wells in a card.
    surfaceContainerLowest: tokens.card,
    surfaceContainerLow: tokens.card,
    surfaceContainer: tokens.card,
    surfaceContainerHigh: tokens.card,
    surfaceBright: tokens.card,

    error: tokens.danger,
    onError: perMode.onPrimary,

    elevation: {
      level0: 'transparent',
      level1: tokens.card,
      level2: tokens.card,
      level3: tokens.card,
      level4: tokens.card,
      level5: tokens.card,
    },
  };
}

import { useAppSelector } from '@/store';
import {
  createMaterial3Theme,
  isDynamicThemeSupported,
  Material3Scheme,
  useMaterial3Theme,
} from '@pchmn/expo-material3-theme';
import React, { createContext, ReactNode, useContext, useEffect } from 'react';
import { Appearance, AppState, Platform, useColorScheme } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from 'react-native-paper';
import { DarkTheme, ThemeProvider as NavigationThemeProvider, DefaultTheme } from 'expo-router';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { argbFromHex, Blend, Hct, hexFromArgb } from '@material/material-color-utilities';
import { paperSchemeFromTokens, themeTokens, VERMILION, type ThemeTokens } from '@/utils/theme-tokens';
import type { HexColor } from '@/utils/color';

export const rounding = {
  roundedRectangleRadius: 10,
  roundedRectangleFocusRingRadius: 15,
  segmentedBetweenRadius: 2,
};

export const spacing = {
  pageHorizontalMargin: 16, // spacing[4]
  0: 0,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  11: 44,
  12: 48,
  14: 56,
  15: 60,
  16: 64,
  20: 80,
  24: 96,
  28: 112,
  32: 128,
  36: 144,
  40: 160,
  44: 176,
  48: 192,
  52: 208,
  56: 224,
  60: 240,
  64: 256,
} as const;

export const font = {
  'text-2xs': {
    fontSize: 10,
    lineHeight: 14,
  },
  'text-xs': {
    fontSize: 12,
    lineHeight: 16,
  },
  'text-sm': {
    fontSize: 14,
    lineHeight: 20,
  },
  'text-base': {
    fontSize: 16,
    lineHeight: 24,
  },
  'text-lg': {
    fontSize: 18,
    lineHeight: 28,
  },
  'text-xl': {
    fontSize: 20,
    lineHeight: 28,
  },
  'text-2xl': {
    fontSize: 24,
    lineHeight: 32,
  },
  'text-3xl': {
    fontSize: 30,
    lineHeight: 40,
  },
  'text-4xl': {
    fontSize: 40,
    lineHeight: 50,
  },
} as const;

export type FontChoice = keyof typeof font;

type ColorPair<T extends string> = { [k in T | `on${Capitalize<T>}`]: string };

/** Level 0 is the absence of a session, so it has no fill of its own and no entry here. */
export type ActivityRampColors = ColorPair<'activityLevel1'> &
  ColorPair<'activityLevel2'> &
  ColorPair<'activityLevel3'> &
  ColorPair<'activityLevel4'>;

export type AppThemeColors = Material3Scheme &
  ActivityRampColors & {
    orange: string;
    onOrange: string;
    red: string;
    onRed: string;
    green: string;
    onGreen: string;
    blue: string;
    onBlue: string;
    yellow: string;
    onYellow: string;
    purple: string;
    onPurple: string;
    pink: string;
    onPink: string;
    teal: string;
    onTeal: string;
    cyan: string;
    onCyan: string;
    brown: string;
    onBrown: string;
    indigo: string;
    onIndigo: string;
    lime: string;
    onLime: string;
    amber: string;
    onAmber: string;

    seedColor: string | undefined;

    scheme: 'dark' | 'light' | undefined;
  };

export type ColorChoice = keyof {
  [K in keyof AppThemeColors as AppThemeColors[K] extends string ? K : never]: AppThemeColors[K];
};

/**
 * Whether the `'default'` seed can follow the wallpaper (Material You, Android 12+). Where it can't,
 * `'default'` is vermilion.
 */
export const canMatchWallpaper = Platform.OS === 'android' && isDynamicThemeSupported;

export interface AppTheme {
  /**
   * The Clarity palette (`utils/theme-tokens.ts`). Redesigned screens use only these; `colors` is the
   * Material 3 scheme mapped from them, kept while unconverted screens still read it.
   */
  tokens: ThemeTokens;
  colors: AppThemeColors;
  colorScheme: 'light' | 'dark';
}

const AppThemeContext = createContext<AppTheme | undefined>(undefined);

export const useAppTheme = (): AppTheme => {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within a AppThemeProvider');
  }
  return context;
};

interface AppThemeProviderProps {
  children: ReactNode;
}

export const AppThemeProvider: React.FC<AppThemeProviderProps> = ({ children }) => {
  const colorSchemeSeed = useAppSelector((state) => state.settings.colorSchemeSeed);
  const trueBlack = useAppSelector((state) => state.settings.trueBlackDarkTheme);
  const themeMode = useAppSelector((state) => state.settings.themeMode);

  const systemColorScheme = useColorScheme();
  // Native views (expo-ui hosts, system dialogs, the status bar) read the platform appearance rather
  // than anything we compute here, so the override has to be pushed down to it too.
  useEffect(() => {
    Appearance.setColorScheme(themeMode === 'system' ? 'unspecified' : themeMode);
  }, [themeMode]);

  const colorScheme = themeMode === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : themeMode;
  const isDark = colorScheme === 'dark';

  // With no source colour this is the system (Material You) scheme on Android 12+, and a scheme built
  // from the fallback everywhere else. We only read it to follow the wallpaper.
  const { theme: systemTheme, resetTheme: rereadSystemTheme } = useMaterial3Theme({ fallbackSourceColor: VERMILION });
  const matchWallpaper = colorSchemeSeed === 'default' && canMatchWallpaper;
  // The hook reads the system scheme once, on mount. The wallpaper can change while the app is open or in
  // the background, so read it again when matching is turned on and whenever the app comes back.
  useEffect(() => {
    if (!matchWallpaper) {
      return;
    }
    rereadSystemTheme();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        rereadSystemTheme();
      }
    });
    return () => subscription.remove();
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [matchWallpaper]);
  const accentSource: HexColor = matchWallpaper
    ? (systemTheme.light.primary as HexColor)
    : colorSchemeSeed === 'default'
      ? VERMILION
      : colorSchemeSeed;

  const variant = isDark ? (trueBlack ? 'trueBlack' : 'dark') : 'light';
  const tokens = themeTokens(accentSource, variant);
  // The roles the tokens don't cover (secondary, tertiary, error containers) come from a full M3 scheme on
  // the same source: the system's own when matching the wallpaper, so those stay exact.
  const baseScheme = (matchWallpaper ? systemTheme : createMaterial3Theme(accentSource))[colorScheme];
  const schemedTheme = paperSchemeFromTokens(tokens, baseScheme, variant);

  const paperTheme = { ...(isDark ? MD3DarkTheme : MD3LightTheme), colors: schemedTheme };
  /* The seedColor is passed into the expo-ui Hosts and means something different per platform.
   * On Android it seeds Compose's tonal palette, so it's the accent fill; undefined when matching the
   * wallpaper, which lets Compose use the same system palette we derived the accent from.
   * On iOS it is the tint, used for text as well as fills, so dark mode gets the lighter accent ink.
   */
  const seedColor = Platform.select({
    android: matchWallpaper ? undefined : tokens.accent,
    ios: isDark ? tokens.accentInk : tokens.accent,
  });
  const appTheme = {
    tokens,
    colors: {
      ...schemedTheme,
      ...colorPair('orange', 'ffffa500', schemedTheme.primary, isDark),
      ...colorPair('red', 'ffff0000', schemedTheme.primary, isDark),
      ...colorPair('yellow', 'ffffff00', schemedTheme.primary, isDark),
      ...colorPair('blue', 'ff0000aa', schemedTheme.primary, isDark),
      ...colorPair('green', 'ff00aa00', schemedTheme.primary, isDark),
      ...colorPair('purple', 'ff800080', schemedTheme.primary, isDark),
      ...colorPair('pink', 'ffff69b4', schemedTheme.primary, isDark),
      ...colorPair('teal', 'ff008080', schemedTheme.primary, isDark),
      ...colorPair('cyan', 'ff00ffff', schemedTheme.primary, isDark),
      ...colorPair('brown', 'ff8b4513', schemedTheme.primary, isDark),
      ...colorPair('indigo', 'ff4b0082', schemedTheme.primary, isDark),
      ...colorPair('lime', 'ffcddc39', schemedTheme.primary, isDark),
      ...colorPair('amber', 'ffffc107', schemedTheme.primary, isDark),
      ...activityRamp(schemedTheme.primary, isDark),
      seedColor: seedColor,
      scheme: colorScheme,
    } satisfies AppThemeColors,
    colorScheme,
  };

  const baseNavigationThem = isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseNavigationThem,
    colors: {
      background: paperTheme.colors.background,
      border: paperTheme.colors.outlineVariant,
      card: paperTheme.colors.surfaceContainer,
      notification: paperTheme.colors.surface,
      primary: paperTheme.colors.primary,
      text: paperTheme.colors.onSurface,
    },
  };

  return (
    <AppThemeContext.Provider value={appTheme}>
      <PaperProvider
        theme={paperTheme}
        settings={{
          icon: (props) => <MsIconSrc {...props} color={props.color ?? appTheme.colors.onSurface} />,
        }}
      >
        <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
      </PaperProvider>
    </AppThemeContext.Provider>
  );
};

/**
 * Tones for the activity ramp, walking from "barely there" to "full primary". Light and dark move in
 * opposite directions: on a light surface intensity reads as *darker*, on a dark surface as *brighter*.
 */
const ACTIVITY_TONES_LIGHT = [92, 80, 62, 45];
const ACTIVITY_TONES_DARK = [28, 40, 55, 72];

/**
 * The graded fills the activity calendar shades its days with. Derived here, with the rest of the theme,
 * because each one costs an iterative CAM16 solve -- far too much to pay once per cell, per render.
 */
function activityRamp(primary: string, isDark: boolean): ActivityRampColors {
  const seed = Hct.fromInt(argbFromHex(primary));
  const tones = isDark ? ACTIVITY_TONES_DARK : ACTIVITY_TONES_LIGHT;

  return Object.assign(
    {},
    ...tones.map((tone, index) => ({
      [`activityLevel${index + 1}`]: hexFromArgb(Hct.from(seed.hue, seed.chroma, tone).toInt()),
      // Text stays legible against the fill: the same tone inversion `colorPair` uses.
      [`onActivityLevel${index + 1}`]: hexFromArgb(Hct.from(seed.hue, seed.chroma, tone > 60 ? 10 : 100).toInt()),
    })),
  ) as ActivityRampColors;
}

function colorPair<T extends string>(name: T, hex: string, primary: string, isDark: boolean): ColorPair<T> {
  // Step 1: Harmonize the input with the seed
  const harmonized = Blend.harmonize(argbFromHex(hex), argbFromHex(primary));
  const baseHct = Hct.fromInt(harmonized);

  // Step 2: Adjust tone based on theme context
  baseHct.tone = isDark ? 80 : 40; // Material-like defaults

  // Step 3: Derive on-color from tone inversion
  const onTone = baseHct.tone > 60 ? 10 : 100;
  const onColor = Hct.from(baseHct.hue, baseHct.chroma, onTone);

  // Step 4: Material-style return shape
  const onName = `on${name.charAt(0).toUpperCase()}${name.slice(1)}` as const;

  return {
    [name]: hexFromArgb(baseHct.toInt()),
    [onName]: hexFromArgb(onColor.toInt()),
  } as ColorPair<T>;
}

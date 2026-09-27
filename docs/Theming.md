# Theming

The app's colours come from one place: `app/src/utils/theme-tokens.ts`, exposed as `tokens` by
`useAppTheme()`. It implements decision D2 of the [redesign plan](./plans/redesign.md).

- **Neutrals** are fixed per variant (`light`, `dark`, `trueBlack`) and warm: `bg`, `card`, `line*`, `ink`,
  `muted`, `faint`, `placeholder`, `track`, `keypad*`, `segment`, and the `inverse*` set for dark slabs in
  light mode (toasts, the in-progress bar) and light slabs in dark mode.
- **The accent family** is generated from the colour the user picks: `accent`, `onAccent`, `accentInk`,
  `accentSoft`, `accentSoftInk`, `wash`, `accentLine`, `accentLine2`, `invAccent`.
- **Semantic colours** never follow the accent: `positive`, `danger`, `failure` / `onFailure` (failure sets).
- Routine colours are a separate per-routine choice and aren't part of the theme.

## Which token for what

| You're colouring | Use |
|---|---|
| Page background / card | `bg` / `card` |
| Body text / secondary text | `ink` / `muted` |
| Decorative text, disabled icons (not for anything that must be read) | `faint` |
| An untouched field showing today's target | `placeholder` |
| Hairlines, from faintest to strongest | `line`, `line2`, `line3` |
| A filled button, selected chip, active tab | `accent` with `onAccent` on it |
| Accent-coloured text or icons on `bg` or `card` | `accentInk` (never `accent`: in dark mode the fill is too dark to read as text) |
| A tinted row or badge | `accentSoft` with `accentSoftInk` on it |
| A barely-there highlight | `wash`, bordered with `accentLine` |
| Accent text on an `inverse` slab | `invAccent` |

## Guarantees

The generator picks tones by contrast, not fixed numbers, so any colour a user picks stays legible. These
hold for every preset and any `#RRGGBB` source, in every variant (`theme-tokens.spec.ts` checks them with
fast-check):

- `onAccent` on `accent` ≥ 4.5:1;
- `accentInk` on `card` and on `bg` ≥ 4.5:1;
- `accentSoftInk` on `accentSoft` ≥ 4.5:1;
- `invAccent` on `inverse` ≥ 4.5:1.

A pick whose fill would be too light for white text is pulled darker, and a near-black one is lifted so it
still reads as a colour. Hue and chroma are kept as far as the sRGB gamut allows. The default, vermilion
`#C2451E`, comes out as `#C0441D`, within a shade of the design.

## Where the accent comes from

The `colorSchemeSeed` preference:

- A `#RRGGBB` value is the user's accent (a preset or the custom wheel in Settings → Theme).
- `'default'` means **Match wallpaper** on Android 12+: the system Material You primary becomes the
  source. Elsewhere `'default'` is vermilion.

## Paper and unconverted screens

Until every screen is redesigned, `colors` (and Paper's theme) is a Material 3 scheme mapped from the
tokens by `paperSchemeFromTokens`, so old screens get the new palette. A few things to know:

- `primary` is `accent` in light mode but `accentInk` in dark mode, with dark `onPrimary`. That's how M3
  expects `primary` to behave (it's used for text as well as fills).
- Several M3 roles collapse to one token. `background` and `surface` are both `bg`. `surfaceVariant`
  (which Paper paints contained Cards with), every `surfaceContainer*` level except `Highest`, and every
  `elevation` level are all `card`. `surfaceContainerHighest` is the one step up for wells inside a card.
  Don't rely on the difference between collapsed roles.
- `outline` is the `placeholder` grey, the lightest neutral that clears 3:1 for field borders and focus
  rings. `faint` would be too light.
- New code reads `tokens`, not `colors`.

## expo-ui hosts

`colors.seedColor` feeds expo-ui `Host`s (see the `expo-ui-migration` skill). On Android it's the accent
fill, or `undefined` when matching the wallpaper so Compose uses the same system palette. On iOS it's the
tint: `accent` in light mode and `accentInk` in dark mode.

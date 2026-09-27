# ADR-0002: Our own components for content, native controls for system chrome

Status: proposed (2026-09-27). It's accepted when the PR that adds it merges.

## Context

- The app inherited upstream LiftLog's look: react-native-paper (Material 3) with a Material You seed.
  `AGENTS.md` told every change to migrate Paper controls to native expo-ui ones (SwiftUI on iOS,
  Jetpack Compose on Android).
- Following that everywhere would give the app a stock-platform look. The fork's value is being the
  easiest, most intuitive workout tracker, and that depends on a deliberate design of its own.
- The redesign ("Clarity", `docs/plans/redesign.md`) needs things that native control sets can't give:
  - a fixed warm neutral scale with one user-chosen accent;
  - mono tabular numbers;
  - a custom number pad with plate maths;
  - set badges and dense set tables;
  - one consistent look on iOS and Android.
- Native controls are still better where people expect platform behaviour: sheets with detents, tab bars,
  menus, switches, date and time pickers, alerts. There they give accessibility, haptics and gestures for
  free.

## Decision

- **Content surfaces are our own React Native components**, built only from the theme tokens in
  `hooks/useAppTheme.tsx`: cards, list rows, set rows and badges, the number pad, stat tiles,
  summaries, chips, segmented controls and empty states.
  - They live in `components/presentation/foundation/`, or the feature folder when only one feature uses
    them.
  - They look the same on both platforms.
- **System chrome stays native:**
  - tabs (NativeTabs);
  - sheets (expo-router `presentation: 'formSheet'` with detents);
  - menus and context menus;
  - switches;
  - date, time and duration pickers;
  - alerts and confirmation dialogs;
  - the share sheet.
  - Where expo-ui wraps these, use it with the existing platform-split convention (`foo.tsx` +
    `foo.android.tsx` + `foo-props.ts`) and the `seedColor` rule. `seedColor` becomes the user's accent.
- **react-native-paper is on the way out.**
  - When a screen is redesigned, its Paper content components are replaced with our own, and its Paper
    chrome (Dialog, Menu, Switch, …) with native equivalents.
  - Until then, Paper's theme is derived from the new tokens, so unconverted screens use the same palette.
  - Remove Paper once nothing imports it.
- **No third-party UI kit or sheet library** unless native `formSheet` can't do the job. Reanimated,
  gesture-handler and expo-haptics are enough for our own components.

## Consequences

- One visual language and one set of tokens on both platforms. Light, dark, true black and the user's
  accent all come from the same place.
- We own accessibility for our components. Every interactive one needs a role, a label, a target of at
  least 44 pt, and has to survive dynamic type. `docs/plans/redesign.md` lists the checks.
- More code to maintain than using native controls throughout. That's accepted because these surfaces are
  the product.
- The `expo-ui-migration` skill now covers system chrome only. `AGENTS.md` says the same.
- Existing expo-ui controls used as content (for example `native-button/`) are either kept, where
  they're chrome-like (primary actions in sheets), or replaced during their screen's redesign. That's
  decided case by case in each screen's PR.

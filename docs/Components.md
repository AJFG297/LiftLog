# Components

The redesign's own primitives (ADR-0002, [redesign plan](./plans/redesign.md) phase 1, PM-22). They live in
`app/src/components/presentation/foundation/`, take their colours only from `useAppTheme().tokens` (see
[Theming.md](./Theming.md)), and look the same on iOS and Android. Reach for these before building a
control of your own on a redesigned screen.

To see them all, in light and dark and with any accent, open `liftlog://dev/components` in a dev build. The
screen isn't linked from the app. Its theme controls change the real theme settings.

## What there is

| Component | File | Use it for |
| --- | --- | --- |
| `Card` | `card.tsx` | A white (dark: raised) surface with a hairline border. `onPress` makes the whole card a button. |
| `Chip` | `chip.tsx` | A toggle: filters, rest presets, RPE. `numeric` sets a number-only label in Geist Mono; `style={{ flexGrow: 1 }}` shares a row; `contentStyle` styles the drawn chip. |
| `ChipRow` | `chip-row.tsx` | One row of `Chip`s that scrolls sideways past the page's edge, exactly one on, the first being All: a list's filter (the picker's muscle and equipment, All exercises' muscle). |
| `SearchField` | `search-field.tsx` | A list's search input with its icon and a clear button. `testID` names the input (`-input`) and the clear button (`-clear`). |
| `SegmentedControl` | `segmented-control.tsx` | Two to four mutually exclusive options in one row ("Last 7 days / Last 30 days"). Each segment is its label's width plus an equal share of the rest, and a label that still doesn't fit wraps to two lines instead of being cut off. Options worked out at run time come from `segmentedOptions(values, label)`, which keeps the two-to-four count without a cast. |
| `ActionButton` | `action-button.tsx` | The full-width button that ends a sheet or a page: `primary` is the accent fill ("Update routine", "Done"), `secondary` an outlined card ("Keep the routine as it was"), `ink` the ink fill for an empty state's way out (the picker's Create "X"). Side by side in a row, the pair share one height. Disabled, it greys out. |
| `RoundIconButton` | `round-icon-button.tsx` | A round, outlined icon button, `regular` (44pt) or `compact` (36pt). The label is required. A visible `label` stretches it into a pill. `selected` makes it a toggle (`togglebutton`, `checked`) that fills with the soft accent when on: the exercise page's Pin to Progress. |
| `ListRow` | `list-row.tsx` | Leading slot, title, subtitle, trailing slot. `onPress` makes the row a button. |
| `SetBadge` | `set-badge/` | The circle at the start of a set row: the working set's number, or W, D, M or F. |
| `SwipeToDelete` | `swipe-to-delete.tsx` | A row that swipes left to delete: a short swipe shows a Delete button, a long swipe or a hard fling deletes on release. Give the row a screen-reader delete action too, since nobody can swipe with one. `resetKey` snaps it shut when the row below moves into its place. |
| `ProgressBar` | `progress-bar.tsx` | Accent on a track, from 0 to 1. `tone="inverse"` draws it on an `inverse` slab. |
| `ToastProvider`, `useToast` | `toast/` | One short message at a time over the app, with an optional action such as Undo. |
| `SheetHeader`, `formSheetOptions` | `sheet-header.tsx`, `form-sheet-options.ts` | Native sheets. See below. |
| `haptics` | `haptics.ts` | `setLogged()`, `restOver()`, `selection()`. |

`RoundIconButton` isn't called `IconButton` because the Paper-based `IconButton` default export in
`icon-button.tsx` is still used by most screens.

## Accessibility

ADR-0002 makes us responsible for these, so every interactive primitive:

- has a role and a label. `Chip` is a toggle button that is on or off (`togglebutton` with `checked`, what
  ARIA calls `aria-pressed`). `SegmentedControl` is a radio group. Icon-only controls require a label.
- has a touch target of at least 44pt (`MIN_TOUCH_TARGET` in `touch-target.ts`). A control that is drawn
  smaller (a 36pt chip, a compact icon button) makes its `Pressable` 44pt and draws the smaller shape inside
  it. Don't use `hitSlop` for this: React Native drops a tap outside the parent's bounds, so the slop is lost
  in a row only 36pt tall. A chip's target is the drawn chip plus 4pt all round, so chips laid out with no gap
  still look 8pt apart.
- lets text grow with the system font size: heights are minimums, not fixed.

`SetBadge` isn't pressable. A set row that opens the set-type sheet wraps it and provides the target. It reads
out as "Set 2", "Warm-up set", "Drop set" and so on.

## Set badges

One table, `SET_BADGE_LOOK` in `set-badge/set-badge-kinds.ts`, maps each `SetKind` (`working`,
`warmup`, `drop`, `myo`, `failure`) to its fill, ink, optional ring and its spoken name. The letter comes from
`SET_KIND_RULES` in `models/session-models/set-kind.ts`, the table every other screen reads. Failure
is the `failure` red. Drop and myo are ink with an accent ring. Warm-up is `accentSoft` with the same ring, because the soft fill alone is close to a set tile's colour. A working set is
the page colour with its number in Geist Mono. The badge's props only allow a number on a working set.

It comes in two sizes: the default 36pt circle, and `size="small"` (16pt), which sits in the corner of a
reps tile on the workout screen. It is the only set badge: the workout screen, the routine editor and the
warm-up editor use it too, so a set looks the same wherever it appears.

## Toasts

`ToastProvider` is mounted once in `app/src/app/_layout.tsx`. Call `useToast().show({ message, action })`.
A new toast replaces the current one. It stays for five seconds, longer on Android when the user has asked
for more time to act, and is announced to screen readers. Pressing the action runs it and dismisses the
toast.

With a screen reader on (VoiceOver or TalkBack), a toast with an action doesn't time out, since reaching the
action can take longer than any timer. It stays until the action is pressed or a new toast replaces it, and
offers a Dismiss accessibility action and, on iOS, the escape gesture (a two-finger scrub). A toast without
an action keeps the usual timing.

The state is a small reducer in `toast/toast-state.ts`: `hidden`, `shown` and `leaving` (the exit
animation). Each toast has an id, so a timer or animation left over from a replaced toast can't touch the
new one. `toastTimeoutMs` in the same file decides how long a toast stays up.

Native sheets and modals are presented above the root view, so a toast shown while one is open is hidden
behind it. Close the sheet first, then show the toast, as the dev sheet does.

A toast sits just above the tab bar, where a screen's own bottom button would be. A screen with one, like
the workout summary and its Done, shows the message in its content instead, so nothing covers the button:
the summary's `RoutineUpdatedBanner` (`presentation/summary/`) is the update-routine sheet's toast there.

The older Paper snackbar (`SnackbarProvider`, `setCurrentSnackbar`) still serves unconverted screens.

## Sheets

Decision D7: navigational sheets are expo-router routes presented as native form sheets, not a sheet
library.

1. Register the route in its parent `Stack` with `formSheetOptions(detents)`:

   ```tsx
   <Stack.Screen name="rest" options={formSheetOptions([0.5, 0.9])} />
   ```

   Detents are ascending fractions of the screen height. Android honours at most three, and the type allows
   no more. The options hide the native header and show the grabber (iOS).
2. Start the screen with `<SheetHeader title subtitle onClose={() => router.back()} />`, and give its root
   view the `card` background. A short count that has to stay readable, like "7 exercises", goes in
   `titleDetail`: it follows the title after a dot, and a long title truncates before it does.
3. Open it with `router.push`. It closes with `router.back()` or a swipe down.

The number pad isn't a sheet: it's an in-screen panel, so the set being edited stays visible.

## Haptics

`haptics.setLogged()` is one firm tap, since it plays on every set. `haptics.restOver()` is a notification
pattern you can feel with the phone in a pocket. `haptics.selection()` is the light tick for a changed value;
`Chip` and `SegmentedControl` play it themselves. Devices without a haptic engine ignore them.

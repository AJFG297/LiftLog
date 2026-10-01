# Plan: app redesign ("Clarity")

Status: **in progress**. Phases 0 and 1 are done: ADR-0002 is accepted, and the theme tokens, fonts, core components, number pad and new set types are merged (see [Theming.md](../Theming.md)). Phase 2, the gym loop, is done: focus mode and the All exercises sheet (PM-23), set logging (PM-29), rest in the header (PM-30) and finishing a workout (PM-31) are merged, with a pass to match the canvas. Phase 3 is next. The Linear parent issue is PM-16, "Spec: App redesign (Clarity)".

The prototypes live on a private claude.ai design canvas owned by the author
(<https://claude.ai/artifact/47zQyGzQ5NcrAP7Yw4Szwx>). It holds 28 clickable phone screens: the chosen
direction "A · Clarity", the live workout, finishing a workout, the routine editor, dark mode, and two
rejected directions (B and C) kept for reference. The canvas is the visual spec. Its HTML isn't code to
port.

## Why

The current UI is upstream LiftLog's Material 3 look, and the author doesn't want it. The fork's value is
being the **easiest, most intuitive workout tracker**. Heavy, Strong and MacroFactor Workouts are the
reference points. That value lives almost entirely in the presentation layer.

Most of the logic the prototypes need already exists:

- Placeholder vs logged values: `PotentialSet` has `target` and `weight` vs `set`.
- RPE per set and warm-up sets (PM-2, PM-3).
- Per-exercise rest, and the background timer and notification (`docs/WorkoutWorker.md`).
- The progression rule engine, including double progression (`docs/Progression.md`).
- "Update the routine with today's changes" (`models/blueprint-diff.ts`, `app/diff-save.tsx`).
- The exercise catalog (~870 exercises) and the AI planner, which already emits blueprints against a JSON
  schema.

So this is a rebuild of screens and a few model additions, not a rewrite.

## Goals / non-goals

**Goals**

- The core loop takes the fewest taps and the least thought: start → log a set → rest → finish → see
  progress.
- The app has its own visual language, in light and dark, with an **accent colour the user picks**.
- Every screen is replaced one at a time on `main`, and the app stays usable for real workouts after
  every PR.

**Non-goals** (separate work)

- The storage rewrite (PM-8 and its children). This plan doesn't depend on it, and the two can proceed in
  parallel.
- Exercise images or animations. There are no assets for them; exercise tiles are text.
- New progression rule kinds (RPE-based, deloads).
- iPad or landscape layouts.

## Design summary

- **Look.** A warm off-white ground, white cards with a hairline border, near-black ink, and one accent
  colour (vermilion by default). Dark mode uses a warm near-black instead of pure black.
- **Type.** Geist for text and Geist Mono for every number, so weights, reps and timers line up.
- **Tabs.** Home · Routines · Progress · You. Programs move out of Settings. Settings and the (optional)
  feed live under You.
- **Home.** Shows history for the last 7 days, with a toggle to 30 days (week strip or calendar), plus a
  list of workouts. At the top is an "Up next" card with one **Start** button. While a workout is
  minimised, a "workout in progress" bar sits above the tab bar.
- **Live workout.** Focus mode, one exercise (or one superset) at a time:
  - A horizontal strip of exercise tiles across the top, each showing sets done, plus an "All exercises"
    sheet for overview and reordering.
  - A set table with Set / Previous / kg / Reps / ✓.
  - Tapping the set badge opens a set-type sheet.
  - Weight and reps start as light placeholders showing today's target. Tapping a field empties it, and
    an untouched field logs the placeholder.
  - A custom number pad: ± steps, plate maths, and RPE chips that clear when tapped again.
  - A rest timer pill in the header that opens a rest sheet: ±15, skip, presets, and "save as this
    exercise's default".
- **Finish.** An "Update your routine?" sheet listing only structural changes; weights and reps are
  progression's job. Then a summary: duration, volume vs last time, sets, PRs, a comparison per exercise,
  how it felt, and next time's targets.
- **Routines.** The active program (with the next workout and a Start button), templates, and a program
  library. The routine editor has collapsible exercise cards: set steppers, rest presets, a progression
  choice, and supersets that move as one unit. Plus an exercise picker and an "Ask AI to change this
  routine" bar. A new routine offers four starts: pick exercises, describe it (AI), import (spreadsheet,
  CSV, screenshot or photo), or start from a program.

## Key decisions

**D1. Our own visual language for content, native controls for system chrome.**

- Content surfaces are our own components: cards, set rows, the number pad, summaries.
- System chrome stays native: tabs, sheets, menus, switches, date pickers.
- This narrows the current direction in `AGENTS.md`, which migrates Paper controls to expo-ui
  everywhere.
- Recorded in [ADR-0002](../adr/0002-own-visual-language.md), which also updates `AGENTS.md` and the
  `expo-ui-migration` skill.

**D2. The theme is a fixed warm neutral scale plus one user-chosen accent.**

- Only the accent family changes with the user's choice:
  - the accent fill;
  - accent text;
  - a soft background and the ink on it;
  - wash and border tints;
  - the accent on inverted surfaces.
- The neutrals stay the same, so every accent sits on the same calm ground.
- The accent family is **generated** from the chosen colour with HCT tones
  (`@material/material-color-utilities`, already used by `useAppTheme`). Picking tones by lightness
  guarantees these contrast ratios in both modes:
  - white text on the accent fill ≥ 4.5:1;
  - accent text on a card ≥ 4.5:1.
- An arbitrary colour, including a very light one like yellow, still gives a legible theme. Bright hues
  get pulled darker for the fill and lighter for dark-mode text, so they may look duller than picked.
- Keep the existing `colorSchemeSeed` preference and `theme-chooser.tsx`. Swap Material's presets for a
  curated set (vermilion, forest, blue, violet, rose, teal, amber) and keep the custom wheel.
- A fresh install follows the wallpaper. The seed's default value, `'default'`, means **Match wallpaper**:
  Material You's primary becomes the accent source. Vermilion is the fallback on devices that can't match
  the wallpaper (before Android 12, and iOS).
- `themeMode` (system/light/dark) stays. `trueBlackDarkTheme` becomes a variant of the dark neutrals.
- Routine colours are a separate, per-routine choice, and the accent never changes them.

**D3. Fonts.** Geist and Geist Mono (OFL), embedded with the `expo-font` plugin from `@expo-google-fonts/geist`
and `geist-mono`. Numbers that change or line up keep their width: Geist Mono for bare numbers, Geist's
tabular figures where a number has letters in it. Type sizes follow the existing `font` scale in
`useAppTheme`, with Geist weights. Details in [Theming.md](../Theming.md#type).

**D4. Tabs: Home · Routines · Progress · You.**

- The current `(session)` home becomes Home.
- `history/` folds into Home.
- `stats/` becomes Progress.
- Program management moves from `settings/program-list` and `manage-workouts` into Routines.
- Settings and the feed move under You. The feed still only shows when `showFeed` is on.
- Built in PM-24 (see [Home.md](../Home.md)). The route folders keep their names: `history/` moved inside
  `(session)/`, Routines is a new `routines/` folder, and the feed left the tabs for the root stack, so
  every URL still resolves.

**D5. Rest.**

- The model keeps `Rest {minRest, maxRest, failureRest}`.
- The UI shows one rest time (`minRest`) with presets.
- The min/max window and failure rest move to an "Advanced" section in the editor, and still drive the
  timer phases.
- "Save as this exercise's default" writes the blueprint's rest.

**D6. Set types become `working | warmup | drop | myo | failure`** (extending `SetKind`). What each one
counts towards:

| Type | Volume | PRs | Progression check | Carry-over |
|---|---|---|---|---|
| working | yes | yes | yes | yes |
| warmup | no | no | no | no (as today) |
| failure | yes | yes | yes | yes |
| drop | yes | no | no | no |
| myo | yes | no | no | no |

- Carry-over "no" means a drop or myo set doesn't continue the progression. It still opens on its own weight
  from last session, as a starting point the rules never move.
- A warm-up's percentage is taken from the heaviest set in the working list, drop and myo sets included.
- This needs a storage migration (skill `add-storage-migration`) and a worker message schema bump.
- It also touches the plan/AI schemas (regenerate with `npm run json-schema`), plaintext export and CSV
  import.
- Only working sets get numbers. Other types show a letter: W, D, M or F (F is red).

**D7. Sheets.**

- Navigational sheets (the exercise list, set type, rest, update routine, the exercise picker) use
  expo-router `presentation: 'formSheet'` with detents, so they're native.
- The number pad is an in-screen panel animated with Reanimated, not a sheet, so the set being edited
  stays visible.
- Avoid a sheet library unless formSheet can't handle a case.

**D8. The number pad and plate maths.**

- Weight and reps use our own number pad, not the system keyboard, both in the live workout and in the
  routine editor. One input system everywhere; the editor doesn't keep steppers.
- The ± step depends on equipment: barbell 2.5 kg / 5 lb, dumbbell 2 kg / 5 lb, machine and cable 2.5 kg /
  5 lb. When the equipment is unknown, the step falls back to the blueprint's weight increment.
- Plate maths needs a bar weight and a plate set per unit. These are new preferences with sensible
  defaults (20 kg / 45 lb bar, standard plates), following `add-setting-or-preference`.
- It respects `useImperialUnits`.

**D9. Replace screen by screen, no feature flag.** Each PR moves a whole screen to the new look and
leaves the app usable. Old components are deleted once their last caller moves. While screens are mixed,
Paper's theme is derived from the new tokens, so unconverted screens pick up the new colours instead of
clashing.

## Phases

Each numbered step is one Linear issue (child of PM-16) and roughly one PR.

**Phase 0: decide**

1. **PM-17.** Write ADR-0002 (D1) and update `AGENTS.md` and the `expo-ui-migration` skill.

**Phase 1: foundation (little visible change)**

2. **PM-18.** Theme tokens: neutrals, a generated accent family, light and dark, and Paper and navigation themes
   derived from them (D2). The accent picker is rebuilt on the curated presets.
3. **PM-19.** Fonts and type (D3).
4. **PM-22.** Core components in `components/presentation/foundation/`: Card, Chip, SegmentedControl, IconButton,
   ListRow, SetBadge, ProgressBar, Toast. Plus the sheet conventions from D7.
5. **PM-20.** Number pad with plate maths and the bar/plate preferences (D8).
6. **PM-21.** Drop, myo and failure set types in the model (D6).

**Phase 2: the gym loop**

7. **PM-23.** Live workout, part 1: focus mode, the exercise strip, supersets on one page, and the "All exercises"
   sheet.
8. **PM-29.** Live workout, part 2: set logging with placeholders, the number pad, RPE chips and the set-type
   sheet.
9. **PM-30.** Live workout, part 3: the rest pill, the header progress line, the rest sheet and "save as default"
   (D5).
10. **PM-31.** Finish: the "Update your routine?" sheet on top of the existing diff, and the summary screen.

**Phase 3: plan and look back**

11. **PM-24.** New tab structure (D4) and the Home screen: history, the Up next card, and the in-progress bar.
12. **PM-26.** Routines tab and the routine editor, including the Advanced rest section. Weights and reps use
    the number pad (D8). Related: PM-4.
13. **PM-32.** Exercise picker: search, muscle and equipment filters, recents, order of selection, create custom.
    From first use on a phone:
    - A new exercise must start with an empty name and a placeholder. Today `useAddExercise` and
      `exercise-manager.tsx` save "New Exercise" as the real name, so it has to be deleted before typing.
    - The built-in exercise library is too small. A bigger one belongs here or in its own issue.
14. **PM-25.** Past workout detail (a single list) with "Do again" and "Save as routine". See
    [WorkoutDetail.md](../WorkoutDetail.md).

**Phase 4: needs design first**

15. **PM-27.** Progress tab: charts per exercise, PR history, estimated one-rep max.
16. **PM-33.** AI routine builder: the Describe / Import (including screenshot and photo) / Program flows, all
    landing in the routine editor. This builds on `settings/ai/planner.tsx` and the `AiPlan` schema.
17. **PM-28.** Sharing routines between two people's phones.

Dependencies: 2 → 3 → 4 → (7, 11, 12, 14). Step 5 and step 6 → 8. Step 7 → 8 → 9 → 10. Step 12 → 13.

## Verification

- Every PR runs `npm test`, `npm run typecheck` and `npm run lint`.
- Screen PRs also run `verify-liftlog`, with screenshots in light **and** dark and at least one
  non-default accent.
- Model changes (step 6) get migration tests and regenerated schemas.
- The PM-9 behaviour snapshots stay unchanged, apart from documented set-type additions.

## Risks

- **Mixed screens during the transition.** Deriving Paper's theme from the new tokens (D9) keeps
  unconverted screens coherent, even though they won't match the new design exactly.
- **Live workout performance.** The strip, the set table, the ticking timers and the number pad all
  re-render often. Keep timers in isolated components, and measure on a low-end Android device.
- **Accessibility.** Custom controls need labels, roles and ≥ 44 pt targets. The number pad has to work
  with a screen reader. Dynamic type should scale text without breaking the set table.
- **Colour generation.** Some hues (yellow, cyan) become duller once contrast is enforced. Unit-test the
  generator against the contrast thresholds for every preset and a sample of random hues.

## Open questions

Answered:

- The number pad replaces the keyboard in the routine editor too (D8, step 12).
- RIR isn't offered as an alternative to RPE, for now.

Still open:

- Does Progress (step 15) need its own round of prototypes before it's built? Probably yes.
- The summary's date line names the program but not the canvas's "session 13 of 18". Programs repeat with
  no set length, and a session doesn't record its program or cycle, so showing progress needs a model change.
- The live workout's All exercises sheet keeps its always-visible drag handles instead of the canvas's
  Reorder button. Mid-workout that's one drag, not a tap into reorder mode and then a drag.

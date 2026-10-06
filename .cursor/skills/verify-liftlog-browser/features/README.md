# LiftLog browser verification map

Read this index before driving the browser prototype. The map covers shared workout controls and their
stored results. Native app routes, system controls, and services use the
[Android feature map](../../../../.claude/skills/verify-liftlog/features/README.md).

## Baseline preconditions

- Run commands from `app/` with the dependencies and Chromium installed as described in
  [Launch](../SKILL.md#launch).
- Use a new run with the **Browser verification** workout and **Barbell Bench Press**, two unlogged
  working sets, 0 kg, and a target of 5 reps.
- Require **Workout saved** before a mutation or reload. Require doctor to pass before a manual drive.
- Use `npm run verify:browser -- <scenario>` for a fresh fixture and automatic cleanup. Manual `drive`
  reuses the active database, so a previous mutation may change the preconditions.

## Driving conventions

Playwright opens headless Chromium with `en-US` and reduced motion. The outer page holds a stable
workout iframe. Regular uses a genuine 390 × 844 viewport and Large uses 430 × 932. The default test
command checks both on separate fresh databases. Manual `drive` checks Regular unless passed `large`.
The driver uses outer button roles for viewport selection and frame-scoped accessible names for workout
actions. Screenshots capture the selected iframe size. Every drive also checks viewport dimensions,
partial input and theme preservation, unchanged SQL during switches, and scrolling with the keypad open.
Every drive ends with at least 16 sets, so a later manual workout drive requires a fresh fixture.
The prototype URL opens directly into the workout preview. Mobile Home, routines, and resume-workout entry points are outside this map.

Each feature page names the scenario command and the exact selectors it drives. Run the command rather
than pasting individual `page` calls into a shell. Those calls describe the steps in `drive.mjs`.

## Proof and skip reporting

Use the manifest and trace to verify the action sequence. Review screenshots with their ARIA snapshots,
then compare SQL evidence before and after each stored mutation. Report the scenario, exit code, run ID,
environment, and proof path. Report a path that did not run as `NOT RUN`; a passing browser scenario does
not verify its native counterpart. See [Evidence](../SKILL.md#evidence) for retained files and boundaries.

## Features

- [Resize the workout preview](viewports.md) covers genuine viewport sizes, draft and appearance
  preservation, and keypad containment with an overflowing workout. Every scenario.
- [Log and undo a workout set](workout.md) covers decimal weight entry, reps, logging, browser reload,
  server restart, and persisted undo. Scenario `workout`.
- [Add a workout set](sets.md) covers the Add set control and the new row after reload. Scenario `sets`.
- [Change workout appearance](themes.md) covers light, dark, and blue accent screenshots without changing
  stored workout rows. Scenario `themes`.

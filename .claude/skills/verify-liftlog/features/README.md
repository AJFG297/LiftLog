# LiftLog verification map

This directory is the maintained source for verifying LiftLog's user-facing behavior on Android. Read this index
before driving the app, then use the matching feature file as the recipe. Commands below are
`verify.sh` = `.claude/skills/verify-liftlog/verify.sh`.

## Baseline preconditions

- `verify.sh up` has run from this checkout and `verify.sh doctor` prints `doctor: healthy`.
- `verify.sh flow .claude/skills/verify-liftlog/flows/ready.yaml` exited 0 in this run (welcome wizard and dev-menu
  sheet are out of the way; Workout tab shows `Freeform workout`).
- The emulator's app data persists between runs. Check the starting state instead of assuming an empty app:
  `verify.sh db "select count(*) from session;"`, and on the Workout tab, whether a `Current workout` card is up.
- Never drive `emulator-5554` or any device that `doctor` does not report as ours.

## Driving conventions

- Every flow: `appId: com.limajuice.liftlog`, `---`, `- launchApp`, then
  `- extendedWaitUntil: {visible: 'Workout', timeout: 60000}`.
- Prefer `id:` (React Native `testID`) over text. Text is a case-insensitive full-string regex; use `(?-i)` when a
  lowercase/uppercase variant appears elsewhere (e.g. `'(?-i)Freeform workout'` vs `Freeform Workout` cards).
- A session left in progress by an earlier run blocks starting a new one. Guard with
  `runFlow: {when: {visible: 'Replace current workout?'}, commands: [{tapOn: 'Replace'}]}`.
- Put scratch flows in the run's evidence dir; run each with `verify.sh flow <file> <feature-id>`.
- Remove what a flow creates (plans, exercises), as `app/.maestro/creating-a-plan.yaml` does, but keep its evidence.

## Proof and skip reporting

- Capture the action and the resulting state: `takeScreenshot` after the key tap and on the result screen.
- Anything persisted is proven from a second view: reopen it in the UI (History, reopening an editor) and/or
  `verify.sh db` before and after.
- Report run id, flow labels, exit codes and evidence paths. Name each entry point in the feature file you did not
  drive; do not report it as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior, then exactly
four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Maestro`
(starting with `Preconditions:`), and `Gotchas`. Keep implementation details out; name user paths, stable handles,
required state, commands, and observable proof.

## Features

- [Workout session](./workout-session.md) - start a freeform or planned workout, log sets and weights, rest timer,
  finish, and see it in History. **Proven end to end** by the skill's own shakedown run.
- [Cardio session](./cardio-session.md) - cardio exercises in a workout: metric tiles, the timer pane, typed
  durations.
- [Plans and workout editor](./plans.md) - create a plan, add workouts and exercises, sets/reps, superset, and
  progression rules.
- [Exercise manager](./exercise-manager.md) - the exercise library: add, rename, describe, filter, delete with undo.
- [History](./history.md) - streak card, calendar, past session summaries, editing, deleting and restarting a past
  workout.

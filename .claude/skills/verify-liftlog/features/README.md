# LiftLog verification map

This directory is the maintained source for verifying LiftLog's user-facing behavior on Android. Read this index
before driving the app, then use the matching feature file as the recipe. Commands below are
`verify.sh` = `.claude/skills/verify-liftlog/verify.sh`.

## Baseline preconditions

- `verify.sh up` has run from this checkout and `verify.sh doctor` prints `doctor: healthy`.
- `verify.sh flow .claude/skills/verify-liftlog/flows/ready.yaml` exited 0 in this run (welcome wizard and dev-menu
  sheet are out of the way; the Home tab is up).
- The emulator's app data persists between runs, and the next `up` may land on another slot. Start from a known
  state: `verify.sh seed ppl-history` for plans and two weeks of history, or `verify.sh seed empty` for an
  onboarded app with no history (see [fixtures](../fixtures/README.md)). Without a seed, check the starting state
  instead of assuming an empty app: `verify.sh db "select count(*), sum(active) from workout;"`, and on Home,
  whether the workout-in-progress bar (`workout-in-progress-bar`) is up.
- The tabs are Home, Routines, Progress and You. All history and the feed are pages, not tabs: Home →
  `All history`, and You → `Feed` (only with Show feed on).
- Never drive `emulator-5554` or any device that `doctor` does not report as ours.

## Driving conventions

- Every flow: `appId: com.ajfg297.liftlog`, `---`, `- launchApp`, then
  `- extendedWaitUntil: {visible: 'Home', timeout: 60000}`.
- Prefer `id:` (React Native `testID`) over text. Text is a case-insensitive full-string regex; use `(?-i)` when a
  lowercase/uppercase variant appears elsewhere (e.g. `'(?-i)Freeform workout'` vs `Freeform Workout` cards).
- A workout left in progress by an earlier run hides Home's Up next card and `Freeform workout`. Clear it first, as
  `app/.maestro/completing-a-session.yaml` does: `runFlow: {when: {visible: {id: 'workout-in-progress-bar'}}, commands:
  [{tapOn: {id: 'workout-in-progress-more'}}, {tapOn: 'Clear current workout'}, {tapOn: 'Clear'}]}`. Starting a
  past workout from All history still asks `Replace current workout?` instead.
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
  finish, and see it on Home and in All history. **Proven end to end** by the skill's own shakedown run.
- [Cardio session](./cardio-session.md) - cardio exercises in a workout: metric tiles, the timer pane, typed
  durations.
- [Plans and workout editor](./plans.md) - create a plan, add workouts and exercises, sets/reps, superset, and
  progression rules.
- [Exercise manager](./exercise-manager.md) - the exercise library: add, rename, describe, filter, delete with undo.
- [History](./history.md) - Home's last 7 or 30 days, and All history: streak card, calendar, past session summaries,
  editing, deleting and restarting a past workout.

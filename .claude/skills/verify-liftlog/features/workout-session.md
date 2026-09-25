# Workout session

A user starts a workout (freeform, or the next one from their plan), taps a set's rep counter to log it, which starts
a rest timer, adjusts the weight, and finishes the workout. The finished workout shows in History with its logged
sets, and an unfinished one stays on the Workout tab as `Current workout` until resumed or cleared.

## Sub-features

- `session-start-freeform` starts an empty freeform workout from the Workout tab.
- `session-start-planned` starts the next planned workout from an `Upcoming Workouts` card.
- `session-log-set` taps a set's rep counter to record it and starts the rest timer.
- `session-weight` edits a set's weight with the increment/decrement dialog and applies it to one, uncompleted, or all
  sets.
- `session-finish` finishes the workout (confirming when sets are incomplete) and hands it to History.
- `session-resume-clear` resumes or clears an in-progress workout from the `Current workout` card.

## How to get to it (user POV)

- Workout tab → `Freeform workout` button (top-right floating action).
- Workout tab → `Upcoming Workouts` card → `Start` / `Resume workout`.
- Workout tab → `Current workout` card → `Resume workout` or the delete icon (`Clear current workout`).
- History tab → a past session → play icon (`Start this workout`). See [History](./history.md).

## Driving it with Maestro

Preconditions:

- Baseline from the [index](./README.md). Note the starting count: `verify.sh db "select count(*), sum(active) from session;"`.

- **Whole path in one go.** The repo's e2e flow covers freeform start → add exercise → log set → weight 7.5kg → finish
  → History. Run `verify.sh flow app/.maestro/completing-a-session.yaml workout-session`. Exit 0; `maestro.log`
  ends with `Scrolling DOWN until ".*7\.5kg" is visible... COMPLETED`, and `final.png` shows History with a
  `Freeform Workout` card reading `New Exercise   10 @ 7.5kg`.
- **Start freeform.** `tapOn: 'Workout'`, `tapOn: '(?-i)Freeform workout'`, then the `Replace current workout?` guard.
  The session screen opens with `Add exercise`.
- **Add an exercise.** `tapOn: 'Add exercise'`, then `back` to accept the default (`New Exercise`, 3×10, weighted).
  The exercise card shows three rep counters.
- **Log a set.** `tapOn: {id: 'repcount'}` (the first set). `assertVisible: {id: 'rest-timer'}` - the rest timer
  appears.
- **Change weight.** `tapOn: {id: 'repcount-weight'}`, `tapOn: {id: 'increment-weight'}` ×3, `tapOn: {id: 'save'}`.
  With the default 2.5kg increment the set reads 7.5kg. Scope buttons in that dialog:
  `repcount-apply-weight-to-this-set`, `repcount-apply-weight-to-uncompleted-sets`, `repcount-apply-weight-to-all-sets`.
- **Finish.** `tapOn: {id: 'finish-session-button'}`, then `tapOn: {id: 'action-ok'}` (the incomplete-sets confirm).
  A freeform session then asks `Would you like to save this workout to your plan?` - `back` declines.
- **Resume / clear.** Leave a session unfinished (`back` out of it), then on the Workout tab use
  `tapOn: {id: 'resume-workout-button'}` or `tapOn: {id: 'clear-current-workout'}` → `tapOn: 'Clear'`.
- **Proof.** `verify.sh db "select active, json_extract(payload,'$.blueprint.name') name, json_extract(payload,'$.recordedExercises[0].potentialSets[0]') set1 from session;"`
  shows a new row with `active=0`, name `Freeform Workout`, and `set1` containing `"repsCompleted":10` and
  `"weight":{"unit":"kilograms","value":"7.5"}`. While a session is in progress its row has `active=1`.

## Gotchas

- Unit defaults to kg; a run that toggled `setUseImperialUnits` in Settings changes the increments and the `7.5kg`
  assertion.
- `'Freeform workout'` without `(?-i)` also matches `Freeform Workout` session cards from earlier runs.
- History's summary line is `10 @ 7.5kg`; Maestro `text` is a full-string match, so use `'.*7\.5kg'`.
- Rest-timer notifications may raise an Android notification-permission dialog on some images; if a flow stalls,
  `verify.sh ui` and look for `Allow`.
- Every run adds a History row that is not cleaned up; count rows before/after rather than asserting an absolute total.

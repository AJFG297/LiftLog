# Workout session

A user starts a workout (freeform, or the next one from their plan) from Home, ticks a set's check to log it, which
starts the rest timer in the header, adjusts the weight on the number pad, and finishes the workout. The finished
workout shows on Home and in All history with its logged sets. An unfinished one shrinks to the workout-in-progress
bar above the tab bar on every tab until it is resumed or cleared.

## Sub-features

- `session-start-freeform` starts an empty freeform workout from Home.
- `session-start-planned` starts the next planned workout from Home's Up next card.
- `session-log-set` ticks a set's check to record it and starts the rest timer.
- `session-weight` edits a set's weight on the number pad.
- `session-finish` finishes the workout (confirming when sets are incomplete) and hands it to history.
- `session-resume-clear` resumes or clears an in-progress workout from the workout-in-progress bar.

## How to get to it (user POV)

- Home → `Freeform workout` (under the Up next card, or in the empty card when there is no plan).
- Home → Up next card → `Start <workout name>` (`up-next-start`). `Other` goes to Routines.
- Any tab → the workout-in-progress bar → tap it to resume, or its `...` menu → `Resume workout` / `Clear current workout`.
- Home → `All history` → a past session → play icon (`Start this workout`). See [History](./history.md).

## Driving it with Maestro

Preconditions:

- Baseline from the [index](./README.md). Note the starting count: `verify.sh db "select count(*), sum(active) from workout;"`.

- **Whole path in one go.** The repo's e2e flow covers freeform start → add exercise → log set → weight 7.5kg → finish
  → All history. Run `verify.sh flow app/.maestro/completing-a-session.yaml workout-session`. Exit 0; `maestro.log`
  ends with `Scrolling DOWN until ".*7\.5kg" is visible... COMPLETED`, and `final.png` shows All history with a
  `Freeform Workout` card reading `New Exercise   10 @ 7.5kg`.
- **Start freeform.** `tapOn: 'Home'`, the in-progress guard from the [index](./README.md), then
  `tapOn: '(?-i)Freeform workout'`. The workout screen opens with `Add exercise`.
- **Add an exercise.** `tapOn: 'Add exercise'`, then `back` to accept the default (`New Exercise`, 3×10, weighted).
- **Log a set.** `tapOn: {id: 'set-check'}` (the first set). The header's `rest-pill` switches to a countdown: its
  `content-desc` reads `Rest timer, <time> left`.
- **Change weight.** `tapOn: {id: 'set-weight'}`, `tapOn: 'Add 2.5 kg'` ×3, `tapOn: 'Hide keypad'`. The set reads 7.5kg.
- **Finish.** `tapOn: {id: 'finish-session-button'}`, then `tapOn: {id: 'action-ok'}` (the incomplete-sets confirm).
  A freeform session then asks `Would you like to save this workout to your plan?` - `back` declines.
- **Resume / clear.** Leave a workout unfinished (`back` out of it). `assertVisible: {id: 'workout-in-progress-bar'}`
  on any tab; `tapOn: {id: 'workout-in-progress-bar'}` resumes it, or `tapOn: {id: 'workout-in-progress-more'}` →
  `tapOn: 'Clear current workout'` → `tapOn: 'Clear'` clears it.
- **Proof.** `verify.sh db "select w.active, w.name, json_extract(e.blueprint,'$.name') exercise, s.position, s.reps, s.weight_value, s.weight_unit, s.completed_at from workout w join workout_exercise e on e.workout_id = w.id join weighted_set s on s.workout_id = e.workout_id and s.exercise_position = e.position where w.id = (select id from workout order by rowid desc limit 1) order by e.position, s.position;"`
  lists the newest workout's slots: `active=0`, name `Freeform Workout`, exercise `New Exercise`, and the
  `position=0` slot with `reps=10`, `weight_value=7.5`, `weight_unit=kilograms` and a `completed_at`. Unlogged
  slots have `reps` and `completed_at` empty. While a workout is in progress its row has `active=1`.

## Gotchas

- Unit defaults to kg; a run that switched to imperial units changes the number pad's steps and the `7.5kg`
  assertion.
- `'Freeform workout'` without `(?-i)` also matches `Freeform Workout` session cards from earlier runs.
- A workout in progress hides Home's Up next card and `Freeform workout`; clear it before starting a new one.
- The rest pill is in the header whether or not a rest is running (idle it shows the exercise's rest), so prove a
  running rest from its `content-desc`, not from its presence.
- The bar's next set follows the page the workout is open on. That page is kept across an app restart (key
  `LiveWorkoutFocus`), so after one the bar and the reopened workout still show the page left open.
- All history's summary line is `10 @ 7.5kg`; Maestro `text` is a full-string match, so use `'.*7\.5kg'`.
- Rest-timer notifications may raise an Android notification-permission dialog on some images; if a flow stalls,
  `verify.sh ui` and look for `Allow`.
- Every run adds a history row that is not cleaned up; count rows before/after rather than asserting an absolute total.

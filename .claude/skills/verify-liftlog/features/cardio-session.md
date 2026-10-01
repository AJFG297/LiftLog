# Cardio session

Inside a workout, a user can add a cardio exercise instead of a weighted one. Its set shows tiles for the metrics
the plan tracks (duration, distance), a play/pause clock that docks a timer pane while running, and tiles that accept
typed values without using the clock.

## Sub-features

- `cardio-add` adds a cardio exercise to a workout from the exercise editor's cardio toggle.
- `cardio-tiles` shows metric tiles (duration, distance) for what the plan tracks, before anything is entered.
- `cardio-timer` starts/stops the clock and docks/undocks the timer pane.
- `cardio-typed` types a duration directly into the time tile.
- `cardio-trackers` toggles tracked metrics in the exercise editor (`track-time-switch`, `track-distance-switch`).

## How to get to it (user POV)

- Home → `Freeform workout` → `Add exercise` → cardio button → back.
- Routines → a plan → a workout → an exercise → cardio toggle (plan-level; see [Plans](./plans.md)).

## Driving it with Maestro

Preconditions:

- Baseline from the [index](./README.md).

- **Whole path in one go.** Run `verify.sh flow app/.maestro/cardio-session.yaml cardio-session`. Exit 0.
- **Add cardio.** After starting freeform (with the in-progress guard from the [index](./README.md)): `tapOn: 'Add exercise'`,
  `tapOn: {id: 'cardio-button'}`, `back`.
- **Tiles present.** `assertVisible: {id: 'cardio-duration-tile'}`, `assertVisible: {id: 'cardio-distance-tile'}`,
  `assertNotVisible: {id: 'add-tracker-button'}`.
- **Clock.** `tapOn: {id: 'cardio-timer-play-pause'}` → `assertVisible: {id: 'cardio-timer'}`; tap again and the
  pane goes away.
- **Typed duration.** `tapOn: {id: 'cardio-duration-tile'}`, `tapOn: {id: 'duration-editor-seconds'}`, `eraseText`,
  `inputText: '45'`, `hideKeyboard`, `tapOn: {id: 'cardio-value-save'}` → `assertVisible: '45'`.
- **Finish and prove.** `tapOn: {id: 'finish-session-button'}`, `tapOn: {id: 'action-ok'}`. Then
  `verify.sh db "select e.kind, json_extract(e.blueprint,'$.name') exercise, c.position, c.duration, c.distance_value, c.distance_unit, c.completed_at from workout w join workout_exercise e on e.workout_id = w.id join cardio_set c on c.workout_id = e.workout_id and c.exercise_position = e.position where w.id = (select id from workout order by rowid desc limit 1) order by e.position, c.position;"`
  shows a `cardio` exercise whose set has `duration=PT45S`.

## Gotchas

- `cardio-timer-play-pause`, `cardio-duration-tile` and similar IDs are passed through props, so
  `grep "testID=\"cardio"` misses them; grep for the string itself.
- The repo flow ends without declining the "save this workout to your plan?" prompt; a follow-up flow may start
  on that dialog. `back` clears it.
- A running clock keeps a foreground notification alive; stop it before `down` so the next run doesn't start on it.

# Live workout

The workout in progress (`app/src/app/(tabs)/(session)/session/index.tsx`) shows one exercise, or one
superset, at a time. It is PM-23 of the [redesign plan](./plans/redesign.md); PM-29 replaces the set
logging on the page, and PM-30 moved rest into the header.

## What is on screen

- **Header** (`LiveWorkoutHeader`): minimise (back to Home, the workout keeps running), the workout name
  (tap it to edit the name and notes), the elapsed time since the first set, the rest pill, and Finish.
  While resting, a thin line along the header's bottom edge shows the share of the rest still to go.
- **Exercise strip** (`ExerciseStrip`): one tile per exercise with its label, name, sets done out of
  planned and a progress bar. The tiles of the page on screen are drawn inverted, and the strip scrolls to
  keep them in view. The last tile adds an exercise.
- **Focus page**: a card per exercise (`LiveExerciseCard`) with its equipment and rest, the History,
  Warm-up, Note and Swap shortcuts, the Today target card, and the sets. A superset page starts with a
  banner.
- **Up next bar** (`UpNextBar`): the next unfinished page. It fills with the accent once the page on
  screen is done, and turns into Finish when nothing after it is left. A running cardio clock docks above
  it.
- **All exercises sheet** (`session/exercises`, a `formSheet`): every exercise with its status, sets and
  target. Tap to jump there; drag a handle to reorder. Add exercise and Make superset sit above the list,
  so they are in reach at the sheet's first detent, and open the existing flows. The Workout summary row
  at the top of the list opens the post-workout summary for the workout so far.

## Rest

The rest pill (`RestPill`, wired up in `components/smart/live-rest.tsx`) has three looks:

- **Resting**: dark, with a Geist Mono countdown of the first phase of the rest, rounded up to the second.
- **Rest over**: the accent, reading "Go · Set 3" (the next set on the page, or "Next" once the page is
  done) until the next set is logged and restarts the timer.
- **Idle**: outlined, with the rest of the exercise whose set is next on the page.

With rest timers turned off in the settings, the pill is hidden. It buzzes (`haptics.restOver`) when the
countdown runs out and again when the min to max window closes, unless the moment passed while the app was
in the background, where the notification has it covered.

Tapping the pill opens the **rest sheet** (`session/rest`, a `formSheet`, `components/smart/rest-sheet.tsx`):
the countdown, what is up next and a progress bar; -15, Skip rest and +15 while resting; presets from 0:30
to 3:00; and "Use 2:00 for Bench Press from now on" when the length picked differs from the exercise's rest.
Skip rest clears the timer and closes the sheet, so the pill goes idle.

All of it is `models/session-models/rest.ts`:

- `Session.restTimer` is a `RestTimer`: when the rest started and, optionally, a `length` picked in the
  sheet. Without one it runs for the rest the latest set earned: the min rest, or the failure rest after a
  missed set, and only the min rest after a warm-up.
- `restWindowOf(session)` turns that into instants: `readyAt`, where the pill turns to Go, and `fullAt`, the
  end of the min to max window. A picked length replaces the first phase and the window keeps its width
  after it. The pill, the sheet, `Session.restTimerEndTime` (the "rest over" notification) and the workout
  worker all read it, so the app and the notification count down together.
- `withRestStepped` is -15 and +15. -15 moves the start back but stops one second short of the end, so the
  countdown still runs out on its own. +15 moves the start forward, or in the first 15 seconds lengthens the
  rest instead, so the timer never starts in the future. Both leave anything but a running countdown alone.
- `withRestStarted` is a preset: a new timer from now at that length, whether or not one was running.

"Use … from now on" writes the new min rest (`withMinRest` in `models/rest-default.ts`; the max rest rises
to meet it if it has to) to two places at once: the routine's exercise, found the way the finish diff finds
it (`routineExerciseLocation`: the routine with the workout's name, exercises matched by name), and the
running workout's exercise. The finish sheet compares the two, so it doesn't list the same rest change
again. The row turns into "Bench Press now rests 2:00" with Undo, which puts both rests back. It is only
offered for a weighted exercise that is in the workout's routine; a freeform workout or an exercise added
today has no routine exercise to save into.

The timer isn't part of a stored workout, so it is also kept in its own key (`ActiveRestTimer`, see
[Storage.md](./Storage.md#direct-keyvaluestore-use)) and put back once workouts are loaded, so a relaunch
picks the rest up where it was.

## How it is worked out

Nothing on the screen is stored except which exercise is in focus. The rest comes from the session:

- **Pages** are `exerciseGroupsOf` in `models/session-models/exercise-groups.ts`. It uses the same chain
  rule as `Session.nextExercise`: a weighted exercise with `supersetWithNext` joins the one after it, and
  the flag on the last exercise joins nothing. Supersets are lettered A, B, C in workout order, and their
  members labelled A1, A2.
- **The next set** on a page is `nextExerciseInGroup`. It takes `Session.nextExercise` when that points
  into the page, since that already alternates a superset's rounds, recomputes after an undo, and is what
  the notification shows. Otherwise the member with the fewest sets logged goes next.
- **Focus** is `app.liveWorkoutFocus` (`{ sessionId, exerciseIndex }`) in the app slice, read through
  `useLiveWorkoutFocus`. It lives in the store so it survives minimising and so the sheet, a route of its
  own, can move it. When nothing is stored the screen opens on the page of the next set and pins it, so
  finishing a page never moves the screen before the user taps Up next.
- **Reordering** is `withGroupMoved`: whole groups move, so a superset travels as one unit, and the
  session's exercises and blueprint move together. A `supersetWithNext` left on the last exercise is
  cleared once something follows it, because it would join that exercise.
- **Today's target** is `todaysTarget` in `models/session-models/todays-target.ts`. Progression runs once,
  at session start, and keeps no record of what it did, so the card compares today's top set with the
  performance it was carried from (`previousPerformanceIn`): heavier, lighter, more reps, the same after a
  success, or the same after a miss (naming the set that fell short). See [Progression.md](./Progression.md).

The workout worker's notification reads `Session.nextExercise` and the rest window above (see
[WorkoutWorker.md](./WorkoutWorker.md)).

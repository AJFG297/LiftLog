# Live workout

The workout in progress (`app/src/app/(tabs)/(session)/session/index.tsx`) shows one exercise, or one
superset, at a time. It is PM-23 of the [redesign plan](./plans/redesign.md); PM-29 replaces the set
logging on the page and PM-30 moves rest into the header.

## What is on screen

- **Header** (`LiveWorkoutHeader`): minimise (back to Home, the workout keeps running), the workout name
  (tap it to edit the name and notes), the elapsed time since the first set, a `restSlot` for the rest pill,
  and Finish.
- **Exercise strip** (`ExerciseStrip`): one tile per exercise with its label, name, sets done out of
  planned and a progress bar. The tiles of the page on screen are drawn inverted, and the strip scrolls to
  keep them in view. The last tile adds an exercise.
- **Focus page**: a card per exercise (`LiveExerciseCard`) with its equipment and rest, the History,
  Warm-up, Note and Swap shortcuts, the Today target card, and the sets. A superset page starts with a
  banner.
- **Up next bar** (`UpNextBar`): the next unfinished page. It fills with the accent once the page on
  screen is done, and turns into Finish when nothing after it is left. The rest timer docks above it.
- **All exercises sheet** (`session/exercises`, a `formSheet`): every exercise with its status, sets and
  target. Tap to jump there; drag a handle to reorder. Add exercise and Make superset open the existing
  flows.

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

The workout worker, its notification and background behaviour are untouched: they still read
`Session.nextExercise` and the rest timer (see [WorkoutWorker.md](./WorkoutWorker.md)).

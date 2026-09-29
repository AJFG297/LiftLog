# Live workout

The workout in progress (`app/src/app/(tabs)/(session)/session/index.tsx`) shows one exercise, or one
superset, at a time. It is PM-23 of the [redesign plan](./plans/redesign.md); PM-29 added the set table
and the number pad, and PM-30 moved rest into the header.

## What is on screen

- **Header** (`LiveWorkoutHeader`): minimise (back to Home, the workout keeps running), the workout name
  (tap it to edit the name and notes), the elapsed time since the first set, the rest pill, and Finish.
  While resting, a thin line along the header's bottom edge shows the share of the rest still to go.
- **Exercise strip** (`ExerciseStrip`): one tile per exercise with its label, name, sets done out of
  planned and a progress bar. The tiles of the page on screen are drawn inverted, and the strip scrolls to
  keep them in view. The last tile adds an exercise.
- **Focus page**: a card per exercise (`LiveExerciseCard`) with a meta line (equipment, rest or its place
  in a superset, and how many working sets), the History, Warm-up, Note and Swap shortcuts, the Today
  target card, and the set table (see below). A superset page starts with a banner. Cardio exercises still
  use the older set tiles.
- **Up next bar** (`UpNextBar`): the next unfinished page. It fills with the accent once the page on
  screen is done, and turns into Finish when nothing after it is left. A running cardio clock docks above
  it. While a weight or reps is being typed, the number pad takes the dock's place.
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
  performance it was carried from (`carriedFrom`: the latest with the key the routine gives the exercise,
  as the session was built, so a set added or moved during the workout doesn't lose it). A routine can
  plan a movement twice, so `plannedExerciseFor` pairs each with the routine exercise at the same place
  among that movement's. The comparison reads: heavier, lighter, more reps, the same after a
  success, or the same after a miss (naming the set that fell short). With nothing to compare against it
  says it's the first time, or, when the movement was done with other sets or reps, that the scheme is new,
  which is when Previous shows the latest performance instead. See [Progression.md](./Progression.md).

The workout worker's notification reads `Session.nextExercise` and the rest window above (see
[WorkoutWorker.md](./WorkoutWorker.md)).

## Logging a set

A weighted exercise's sets are a table (`SetTable` in `presentation/live-workout/`, wired up by
`LiveSetTable`): the set badge, Previous, the weight (`kg`, `kg each` for dumbbells, `lb` in imperial),
the reps, and a check. Warm-ups come first, then the working list. Previous is the same set of the
performance Today's target compares against, or of the latest one when the set scheme changed.

- **Placeholders.** An untouched weight and reps show today's target, `PotentialSet.weight` and the top of
  `PotentialSet.target`, in the `placeholder` grey. Typed or logged values are ink and bold. The check logs
  the set as the row shows it, so logging a set as planned is one tap. The next set is outlined.
- **Typing.** Tapping a field opens the [number pad](./NumberPad.md) with the field empty and its value as
  the placeholder. The pad takes the Up next dock's place, the page shrinks above it, and the screen
  scrolls the row into view if it is underneath. On weight the arrow moves to reps; on reps the check logs
  the set. Hiding the pad, tapping another field or leaving the page keeps what was typed.
- **Where typed values go.** A typed weight goes straight onto the slot, and later unlogged sets of the same
  kind that were on the same weight (and weren't typed themselves) follow it. Typed reps have no place on
  the slot until the set is logged, so they wait in a draft (`SetDraft`), which also records that a weight
  was typed. Drafts live in the app slice (`app.liveWorkoutDrafts`), keyed by session and by the
  exercise's index and name: they survive minimising and the set-type sheet, and aren't persisted.
- **Undo.** The check on a logged set undoes it and keeps its values: the draft still holds what was typed,
  and reps that missed the target are kept even without one. Logging or undoing restarts rest from the
  latest set, as the old set tiles did, and logging plays `haptics.setLogged()`.
- **RPE.** With Log RPE on, the reps pad of a working set has the RPE chips; they set `PotentialSet.rpe`
  straight away, and tapping the picked chip clears it. The reps show it as a small `@9`. Warm-ups have
  none.
- **Add set** adds one after the last with its weight, target, reps and type; a warm-up or a set to failure
  is followed by a working set. Reps that aren't the target (typed, or logged short of it) carry over as
  the new row's draft, so the target stays the plan's. It goes into the session's plan too, so finishing offers to keep it.
- **Set type.** Tapping the badge opens `session/set-type`, a `formSheet` with Working, Warm-up, Drop,
  Myo-reps and To failure. The session's plan takes the change, so finishing offers it as a routine change.
  Warm-ups have their own list, so a set that becomes one moves to the end of the warm-ups, and a warm-up
  that stops being one becomes the first working set. The last working set can't become a warm-up.

The rules are pure functions in `models/session-models/set-entry.ts` (`setRowsOf`, `withTypedValue`,
`withSetToggled`, `withAddedSet`, `withSetKind`); `useLiveSetEntry` holds what the pad is typing into and
applies them to the session and its drafts together.

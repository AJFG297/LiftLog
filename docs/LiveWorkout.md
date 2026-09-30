# Live workout

The workout in progress (`app/src/app/(tabs)/(session)/session/index.tsx`) shows one exercise, or one
superset, at a time. It is PM-23 of the [redesign plan](./plans/redesign.md); PM-29 added the set table
and the number pad, and PM-30 moves rest into the header.

## What is on screen

- **Header** (`LiveWorkoutHeader`): minimise (back to Home, the workout keeps running), the workout name
  (tap it to edit the name and notes), the elapsed time since the first set, a `restSlot` for the rest pill,
  and Finish.
- **Exercise strip** (`ExerciseStrip`): one tile per exercise with its label, name, sets done out of
  planned and a progress bar. The tiles of the page on screen are drawn inverted, and the strip scrolls to
  keep them in view. The last tile adds an exercise.
- **Focus page**: a card per exercise (`LiveExerciseCard`) with a meta line (equipment, rest or its place
  in a superset, and how many working sets), the History, Warm-up, Note and Swap shortcuts, the Today
  target card, and the set table (see below). A superset page starts with a banner. Cardio exercises still
  use the older set tiles.
- **Up next bar** (`UpNextBar`): the next unfinished page. It fills with the accent once the page on
  screen is done, and turns into Finish when nothing after it is left. The rest timer docks above it.
  While a weight or reps is being typed, the number pad takes the dock's place.
- **All exercises sheet** (`session/exercises`, a `formSheet`): every exercise with its status, sets and
  target. Tap to jump there; drag a handle to reorder. Add exercise and Make superset sit above the list,
  so they are in reach at the sheet's first detent, and open the existing flows. The Workout summary row
  at the top of the list opens the post-workout summary for the workout so far.

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

The workout worker, its notification and background behaviour are untouched: they still read
`Session.nextExercise` and the rest timer (see [WorkoutWorker.md](./WorkoutWorker.md)).

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
- **Deleting a set.** Swipe a row left (`SwipeToDelete`): a short swipe shows Delete, and a long swipe or a
  hard fling deletes it on release. Logged sets can go too. Later sets move up with their drafts, and the
  session's plan loses the set, so finishing offers the lower count as a routine change. Percentage
  warm-ups follow the working weight that is left. A toast offers Undo, which puts the set back with what
  was logged and typed. Deleting doesn't restart rest, and whatever was being typed into the set goes with
  it. The last working set can't be deleted. Screen readers get a delete action on the set's badge.

The rules are pure functions in `models/session-models/set-entry.ts` (`setRowsOf`, `withTypedValue`,
`withSetToggled`, `withAddedSet`, `withSetKind`, `withSetRemoved`, `withSetRestored`); `useLiveSetEntry` holds what the pad is typing into and
applies them to the session and its drafts together.

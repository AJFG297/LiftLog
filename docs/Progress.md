# Progress

The Progress tab (`app/src/app/(tabs)/stats/`) and the screens it opens: Records and All exercises. They all
read one model of the finished history, built in a single walk over it. This doc covers that model first,
then each screen.

## The history model

`store/stats/progress-history.ts` is pure (no React). `buildProgressHistory(sessionsOldestFirst)` returns a
`ProgressHistory`:

- `exercises`: one `ExerciseHistory` per movement (`MovementKey`, so a renamed exercise stays one entry).
  Only weighted exercises with a logged set count: cardio and exercises left untouched are not there.
  - `name` and `blueprint`: as it was last logged. Read the resistance and the exercise id (for muscles) off
    the blueprint, since that is how the exercise is set up now.
  - `points`: one `ExercisePoint` per workout that started it, oldest first. A workout that logged the
    movement twice gives one point.
    - `oneRepMax`: the best Epley estimate over the sets that count towards records (working and failure),
      with bodyweight folded in as records fold it. Undefined for a movement that tracks no load, and when
      only drop or myo sets were logged.
    - `bestReps`: the most reps in one of those sets, 0 if none: the axis of a movement that tracks no load.
    - `workingSets`: logged sets that count towards volume (every kind but warm-ups), as Stats' sets per
      week counts them.
- `records`: every record ever set (`SessionRecord`, see below), oldest first and in exercise order within a
  workout, each with the `workoutId` and `date` of the workout that set it.
- `firstDate`: the earliest workout's date, started or not, as `WorkoutRepository.earliestDate()` gives it.

`progressSince(history, since)` gives one movement's points on or after `since` and its `change` over them:
first against last estimated 1RM, or best reps for a movement that tracks no load (the axis comes from
`primaryAxisFor`, as in Stats). `change` is undefined with fewer than two points that have a value. Its
`delta` is a `Weight` in the last point's unit, so convert before showing it. `trendValues(progress, unit)`
turns the window into the plain numbers a `Sparkline` draws.

### The record ledger

`RecordLedger` (`store/stats/personal-records.ts`) is the one implementation of the record rules. It holds
the best estimated 1RM and the heaviest weight per movement, and `add(session)` returns the records that
workout sets against everything added before it, then folds it in:

- a set heavier than ever is a `heaviestWeight` record (external load only, since a bodyweight movement's
  load moves with the lifter's bodyweight);
- otherwise a better estimated 1RM is an `estimatedOneRepMax` record, with the set it comes from (`weight` as
  lifted, and `reps`);
- at most one per movement per workout, and none the first time a movement is seen;
- `previous` is the best it beat (the "was" value).

`sessionRecords(session, earlier)`, which the workout summary and workout detail use, is a ledger fed
`earlier` and then `session`. To read records over a whole history, feed one ledger oldest first rather than
calling `sessionRecords` per workout: that rebuilds the bests every time, O(n²) in workouts.

`findPersonalRecords` and `WorkoutRepository.personalRecords()` are a separate, older rule (estimated 1RM
only, no heaviest weight) behind the PR badges on the feed and on history cards. Don't mix the two on one
screen.

### Where it loads

`hooks/useProgressHistory.ts`: `useProgressHistory()` runs `loadProgressHistory` through `useWorkoutQuery`
(see [Storage.md](./Storage.md#reading-from-a-screen-useworkoutquery)). It reads `earliestDate()`, then
`finishedBetween(earliest, today)`, which comes back latest first, and reverses it for the walk. It is
undefined while loading and re-runs after each write. Every workout is rebuilt from its rows, so call it once
per screen and hand the result down.

### Why one walk

Every screen here needs the same three things over the whole history: each movement's points, its records
and where history starts. Built separately, each would rebuild every `Session` and walk them again, and
records per workout through `sessionRecords` cost O(n²). One pass with one ledger gives all three in O(n),
and the screens agree with each other and with the workout summary because they share the rules.

## The Progress tab



## Records and All exercises



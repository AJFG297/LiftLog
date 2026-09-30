# Workout detail

The screen a history card opens: one past workout as a single scrolling list (PM-25, [redesign plan](./plans/redesign.md)
phase 3 step 14). It isn't focus mode, because looking back needs the whole session at a glance. The route is
`/workout-detail?sessionId=` on the root stack (`app/src/app/workout-detail.tsx`); the screen itself is
`components/smart/workout-detail.tsx`, drawn from `components/presentation/workout-detail/`.

## What it shows

- **Header.** A routine swatch and the program day ("PPL · Day 1"), the workout's name, and the date with the time
  range from the first logged set to the last. The program day is the routine's position in the active program,
  matched by name, and is left out when the routine isn't in it. Routines have no colour of their own yet, so the
  swatch is a neutral grey.
- **Stats row.** Duration, volume in the preferred unit, working sets (warm-ups left out), and PRs. The figures come
  from `models/workout-summary.ts` and `sessionRecords`, the same as the workout summary, so the two screens agree.
- **One card per exercise.** The logged sets in the order the workout screen shows them, warm-ups first. Set labels
  are the `SetBadge` labels (`setBadgeText`): the working set's number, or W, D, M or F. Each set shows its weight,
  reps and estimated one-rep max (Epley, `calculateOneRepMax`), or "–" for a set that can't set a record (warm-up,
  drop, myo, or no load). A **PR** tag marks the first set that reached the workout's record for that movement.
  The line beside the name compares the best set with the last workout of the same routine ("+2.5 kg vs last").
  An exercise with nothing logged says "Not done"; a cardio exercise shows its one-line summary.

`sessionSetRows` in `models/workout-detail.ts` builds the table rows.

## What it does

- **Do again** starts a new workout with the same exercises and sets, nothing logged, through the usual start path
  (`useStartWorkoutWithConfirmation`), which asks first when another workout is in progress. `repeatSession` makes
  it: the logged weights become the new workout's placeholders.
- **Save as routine** adds the workout's structure (`routineFromSession`, which is `session.blueprint`: the
  exercises as they ended up that day) to the **active plan**, named after the workout, or "Push 2" and so on when
  the name is taken (`uniqueRoutineName`). A toast offers Undo.
- **The overflow menu** (native, `PageMenu`) offers Edit workout (`/history/edit`), Share workout when the feed is
  on, and Delete workout. Delete goes back to the list at once and shows a toast with Undo, which puts the session
  back. Both queue the session for the feed, which publishes a queued session that exists and unpublishes one that
  doesn't. Local reactions to it are kept, so Undo loses nothing.

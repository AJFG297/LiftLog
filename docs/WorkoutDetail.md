# Workout detail

The screen a history card opens: one past workout as a single scrolling list (PM-25, [redesign plan](./plans/redesign.md)
phase 3 step 14). It isn't focus mode, because looking back needs the whole session at a glance. The route is
`/workout-detail?sessionId=` on the root stack (`app/src/app/workout-detail/index.tsx`), opened by a tap on a history
card's summary (the summary is the button, so the card's own buttons stay reachable by screen readers); the screen itself is
`components/smart/workout-detail.tsx`, drawn from `components/presentation/workout-detail/`.

## What it shows

- **Header.** A routine swatch and the program day ("PPL · Day 1"), the workout's name, and the date with the time
  range from the first logged set to the last, saying a shared AM or PM once (`formatTimeRange`). The program day is the routine's position in the active program,
  matched by name, and is left out when the routine isn't in it. Routines have no colour of their own yet, so the
  swatch is the accent, as on the canvas.
- **Stats row.** Duration, volume in the preferred unit, working sets (warm-ups left out), and PRs. The figures come
  from `models/workout-summary.ts` and `sessionRecords`, the same as the workout summary, so the two screens agree.
- **One card per exercise.** The logged sets in the order the workout screen shows them, warm-ups first. Set labels
  are the `SetBadge` labels (`setBadgeText`): the working set's number, or W, D, M or F. Each set shows its weight,
  reps (with its RPE after them, "8 @8", when the set was rated) and estimated one-rep max (Epley, `calculateOneRepMax`), or "–" for a set that can't set a record (warm-up,
  drop, myo, or no load). A **PR** tag marks the first set that reached the workout's record for that movement.
  The line beside the name compares the best set with the last workout of the same routine ("+2.5 kg vs last").
  An exercise with nothing logged says "Not done"; a cardio exercise shows its one-line summary.

`sessionSetRows` in `models/workout-detail.ts` builds the table rows.

## What it does

- **Do again** starts a new workout with the same exercises, sets and rep targets, nothing logged, through the
  usual start path (`useStartWorkoutWithConfirmation`), which asks first when another workout is in progress.
  `SessionService.repeatSession` makes it: the workout's structure as Save as routine takes it, with each set's
  rep target and kind as they were that day, a target changed for that workout only included (`repeatBlueprint`),
  opened as starting that routine would, so weights carry over from the latest performance and earned progression
  applies (see [Progression.md](./Progression.md)). That day's weights are not reused: repeating a deliberately
  light day opens at the latest weights. History's Start this workout does the same.
- **Save as routine** adds the workout's structure (`routineFromSession`, built from `session.blueprint`: the
  exercises as they ended up that day, with the plan's rep targets, since a target changed during a workout is
  not a change to the routine) to the **active plan**, named after the workout, or "Push 2" and so on when
  the name is taken (`uniqueRoutineName`). A toast offers Undo. Editing a warm-up's weight during a workout leaves
  the session's plan alone, so a warm-up logged at a weight of its own is planned at that weight (a percentage
  warm-up stays a percentage). Do again and Save as routine then agree on every warm-up's load.
- **The overflow menu** (native, `PageMenu`) offers Edit workout, Share workout when the feed is
  on, and Delete workout. Delete goes back to the list at once and shows a toast with Undo, which puts the session
  back. Both queue the session for the feed, which publishes a queued session that exists and unpublishes one that
  doesn't. Its local reactions go with it, as from the history list, and Undo puts them back. A session that is
  gone (a stale link, or deleted from elsewhere) shows a short message instead of the detail.
- **Edit workout** opens `/workout-detail/edit`, the history's editor (`components/smart/past-workout-editor.tsx`) on
  the root stack above the detail, so back and Save return to the detail. It isn't `/history/edit`: pushing a route
  inside the tabs from a root screen pops that screen, so back would skip the detail and land on another tab.

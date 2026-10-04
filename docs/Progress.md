# Progress

The Progress tab (`app/src/app/(tabs)/stats/`) and the screens it opens: Records, All exercises and the
exercise page. They all read one model of the finished history, built in a single walk over it. This doc covers
that model first, then each screen.

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
      with bodyweight folded in as records fold it: the same scan as the record rules
      (`bestOneRepMaxSet`). Undefined for a movement that tracks no load, and when
      only drop or myo sets were logged.
    - `bestReps`: the most reps in one of those sets, 0 if none: the axis of a movement that tracks no load.
    - `workingSets`: logged sets that count towards volume (every kind but warm-ups), as Stats' sets per
      week counts them.
    - `oneRepMaxSet`: the set `oneRepMax` comes from, as lifted.
    - `sets`: every logged set that counts towards records, as lifted (`LiftedSet`: weight and reps). The
      exercise page reads its heaviest set and best weight by reps from them.
    - `volume`: load times reps over the sets that count towards volume, bodyweight folded in;
      `Weight.NIL` for a movement that tracks no load. `totalReps`: the reps over those sets.
- `records`: every record ever set (`SessionRecord`, see below), oldest first and in exercise order within a
  workout, each with the `workoutId` and `date` of the workout that set it.
- `workouts`: one `WorkoutPoint` (id, date, bodyweight) per started workout, cardio-only ones included, for
  Training and Body.
- `firstDate`: the first started workout's date, the first of `workouts`. A workout where nothing was logged
  doesn't start the history, so "since" lines and Training's averages don't reach back to it.

`progressSince(history, since)` gives one movement's points on or after `since`, their `values` on its axis
(estimated 1RMs, or best reps for a movement that tracks no load; points with none are left out), and its
`change` over them: first value against last. The axis comes from `primaryAxisFor`, as in Stats.
`change` is undefined with fewer than two values. Its `delta` is a `Weight` in the last point's unit and is not
rounded, so show it through `shownChange` (see [How amounts read](#how-amounts-read)). `trendValues(progress,
unit)` turns the values into the plain numbers a `Sparkline` draws.

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

`app/(tabs)/stats/index.tsx`. A header ("Since" the range's first day, then Progress), three text tabs
(Strength, Training, Body) and one range switch (4 weeks, 12 weeks, 1 year) under them. The range applies to
every tab and keeps its value when the tab changes; it resets to 12 weeks when the screen remounts. The tab is
the `progressTab` preference, so the screen reopens on the one last used.

The screen calls `useProgressHistory()` once. Every number comes from pure functions in `store/stats/`, one
file per part, and the components in `components/presentation/stats/progress/` only format and draw them. What
the Records and All exercises lists share with the tab sits one folder up, in `components/presentation/stats/`:
`list-parts.tsx` (`ListCard`, `useRowDivider`, `useToneColor`, `ListEmptyLine`, and the list pages' `ListPageTitle`
and `ListEmptyState`), `amount-format.ts` (`amountText`, `signedText`, `signedAmount`) and `amount-text.tsx`
(`AmountText`). A change's direction is one `ChangeTone` (`gain`, `fall`, `none`, from `toneOf` in
`progress-amounts.ts`) on every screen.

| File | Gives |
| --- | --- |
| `progress-tab.ts` | The tabs, the range table, and `progressPeriod`: the weeks a range covers. |
| `progress-strength.ts` | `mostTrainedLifts` (pinned lifts first), `togglePinned` and `recentRecords`. |
| `progress-training.ts` | `buildWeeklyTable`, then `trainingView` over it. |
| `progress-body.ts` | `weighInsOf` and `bodyView`. |
| `progress-amounts.ts` | How a weight reads: `shownWeight` and `shownChange` (below). |

### How amounts read

`store/stats/progress-amounts.ts` is the one place a weight on these screens is rounded, so the same record
reads the same on Strength and on Records:

- An estimated 1RM (`'estimate'`) shows in the user's unit to the nearest half: "104.5 kg".
- A weight that was on the bar (`'load'`) shows as lifted, to at most two places, in the unit it was lifted in.
  Converted to the other unit, it shows to the nearest half too: 62.5 kg reads "138 lbs", not "137.79".
- A gain or a change is always the difference of the two values as shown (`shownChange`), so a row adds up as
  it reads. When the two would show alike although they differ, a real but tiny gain, both show a place finer,
  to a tenth and then a hundredth, and the gain reads "+0.1" or "+0.03" rather than "+0".

The view models hand the components amounts already rounded; the components only format them
(`amountText`, `signedText`).

### Weeks and the range

Weeks start on the user's first day of the week. A range of N weeks is N bars, the last of them this week so
far: N - 1 complete weeks and this week (1 year is 52 bars). "Since" is the first day of the oldest bar, and the
lifts, their changes and Body start there too.

Averages read complete weeks only. This week is left out, so its partial count doesn't drag them down, and so
are the weeks before the history began, so someone three weeks in isn't averaged over eleven. The week of the
first started workout counts only if that workout was on the week's first day; otherwise averaging starts the
week after. A change compares against the N - 1 complete weeks before the range, and is left out when those
hold no history.

### Strength

- **Lifts**: the 4 movements done in the most workouts in the range (ties to the one done last, then by
  name), each with its latest estimated 1RM (best reps for a movement that tracks no load), the change over
  the range from `progressSince` as shown, the session count and a `Sparkline` of the range.
- **Pinned lifts** come first: the `pinnedLifts` preference (exercise ids, in the order pinned, stored as JSON;
  set from the exercise page's Pin to Progress). The most-trained lifts fill the rest up to 4. A pinned lift always
  shows, with nothing in the range (a dash and no sparkline) and past 4 too: pinning a fifth lift never drops one the
  user asked for, the most-trained ones make room instead. A pinned id with no history (never logged, or merged into
  another exercise) is skipped. A pinned row has a pin after its name, and the subtitle says the list starts with
  pinned lifts. `mostTrainedLifts(history, since, unit, pinned)` and `togglePinned` are in `progress-strength.ts`.
  Like every preference, pins are not in backups.
- **Recent records**: the newest 3 records, whatever the range: the first three rows of the Records list, built
  by the same `recordListRowOf`, with the gain over what each beat. A heaviest record shows its set; an
  estimated-1RM one shows the set the estimate comes from.
- Lift and record rows open the [exercise page](#the-exercise-page) (`useOpenExerciseProgress`). All exercises
  and See all open `/stats/exercises` and `/stats/records`.

### Training

`buildWeeklyTable` walks the history once into one `WeekTotals` per week (workouts, working sets, and
working sets per muscle) for the range, this week and the period before. Workouts and sets a week, the bars,
the longest run of weeks with 3 or more workouts (this week counts once it has 3) and sets per muscle all read
that table, so they agree.

Sets per muscle reads the exercise's `primaryMuscles` and `secondaryMuscles` (see
[Migrations.md](./Migrations.md); the descriptor keeps them apart from version 2). A working set counts 1
for a primary muscle and ½ for a secondary one. The catalog's back muscles (lats, middle and lower back,
traps) are one Back, counted once per set. A custom exercise's muscles are all primary, and one with none
counts towards sets a week but no muscle. Values show to the nearest half ("6½"); a light band marks 10 to 20
sets a week, and bars under 10 use the lighter accent.

### Body

From `Session.bodyweight` on finished workouts. A new workout starts with the last one's bodyweight, so a
workout whose bodyweight equals the weigh-in before isn't a new weigh-in. The change over the range is
against the bodyweight carried in from before it (drawn at the range's start, without a dot), or else the
first weigh-in in it, and is in `ink`: neither direction is good by default. Lowest, average and highest are
over the chart's points. Weigh-ins lists the last 5, whatever the range.

Someone who has never logged a bodyweight, or who hides bodyweight in settings, gets no Body tab, and a stored
Body falls back to Strength (`shownTab`).

### Before the first workout

With no finished workout there are no tabs: one card invites the first workout and opens Routines. A tab with
nothing in the range says so in its card. Until the history covers a full week in the range (`averagedWeeks`
is 0), Training's averages show "–" with a line saying they show after the first full week, and sets per
muscle says the same rather than that there are no sets.

## Records and All exercises

Both are pushed from the Progress tab (`stats/records`, `stats/exercises`) and draw their own title under the
native header's back button (`ListPageTitle`). Each calls `useProgressHistory()` once and hands it to a pure
function that returns what the screen draws; a row opens the [exercise page](#the-exercise-page)
(`useOpenExerciseProgress`). Records is `RecordsScreen` (`components/smart/records-screen.tsx`), routed twice: at
`stats/records` in the tab, and at `/records` on the root stack for the exercise page's All records, so Back from
there returns to the exercise rather than to the tab. They share the tab's list pieces (`list-parts.tsx`, `amount-format.ts`, `AmountText`)
and its rounding (`progress-amounts.ts`), so a value reads the same on every screen.

### Records

`recordsListOf(history, today, filter, unit)` (`store/stats/records-list.ts`) reads `history.records`, so the
list follows the [record ledger](#the-record-ledger)'s rules: at most one record per exercise per workout, and
none the first time an exercise is done.

- **Filter**: `RecordFilter` is `'all'` or a record kind (`heaviestWeight`, `estimatedOneRepMax`), shown as All ·
  Heaviest · Est. 1RM. The control is hidden while there are no records at all.
- **Count**: "12 records since July" counts what the filter lets through, since the month the history starts
  (`firstDate`, the first started workout, so a planned workout where nothing was logged doesn't count), with
  the year once that month is in an earlier year.
- **Months**: an ordered list of `{ month: YearMonth, showYear, rows }`, newest first. Within a month the newest
  workout comes first, and a workout's records keep exercise order (`newestWorkoutFirst`).
- **A row** (`RecordListRow`, from `recordListRowOf`): a union on `kind`. A heaviest record carries its `reps`,
  an estimate the set it comes from (`estimatedFrom`). It shows the date, the exercise (under the name it was
  last logged with), the kind and value ("Heaviest · 130 kg × 3", "Est. 1RM · 104.5 kg"), what it beat ("was
  127.5 kg", after the set for an estimate: "82.5 kg × 8 · was 102 kg") and the gain. Weights are in the user's
  unit, so a record lifted in pounds against a best in kilograms reads in one unit, and are rounded as
  [How amounts read](#how-amounts-read) says.
- **Empty**: "No records yet" with no records, or a line for the chosen kind pointing back to All
  (`ListEmptyState`).

Strength's recent records are the list's first three rows, from the same `recordListRowOf`, and both screens
draw them with one `RecordRow` (`components/presentation/stats/record-row.tsx`): so the same record reads the
same value and gain on both. On Strength the row `shows` the set after the kind and has no third line. Its gain
badge ("+2.5 kg") is set in bold Geist Mono, unit included, as the board draws it: the one exception to keeping
units in Geist ([Theming.md](./Theming.md#type)).

### All exercises

`exercisesListOf(history, catalog, today, filters, unit)` (`store/stats/exercises-list.ts`) lists every
movement in `history.exercises`: only what the user has logged.

- **Order**: most recently done first; exercises last done on the same day keep the order they were first
  done in.
- **Search**: the exercise picker's `fuzzyMatchScore` (`models/exercise-fuzzy-match.ts`) on the name, best
  match first as in the picker, then the most recently done. The field is foundation's `SearchField`.
- **Muscle chips**: All · Chest · Back · Legs · Shoulders · Arms, and Core only when something logged files
  under it, in foundation's `ChipRow` and labelled as the picker's chips are (`muscleGroupLabel` in
  `utils/exercise-meta.ts`). An exercise's chip is `muscleGroupOf` (`models/muscle-groups.ts`) its catalog
  descriptor (`selectExercises()[exerciseId]`), the picker's rule: its first muscle. One missing from the
  catalog shows under All only.
- **Count**: "12 exercises, most recent first" ("best match first" during a search) and "Change over 12 weeks"
  head the list. They stay when a search or chip matches nothing, and only go with nothing logged at all.
- **A row** (`ExerciseListRow`, drawn by `ExerciseRow`): the name, when it was last done (today, yesterday, a
  weekday within the week, else a date) and the session count over the whole history; a `Sparkline` of the
  last 12 weeks (`TREND_WEEKS`, which the heading and the spoken change interpolate) with no end dot; the
  latest estimated 1RM, or best reps for a movement that tracks no load; and the change over the 12 weeks from
  `progressSince`, through `shownChange`, so it is the difference of the values as shown. Its `tone` (a
  `ChangeTone`) sets the colours: a gain is `positive` with an `accentInk` line, a fall `warmInk` for both, no
  change (or nothing to compare) muted with a `faint` line. Fewer than two sessions in the window shows a
  dash. A "same" change is a word, so it stays in Geist while the numbers beside it are Geist Mono.
- **Empty**: no match for the search, nothing under the chip, or nothing logged yet.

`ExerciseRow` and Strength's lift rows show the same things but stay two components: the board draws the lift
rows larger (an 18pt value, a 64 × 28 sparkline in `accentInk` with an end dot, a chevron) and the exercise rows
smaller, with the sparkline coloured by the change. They share `AmountText`, `signedText`, `useToneColor` and
`useRowDivider`.

## The exercise page

One weighted exercise's progress, at `/exercise-progress?exerciseId=` (`app/src/app/exercise-progress.tsx`, the
screen in `components/smart/exercise-progress-screen.tsx`, drawn from `components/presentation/stats/exercise/`).
It is on the root stack, over the tabs, so it opens from any tab and Back returns to the screen that opened it.
Everything opens it through `useOpenExerciseProgress(exerciseId)`, by stable exercise id:

- the Progress tab's lift and record rows, All exercises and Records;
- a past workout's exercise names ([WorkoutDetail.md](./WorkoutDetail.md));
- View progress in an expanded routine editor card ([Routines.md](./Routines.md)), since a tap on the card's
  header opens and closes it;
- View progress in the live workout's exercise menu ([LiveWorkout.md](./LiveWorkout.md)), not a tap on the name, so
  a tap mid-set never leaves the workout.

Cardio exercises have no page: none of these offer it for one. The page calls `useProgressHistory()` once; the view
model is `store/stats/exercise-progress.ts`, and the screen only picks and formats.

- **Header.** Pin to Progress (Pinned to Progress once on) at the end of the row under the native back button,
  then the muscles (primary, then secondary, at most 3) and equipment from the catalog, then the name.
- **Measure** (`measuresOf`): Est. 1RM · Heaviest · Volume. A movement that tracks no load (resistance None) reads
  Most reps · Total reps instead, in reps. A bodyweight movement stays on the estimate with bodyweight folded in, as
  on Strength, and drops Heaviest if it never had weight added. One whose history never had any load at all (no
  bodyweight logged and nothing added) would chart flat at 0, so it reads in reps like a no-load movement
  (`axisOf`). Strength still lists it on the estimate (D5); only the page switches.
- **Chart card** (`exerciseChartOf`): the picked workout's value, its date ("Last time, Oct 1" for the latest) and
  the set behind it (the estimate's set, or the heaviest set on Heaviest); the change over the range, last value
  against first, through `shownChange` like everywhere else; a line chart with round grid lines
  (`geometry/exercise-chart-geometry.ts`, at most three gaps); the ranges 3M · 6M · 1Y · All; and, on Est. 1RM,
  how the estimate is made. Workouts with nothing on the measure (only drop sets, say) are left out of its chart.
  - **Record dots** (`hasRecordDots`): on Est. 1RM, every workout whose estimate beat all earlier ones; on Heaviest,
    every heavier weight than ever on an externally loaded exercise (the ledger's heaviest-weight rule). Both are
    judged against the whole history, so a dot doesn't move with the range, and the first workout never has one.
    The estimate dots mark every better estimate, even in a workout the ledger counts as a heaviest-weight record,
    since the chart is of the estimate. Volume and reps have none, and no Record key.
  - **Picking**: a tap, or a horizontal drag (react-native-gesture-handler; a vertical drag still scrolls), picks
    the nearest workout, with a selection tick. Screen readers adjust the chart a workout at a time. The pick is
    kept by workout id across a change of measure or range while that workout is still there, else it falls back
    to the latest.
  - **Range**: the page opens on the shortest range that holds two workouts (`defaultRangeOf`), else All, so a lift
    last done in the spring doesn't open on an empty chart. No workouts in the range says so in the card; a
    single workout ever is one point with no line and a line asking for a few more.
- **Next time** (`nextTimeOf` in `models/session-models/next-exercise.ts`): the top set the next workout will open
  on, and why, from the first routine of the active program to come up (`program.upcomingSessions`' order, else
  the plan's) that plans the exercise. It runs the same code session creation does and reads the reason through
  `todaysTarget`, so it agrees with the workout's Today line. Hidden when no routine in the active program has it.
  See [Progression.md](./Progression.md).
- **Best weight by reps** (`repBestsOf`): the heaviest weight lifted for at least 5, 6, 7 and 8 reps over the whole
  history, dated by the first workout that lifted it, as lifted. Only for an externally loaded exercise: a
  bodyweight movement's sets hold only the weight added, and a no-load one has none.
- **Last 5 times** (`recentSessionsOf`): the chart's latest five workouts, newest first: the date, the set behind
  the value, the sets and volume, and on the right the estimated 1RM (the heaviest weight on Heaviest, most reps
  for a no-load movement). On Volume the right shows the estimate, as the board does, since the volume is already in
  the row. A PR tag marks a workout where the ledger set a record for the exercise. Tapping a row picks it on the
  chart.
- **Records** (`exerciseRecordsOf`): the exercise's latest 4 records as a timeline, the newest with the accent dot,
  each built by `recordListRowOf` like the Records list. All records opens `/records`. Not shown for a no-load
  movement, which sets no records.
- **No history**: the header, the Next time card if a routine plans it, and "No sessions yet".

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
      with bodyweight folded in as records fold it: the same scan as the record rules
      (`bestOneRepMaxSet`). Undefined for a movement that tracks no load, and when
      only drop or myo sets were logged.
    - `bestReps`: the most reps in one of those sets, 0 if none: the axis of a movement that tracks no load.
    - `workingSets`: logged sets that count towards volume (every kind but warm-ups), as Stats' sets per
      week counts them.
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
| `progress-strength.ts` | `mostTrainedLifts` and `recentRecords`. |
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
  the range from `progressSince` as shown, the session count and a `Sparkline` of the range. There is no pinning yet.
- **Recent records**: the newest 3 records, whatever the range: the first three rows of the Records list, built
  by the same `recordListRowOf`, with the gain over what each beat. A heaviest record shows its set; an
  estimated-1RM one shows the set the estimate comes from.
- Lift and record rows open the expanded exercise view over all time (`useOpenExerciseStats`), since it
  otherwise covers only its own period and an older lift would open on "no data". All exercises and See all
  open `/stats/exercises` and `/stats/records`.

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
native header's back button. Each calls `useProgressHistory()` once and hands it to a pure function that
returns what the screen draws; a row opens the exercise's stats over all time (`useOpenExerciseStats`).

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
  workout comes first, and a workout's records keep exercise order.
- **A row**: the date, the exercise (under the name it was last logged with), the kind and value ("Heaviest ·
  130 kg × 3", "Est. 1RM · 104.5 kg"), what it beat ("was 127.5 kg") and the gain. Weights are in the
  user's unit, so a record lifted in pounds against a best in kilograms reads in one unit, and are rounded as
  [How amounts read](#how-amounts-read) says, through the same `shownChange` as Strength's recent records: the
  same record reads the same gain on both.
- **Empty**: "No records yet" with no records, or a line for the chosen kind pointing back to All.

An estimate's row also shows the set it comes from ("82.5 kg × 8 · was 102 kg"). The row is
`RecordRow` (`components/presentation/stats/record-row.tsx`), which Strength's recent records draw too: there it
`shows` the set after the kind and has no third line. Its gain badge ("+2.5 kg") is set in bold Geist Mono,
unit included, as the board draws it: the one exception to keeping units in Geist ([Theming.md](./Theming.md#type)).

### All exercises

`exercisesListOf(history, catalog, today, filters, unit)` (`store/stats/exercises-list.ts`) lists every
movement in `history.exercises`: only what the user has logged.

- **Order**: most recently done first; exercises last done on the same day keep the order they were first
  done in.
- **Search**: the exercise picker's `fuzzyMatchScore` on the name, best match first as in the picker, then the
  most recently done.
- **Muscle chips**: All · Chest · Back · Legs · Shoulders · Arms, and Core only when something logged files
  under it, labelled as the picker's chips are (`muscleGroupLabel` in `utils/exercise-meta.ts`). An exercise's chip is `muscleGroupOf` its catalog descriptor (`selectExercises()[exerciseId]`),
  the picker's rule: its first muscle. One missing from the catalog shows under All only.
- **A row**: the name, when it was last done (today, yesterday, a weekday within the week, else a date) and
  the session count over the whole history; a `Sparkline` of the last 12 weeks (`TREND_WEEKS`, which the "Change over 12 weeks" heading and the spoken
  change interpolate) with no end
  dot; the latest estimated 1RM, or best reps for a movement that tracks no load; and the change over the
  12 weeks from `progressSince`, as shown (`shownChange`: the estimates to the nearest half, the change their
  difference). The change sets the colours: up is
  `positive` with an `accentInk` line, down `warmInk` for both, the same (or nothing to compare) muted with a
  `faint` line. Fewer than two sessions in the window shows a dash.
- **Count**: "12 exercises, most recent first" ("best match first" during a search) and "Change over 12 weeks"
  head the list. They stay when a search or chip matches nothing, and only go with nothing logged at all.
- **Empty**: no match for the search, nothing under the chip, or nothing logged yet. A "same" change is a word,
  so it stays in Geist while the numbers beside it are Geist Mono.

# Storage

LiftLog persists on-device data in two places. Which one you use depends on what kind of data it is:

|                          | Preferences                                                      | User data                                                                               |
| ------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Written through          | `PreferenceService`                                              | Drizzle ORM (`db`)                                                                      |
| Backed by                | One file per key in the app document directory (`KeyValueStore`) | SQLite (`db.db`, via expo-sqlite)                                                       |
| Holds                    | Settings and small scalars the user toggles                      | Workouts, programs, exercises, feed state                                               |
| Shape changes handled by | Hand-written defaults in the getter                              | Drizzle SQL migrations + JSON payload migrations (see [Migrations.md](./Migrations.md)) |
| Injected as              | `extra.preferenceService`                                        | `extra.db`; workouts only through `extra.workoutRepository`                             |

Both are built in `app/src/services/index.ts` (`createServices`) and are reachable from any Redux effect
via the `extra` bag:

```ts
addEffect(
  setUseImperialUnits,
  async (action, { stateAfterReduce, extra: { preferenceService } }) => {
    if (stateAfterReduce.settings.isHydrated) {
      await preferenceService.setUseImperialUnits(action.payload);
    }
  },
);
```

Redux is the source of truth at runtime. Storage is written **from effects**, never from components or
reducers: a component dispatches an action, the reducer updates state synchronously, and an effect
mirrors the change to disk.

## Preferences - `PreferenceService`

`app/src/services/preference-service.ts` wraps `KeyValueStore`
(`app/src/services/key-value-store.ts`), which stores each key as its own file under `Paths.document`.
Writes go to a temp file and are then moved over the target, so a crash mid-write can't leave a
half-written (or worse, half-overwritten) value.

Everything in the store is a string (or `Uint8Array`). Preferences are described declaratively in a
**registry** (`app/src/store/settings/registry.ts`); each entry pairs a `default` with a **codec**
(`app/src/store/settings/codecs.ts`) that owns the on-disk encoding:

```ts
restTimersEnabled: pref({ default: true, codec: boolCodec }), // 'True' / 'False', default true when unset
```

`PreferenceService` is a thin facade over the registry: `getPreference(key)` / `setPreference(key, value)`
read and write via the codec, and a few bespoke methods remain for keys with special storage
(`getPreferredLanguage`, the remote-backup cluster).

### Adding a preference

The `add-setting-or-preference` skill walks this end to end. In short: add one entry to
`preferenceRegistry` (`{ default, codec }`), then re-export the generated `set<Name>` action from
`app/src/store/settings/index.ts` and add the settings UI. The state field, default, action, hydration,
and `isHydrated`-guarded write-back are all derived from the registry entry - no `PreferenceService`
method or per-key effect. Keys with special needs use the `persist: false` / `hydrate: 'manual'` /
`sync` escape hatches on the descriptor.

### Reading synchronously

`getItemSync` / `getPreferredLanguage` exist for the handful of values needed before the store exists
(language, for Tolgee setup). Prefer the async path everywhere else.

### Direct `keyValueStore` use

A few non-settings blobs skip `PreferenceService` and use `extra.keyValueStore` directly - the hidden
built-in exercise id list, the "built-in programs seeded" marker, and the running rest timer
(`ActiveRestTimer`, versioned JSON written by the workout worker effects and read back after workouts
hydrate, so a relaunch keeps the rest), and the live workout's page (`LiveWorkoutFocus`, the same way). That's the escape hatch for a value
that isn't a user-facing setting but is too small or too structurally awkward for a table. New
_settings_ should go through `PreferenceService`.

The in-progress workout is not here: it is a row in the `workout` table like any other, flagged `active`.

## User data - SQLite via Drizzle

Schema lives in `app/src/db/schema.ts`; generated SQL migrations in `app/src/drizzle/`. The database is
opened in `components/smart/services-provider.tsx` (`openDatabaseAsync('db.db')` → `drizzle(expoDb)`)
and passed into `createStore` / `createServices`, so effects get it as `extra.db` (and the raw handle as
`extra.expoDb`, needed for backup/export).

Workouts are relational (see [Workouts](#workouts) below). The other tables are almost all the same
shape - a text `id` primary key plus a `payload` JSON column typed with the model's `AnyVersion…JSON`
union:

```ts
export const exercisesSchema = sqliteTable("exercise", {
  id: text().primaryKey(),
  payload: text("payload", { mode: "json" }).$type<AnyVersionExerciseDescriptorJSON>().notNull(),
});
```

This means there are **two** independent migration mechanisms and both matter:

- **SQL migrations** change tables/columns/indexes. Edit `db/schema.ts`, then generate with
  `npx drizzle-kit generate` (config: `app/drizzle.config.ts`) and commit the new file in
  `src/drizzle/`. They are applied at startup by `DatabaseMigrationService.migrate()`.
- **Payload migrations** change the shape of the JSON inside a row. Those are the versioned model
  chains in `app/src/models/storage/versions/` - see [Migrations.md](./Migrations.md) and the
  `add-storage-migration` skill. Rows are migrated on read (`programBlueprintMigrations.migrate(row.payload)`),
  not in bulk.

### Reading and writing

Read on hydration, dispatch into the slice:

```ts
const savedExercises = (await db.select().from(exercisesSchema)).reduce(
  toRecord(
    (x) => x.id,
    (x) => fromExerciseDescriptorJSON(x.payload),
  ),
  {},
);
dispatch(setExercises(savedExercises));
```

Write with the `upsert` helper in `app/src/db/helpers.ts`, which does an
`insert … onConflictDoUpdate` on the id - the right call for our id+payload tables, and it takes a
transaction (`tx`) as well as `db`:

```ts
await upsert(db, feedSentReactionsSchema, [
  { id: action.payload.id, payload: action.payload.toJSON() },
]);
```

When several statements must move together, use `writeAtomically(db, (tx) => [...statements])` from
`db/helpers.ts`. Don't write `db.transaction(async (tx) => …)`: on a device the expo-sqlite driver is
synchronous and commits as soon as the callback returns, so every awaited statement runs after the commit,
outside the transaction. Tests can't catch that, because Vitest's libsql driver is async and awaits the
callback.

### Workouts

A workout is stored across five tables (`db/schema.ts`), not as one payload:

| Table              | One row per                           | Key                                         |
| ------------------ | ------------------------------------- | ------------------------------------------- |
| `workout`          | workout (history and the one running) | `id`, the session id                        |
| `workout_exercise` | recorded exercise, in order           | `(workout_id, position)`                    |
| `weighted_set`     | slot of a weighted exercise, in order | `(workout_id, exercise_position, position)` |
| `warmup_set`       | warm-up slot of a weighted exercise   | `(workout_id, exercise_position, position)` |
| `cardio_set`       | set of a cardio exercise, in order    | `(workout_id, exercise_position, position)` |

- **Exact values** are stored as `toJSON()` writes them: decimal weights as text with their unit, times as
  ISO text with their offset. An unlogged slot has `reps` and `completed_at` null but keeps its weight,
  target and RPE.
- **Warm-ups** get their own table rather than a flag on `weighted_set`, as the model keeps them in their
  own list: every aggregate over `weighted_set` leaves them out with no filter. They have no RPE and no
  query columns, since nothing sums or ranks them. `workout_exercise.latest_time_ms` is the last working
  set too, so an exercise with only warm-ups logged never ranks as a performance; `workout.reference_time_ms`
  is the last set of any kind, as it orders workouts by when they happened.
- **Set kinds**: `weighted_set.kind` is what the slot is for (`working`, `failure`, `drop` or `myo`, see
  `SET_KIND_RULES`). A warm-up's kind is its table. Rows written before the column existed read as `working`.
- **Reflection**: `workout.feel` and `workout.reflection_note` hold how the workout felt (rough, ok, good,
  great) and a note for next time, both picked on the summary (`SessionReflection`). They are the one part of
  a workout that `Session.toJSON()` leaves out, so the feed, share links and the workout worker never carry
  them, and a phone on an older build keeps reading every workout it is sent. An empty reflection is stored
  as nulls.
- **The exercise blueprint** stays a JSON column on `workout_exercise`, and `workout.blueprint_version`
  records the `SessionBlueprintJSON` version it was written at. It is migrated on read by
  `sessionBlueprintMigrations`. A cardio set's own blueprint copy is JSON too; no chain step has ever
  changed it, so it is read as written.
- **Exercise identity**: every exercise blueprint carries an `exerciseId`, the id of an entry in the
  exercise list: a built-in's English catalog name, or a user exercise's uuid. `movement_key` is
  `exerciseId|kind` and `progression_key` is `exerciseId_kind` (plus the target type for cardio; set count
  and rep scheme dropped out with `REKEY_PROGRESSION_BY_EXERCISE`), so renaming an exercise changes
  only its descriptor and every workout stays attached. Names arriving from outside (plan files, the AI
  planner, CSV import, backups, a friend's share) are turned into ids by `ExerciseResolver`
  (`models/exercise-resolver.ts`): the user's own exercise with that name, then a built-in by any of its
  names, then a new stub. A stub's id is derived from the normalised name (`stubExerciseId`), so a
  blueprint that was never linked already keys the way it will once linked. Restoring an own-device backup
  keeps its linked ids even when an exercise descriptor was deleted; names-only legacy rows still resolve
  by name. Workouts and plans stored
  before ids were linked once by the `LINK_EXERCISE_IDS` data migration
  (`services/data-migrations/link-exercise-ids.ts`), which also rewrote every row's key columns.
- **The name fold** (`normalizeExerciseName`, `models/blueprint-models/exercise-name.ts`) lowercases, trims
  and collapses spaces, folds the fly spellings (`Flye`, `Flyes`, `Flies`, `Flys`) to `fly`, and makes the
  last word singular: an irregulars table first (`abs` and `series` stay, `calves` is `calf`), then
  `ies` to `y`, `es` after `ss`, `x`, `zz`, `ch` or `sh`, and a plain `s` unless after `s`, `u` or `i`.
  So `Lunges` meets `Lunge` and `Bench Presses` meets `Bench Press`, while `Ab` and `Abs` stay apart.
  Before PM-5 it stripped any trailing `es` or `s` (`Lunges` to `lung`, `Bench Press` to `bench pres`);
  that fold is kept, frozen, as `legacyNormalizeExerciseName` for the merge below.
- **Merging plurals.** Linking under the old fold gave `Lunge` and `Lunges` an exercise each, with two
  histories. The `MERGE_PLURAL_EXERCISE_NAMES` data migration, run after the rekey, joins them
  (`services/data-migrations/merge-exercise-names.ts`). `planExerciseMerges` (`models/exercise-merge.ts`) is
  the pure plan: the user's exercises and stubs grouped by the new fold, from the exercise table and one
  count of workouts per id (`WorkoutRepository.exerciseUsage`). A group's survivor is the built-in of that
  name (unless the user deleted it, or every member already matched it under the old fold), else the user
  exercise in the most workouts then the one first logged earliest, else the stub at its new id. It keeps
  its name and fills its empty equipment, muscles and instructions from the others. A stub alone in its
  group still moves to the id its name now derives, so `stubExerciseId` of a stub's name is its id again,
  which unlinked feed items and `missingStubs` rely on. The applier writes the survivors, rewrites only the
  workouts logging a merged id (`workoutIdsLogging`, by `movement_key`) through `putMany`, 200 at a time, so
  their key columns and `lineage` are recomputed, then repoints saved plans, deletes the merged
  descriptors and records itself in one transaction. A run that stops part way plans the same merges
  again and finishes them; a user with nothing to merge has none of their data written. No per-exercise
  setting is keyed by a user exercise or stub id (the hidden list and edits are keyed by built-in ids,
  which never merge away), so there is nothing else to repoint. A restored backup is merged before it is
  read, so an older backup can't bring the split back. `npm run merge-exercises:dry-run` prints the plan for any
  backup (`LIFTLOG_MERGE_DRY_RUN=<file>`) or the synthetic history (`=synthetic`).
- **Query columns** are computed on write, for SQL to order and aggregate. They are never read back:
  - `workout`: `reference_time_ms` (`getSessionReferenceTime`) and `volume_kg` (`sessionVolume`)
  - `workout_exercise`: `movement_key`, `progression_key`, `lineage` (`lineageKeys`: the progression key,
    numbered `#n` for a repeat within the workout) and `latest_time_ms`
  - sets: `completed_at_ms`, `weight_kg` and `effective_weight_kg` (bodyweight folded in)

  Times are epoch milliseconds, so rows order correctly across offsets. `reference_time_ms` for a workout
  with no recorded set is the start of its day in the zone of the device that wrote it.

`services/workout-rows.ts` maps a `Session` to rows and back. The query columns come from the same domain
methods the JS aggregates use, so SQL can't drift from what the app shows. `Session.toJSON()` remains the
wire format for the feed, share links and the workout worker; the rows are a separate storage shape.

`services/workout-repository.ts` (`extra.workoutRepository`) owns every read and write of these tables;
no effect writes workout SQL itself. Each write is one `writeAtomically` transaction that touches only the
workouts it is given: the `workout` row is upserted, and its child rows are deleted and reinserted.
Foreign keys aren't switched on in the app, so the repository deletes child rows itself instead of relying
on the cascades.

- `put` / `putMany` write content. A new row starts inactive, and an existing row keeps its flag.
  `putMany` is the bulk path for backup restore and CSV import.
- `setActive` is the only writer of `active`. It clears the flag, then writes the given workout's content
  with the flag set.
- `delete` removes a workout and its rows.

The store never holds the history: startup reads the workout in progress and the carry-over cache, and
every screen reads what it shows from these tables when it is shown (see
[Sessions, and the one in progress](#sessions-and-the-one-in-progress)). These reads take any workout, the
one in progress included:

- `active()` - the workout in progress, if any: what startup loads.
- `get(id)` - one workout by id: the workout detail, the slots below (the history editor, a summary opened
  by link), and the feed
  publishing a finished workout.
- `existingIds(ids)` - which of the ids are stored: the CSV import's dedupe, and whether a cheer arriving in
  the inbox is for a workout of yours.
- `inExportOrder(batchSize)` - every workout, latest first by `reference_time_ms` (ties in the order they
  were first stored), `batchSize` at a time: the plaintext export, which serialises batch by batch.
- `latestPerLineage({ progressionKeys?, excludeWorkoutId? })` - the latest performance of every lineage:
  the carry-over cache below. With `excludeWorkoutId` it is what that workout's exercises carried on from
  (Today's target). Unfiltered, it walks the `lineage` index from one lineage to the next and seeks each
  one's latest time, so it reads no whole table: startup's cost doesn't grow with the history.
- `loadAll()` - every workout, for the jobs that must touch each one once (a data migration, reading a
  backup to restore it). Never for a screen.

Every read below covers _finished_ workouts only: the one in progress (`active = 1`) is left out.

- `finishedBetween(from, to)` - the workouts dated in the range, inclusive, latest first by
  `reference_time_ms`. The History month list, a selected day, Home's 7/30-day ranges and the Stats date
  range all come from it, and `calculateStats` runs over its result unchanged.
- `latestNamed(name, limit, { before?, includeUnstarted? })` - the last few started workouts of one name,
  latest first: Home's Up next detail (time estimate, last done). With `before`, only those done before
  that workout (to the second, as the old selectors compared): the previous comparable workout for the
  summary and the workout detail, which pass `includeUnstarted` so a workout with nothing logged still
  counts, as it always has; and the last five for the usual duration.
- `latestPlanned()` - the most recent workout that was not freeform: where the plan is up to
  (`SessionService.getUpcomingSessions`, when no workout is in progress).
- `previousPerformances(movements, { excludeWorkoutId?, limit? })` - each movement's earlier performances,
  newest first: exercises with a working set logged, in finished workouts other than the one being viewed.
  "Last time" on the workout screen, the past-workout editor and a shared workout (through
  `PreviousPerformancesProvider`, limit 10), and the exercise history sheet, 20 at a time: it asks for 20
  more each time it scrolls to the end of a full page.
- `bestsBefore(session)` - for each of the workout's movements, the best estimated 1RM and the heaviest
  set over the finished workouts before it, as `RecordLedger` holds them; `sessionRecords(session, bests)`
  then names the records the workout set. Sets are scored as in `personalRecords()`, so the two agree
  except on an exact e1RM tie that floats can't tell apart.
- `routineHistory(names)` - how far a program's routines have got, counting a workout as done when it has
  any set logged (a warm-up included) and isn't freeform: the last day each was done and how many were
  done, as SQL aggregates, and how many routines were done this round (`models/routine-rounds.ts`). The
  round walks the routine name of every done workout, oldest first: where a round ends depends on all of
  them (A B A B read from its second workout splits differently), so no bounded tail gives the same answer.
  The Routines screen's active program card and rows.
- `startedWorkouts()` - how many workouts were started and the date of the first, over the same workouts:
  the You profile's "N workouts since".
- `earliestDate()` - `MIN(date)`: where all-time stats start, so deleting the first workout moves it.
- `dailyActivity()` - one row per day with a started workout: how many and `SUM(volume_kg)`. The
  calendar's counts and levels, the week strips, the streak and "last workout" all derive from it.
- `volumeScale()` - the 10th/90th percentile of `volume_kg` over started workouts (`volumeScaleOf`).
- `personalRecords()` - records per workout, as `findPersonalRecords` walks them: one query scores each
  set as `effective_weight_kg * (30 + reps)` (Epley without the division), keeps the best per exercise
  and then per movement and workout with `GROUP BY ... MAX()` (SQLite takes the other columns from the
  winning row, so nothing is sorted), and runs `MAX() OVER (PARTITION BY movement_key ORDER BY
  reference_time_ms ROWS ... 1 PRECEDING)`; only the rows that beat the running max come back, with the
  set that did, and the exact 1RM is rebuilt in JS (`effectiveLoad`, `oneRepMaxOf`) so it reads in the
  unit it was lifted in. A `personal_record` table was not needed: about 130 ms under Node over 5,000
  workouts (75k sets), off the render path and only re-run after a write.

A workout is "started" in SQL when it has a `weighted_set` with `reps` or a `cardio_set` with
`completed_at`, which is `Session.isStarted`; warm-ups are in their own table, so they don't count, as in
the model.

Writes, `latestPerLineage`, `latestPlanned`, `get` and `existingIds` run in the order they were issued, on
one queue inside the repository, so these reads see every write before them: the read that corrects the
carry-over cache after a write, the plan position that finishing a workout asks for as soon as it has
dispatched the write, and the editor or the feed reading a workout just written.

`subscribe(listener)` is the one write notification: every `put`, `putMany`, `delete` and `setActive`
calls the listeners after its transaction has committed, so a listener that re-queries sees the rows. It
carries a `WorkoutWrite`: the ids touched, and whether the active flag changed (`setActive`). Screens
ignore it and re-run their query, which is cheap; the stats effect uses it to skip the workout in progress.

#### Reading from a screen: `useWorkoutQuery`

`hooks/useWorkoutQuery.ts` is how a component reads the repository:

```ts
const sessionsInMonth = useWorkoutQuery(
  (repository) => repository.finishedBetween(yearMonth.atDay(1), yearMonth.atEndOfMonth()),
  [yearMonth.toString()],
);
```

It runs the query on mount and whenever its deps change (returning `undefined` meanwhile, so the empty
state can't flash under a new month), and runs it again after any write the repository reports, keeping
the old value on screen until the new one arrives. While the screen is not focused, writes are only
counted: it re-queries once on return, and not at all if nothing was written. That is what lets Home and
History sit under the workout screen while sets are logged. Deps are compared like `useEffect`'s, so pass
primitives, not js-joda values. An `ignoreWrite` option names the writes that can't change the answer, so
a query that leaves the workout in progress out doesn't re-run on every set logged in it. `keepPrevious`
keeps the old answer on screen while a query for new deps runs, for deps that only extend it, like the
exercise history sheet's page count.

A screen that needs a "loading" apart from "not found" wraps the answer: the workout detail queries
`{ session: await repository.get(id) }`, so `undefined` is loading and `{ session: undefined }` is a
workout deleted from under it.

On top of it, `hooks/useOwnActivity.ts` has `useOwnActivity()` (`dailyActivity` + `volumeScale` as an
`OwnActivity`, which the calendar, week-strip and following-row selectors in `store/activity` take as a
parameter), `useStreakStats(own, today)` and `usePersonalRecords()`. Call each once per screen and hand
the result down: a list item that queried for itself would run the query once per row.

The workout screens do that through two more:

- `components/smart/previous-performances.tsx`: `PreviousPerformancesProvider` loads, once per screen,
  the previous performances of a session's movements and the latest of its lineages before it
  (`previousPerformances` + `latestPerLineage`, the session itself left out and its own writes ignored);
  `usePreviousPerformances()` reads them from any card, row or sheet under it. `useTodaysTarget` and
  `RecordedExerciseView` need one above them; the live workout, its All exercises sheet and
  `SessionComponent` (past-workout editor, feed and shared items) mount it.
- `hooks/useWorkoutComparison.ts`: the previous comparable workout, the usual duration sample and the
  records a workout set, for the summary and the workout detail.

Stats are the exception that still caches in Redux: `fetchOverallStats` reads `earliestDate()` and
`finishedBetween()` and keeps the result in `stats.overallView`. The write actions mark it stale at once,
and `subscribe` marks it stale again after the commit (`stats/effects.ts`): a fetch that runs between the
action and the commit (a big import, an edit while Stats is mounted) would otherwise read the old rows
and clear the flag. Both skip writes that touch only the workout in progress; `setActive` is never skipped,
since finishing is what makes a workout count. All-time stats rebuild every `Session` in the range (about
0.8 s under Node for 5,000 workouts), which hydration used to pay once, and the Progress tab
(`useProgressHistory`, see [Progress.md](./Progress.md)) does the same while it is shown; pushing the
per-movement aggregates into SQL is the follow-up that removes both.

Workout ids are kept end to end. They are the Health Connect / HealthKit record ids and the key the CSV
import dedupes on.

A backup from before this layout (it still has the `session` table) is rejected on restore with a
snackbar, rather than migrated: `0009` drops `session`, so it would restore everything but its workouts.
Old formats are unsupported (ADR-0001).

### Testing

Effects that touch the DB use a real in-memory SQLite rather than a mock - `openDatabaseAsync(':memory:')`,
`drizzle(...)`, then `DatabaseMigrationService.migrate()` to build the schema. See
`app/src/store/program/effects.spec.ts` for the pattern and `utils/__test__/add-effect-testbed` for
wiring effects to a test store. The testbed doesn't run effects for actions dispatched from inside an
effect; when a test depends on one effect triggering another (an ordering bug, say), use
`utils/__test__/effect-store`, which runs them through the real listener middleware.

The workout storage is pinned by:

- `services/workout-rows.spec.ts`: a fast-check property that any generated session maps to rows and back
  unchanged, plus the query columns and blueprint migration on read.
- `services/workout-repository.spec.ts`: the same round trip through SQLite; a per-set edit rewrites only
  that workout's rows, in one transaction; and the `active` flag rules.
- `drizzle/migrations.spec.ts`: the journal, `migrations.js` and the migrations folder agree. Vitest's
  migrator reads the folder, so without this a migration missing from `migrations.js` would pass every
  test and never run on a device. `drizzle/exercise-lineage.spec.ts` holds migration 0013's backfill of
  `lineage` to `lineageKeys`.
- `services/data-migrations/merge-exercise-names.spec.ts`: the plural merge through the store and the
  repository (one exercise, history, stats row, records and carry-over), a second run changing nothing, a
  user with no duplicates written nothing, and a run killed part way converging on the same end state.
- `store/settings/import-backup-effects.spec.ts`: restores `utils/__test__/backup.liftlogbackup.sqlite.gz`,
  a backup made by this app's own export, round-trips export then restore, and rejects a pre-relational
  backup.

The reads are pinned by `services/workout-repository.spec.ts` too: each query against hand-built
workouts, and `personalRecords()` against `findPersonalRecords` and `latestPerLineage()` against a walk over
every workout, over any generated history (fast-check). `hooks/useWorkoutQuery.spec.tsx` covers the
refresh and focus rules, and `store/stored-sessions/history-from-sql.spec.ts` drives the store as the
history editor does - open a past workout by id, edit it, delete it - and reads the month list, calendar,
records and stats back from the tables; its carry-over cases start the next workout through
`SessionService` after each, and a property check dispatches random writes back to back and compares the
cache with `latestPerLineage()` once they settle.

`store/stored-sessions/startup-reads.spec.ts` holds startup to the active workout and the carry-over
cache: over 300 and 3,000 workouts it records every statement the startup effect issues, and expects the
same statements, under a thousand rows read, and no query plan that scans a workout table.

History-derived behaviour is pinned by snapshots:

- `store/stored-sessions/history-snapshots.spec.ts` runs every history aggregate (latest exercise per
  progression key, "last time", previous comparable session, month and range lists, streak, activity
  calendar, personal records, stats, export order) over a 420-session fixture
  (`utils/__test__/history-420.sessions.json.gz`), written through `WorkoutRepository.putMany` and
  started by the real startup effect. Every case is fed by the repository's queries (the carry-over cache
  by the startup effect, which loads it from one; the export order by `inExportOrder`). A change to that
  snapshot is a change in what users see, so it has to be deliberate and called out in the PR.
- `store/stored-sessions/startup-baseline.spec.ts` measures cold start (migrate, hydrate the workout in
  progress and the carry-over cache, first aggregates) and retained heap over a synthetic history
  (`utils/__test__/synthetic-history.ts`, 5,000 sessions by default). PM-14 took it from about 1,040 ms
  and 88 MB retained to about 170 ms and 0.6 MB, with hydration about 9 ms at 500 workouts and at 5,000. It is skipped in the normal suite; run `npm run bench:startup` from `app/`
  (`LIFTLOG_BENCH_SESSIONS` / `LIFTLOG_BENCH_RUNS` override the size and repeat count). The numbers are
  only comparable with other runs on the same machine.

## Which one do I use?

Use **preferences** for a single scalar the user sets and the app reads - a toggle, a colour, a token, a
timestamp. Use **SQLite** for anything the user creates in quantity, anything queried or deleted by id,
and anything that needs to survive versioned shape changes.

Startup order is `initializeSettingsStateSlice` → (once settings are hydrated)
`initializeStoredSessionsStateSlice`. Preferences are therefore available to DB hydration, but not the
other way round; `stored-sessions/effects.ts` asserts this explicitly. That hydration reads two things of
the history, `active()` and `latestPerLineage()`; the rest of startup is the exercise list and the
built-in catalog.

## Sessions, and the one in progress

The history lives in the workout tables, not in Redux. `storedSessions.sessions` holds the _open_
workouts only, keyed by id, and never more than three:

- **The workout in progress**, `activeSessionId`. Startup loads it with `WorkoutRepository.active()`
  (`setActiveSession`); starting a workout puts it and points `activeSessionId` at it.
- **The editing slot**, `editingSessionId`: the past workout open in the history editor
  (`PastWorkoutEditor`, on `/history/edit` and `/workout-detail/edit`), which dispatches
  `openSessionForEditing(id)` when it mounts; the effect reads that workout with `get(id)` into the slot
  (`openSession`), unless it is open already. Only opening another workout for editing, or deleting this
  one, empties it, so finishing or starting a workout while the editor is open can't close it under the
  editor.
- **The recent slot**, `recentSessionId`: the workout last put that wasn't open (a workout being started,
  the History "add a workout on this day", Undo after a delete) and the workout that stops being in
  progress, which its summary keeps reading. The next one replaces it. A summary opened by link or after a
  restart dispatches `openSessionForSummary(id)` to read its workout into this slot.

A workout asked for that isn't in the tables sets `notFoundSessionId`, so the summary can leave rather
than wait.

Everything else reads the tables when it is shown (see [Workouts](#workouts)): the History list and
calendar, Home, Stats, Progress, the workout detail, the Routines screen's counts, the You profile, the
exercise history sheet, the export, the CSV import's dedupe and the feed. Screens address an open
workout by id (`updateStoredSession({ sessionId, update })`, mirroring `updateProgram`), so two screens
editing different workouts cannot collide. Use `selectSession(state, id)` for an open workout by id and
`selectActiveSession` for the live one.

- `putStoredSession` / `updateStoredSession` mean "this workout changed" and only write its content. An
  update to a workout that isn't open does nothing (development builds log a warning), so a screen opens
  what it edits first. An update that
  changes only what isn't stored (the rest timer, a running cardio timer) writes nothing.
  `upsertStoredSessions` (restore, import) writes without opening anything. `sessionFinished` means "the
  user is done with it" and is what queues the feed publish, exports to the health aggregator and clears
  the active pointer. Keep completion work on the latter, or it fires once per set. Stats are the
  exception that listens to both: any write to a _finished_ workout (edit, import, delete) marks them
  dirty, while sets recorded in the workout in progress don't, and `sessionFinished` covers that workout
  once it ends.
- `useAppSelectorWhenFocused` (`store/index.ts`) does not run its selector at all while the screen is
  offscreen. The workout-in-progress bar uses it, so the tabs under the workout don't re-render on every
  set; `useWorkoutQuery` applies the same rule to repository reads.
- **The carry-over cache** (`latestExercises`, the latest performance per lineage, which
  `SessionService` and the routine editor read) is loaded at startup by one query, `latestPerLineage()`,
  and kept current in two steps. The reducer moves it forward synchronously: a set logged in the workout
  in progress, or an edit at the same time or later, swaps the entry in without reading anything, so
  finishing a workout can build the next one at once. An entry the write may have moved _back_ - the
  workout that held it was deleted, or its exercise there was cleared, removed or moved earlier - is left
  in place, and after the write has landed the effect re-reads just those lineages
  (`staleLineages` + `refreshStaleLineages` in `stored-sessions/effects.ts`) and re-fetches the upcoming
  workouts. A lineage two workouts logged at the same instant is re-read too, so the tables' tie-break
  (then by reference time, workout id and position) decides rather than the order the writes came in.
  `latestExerciseWorkoutIds` records which workout each entry came from, which is how a write knows what
  it can have changed. A put or an update is always to an open workout, so `staleLineages` reads its new
  content from the store; a deleted one has none. A restore or import re-reads the whole cache.

The `active` column has a single writer, `WorkoutRepository.setActive` (called by the `setActiveSessionId`
effect), with a unique partial index (`single_active_workout`) enforcing at most one - the same shape the
`program` table uses for the active plan.

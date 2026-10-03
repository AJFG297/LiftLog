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
- **Query columns** are computed on write, for SQL to order and aggregate. They are never read back:
  - `workout`: `reference_time_ms` (`getSessionReferenceTime`) and `volume_kg` (`sessionVolume`)
  - `workout_exercise`: `movement_key`, `progression_key` and `latest_time_ms`
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
- `loadAll` reads everything back for hydration.

The history screens read from the same tables instead of the whole history in Redux (phase 2 of the
[relational storage plan](./plans/relational-storage.md)). Every read below covers _finished_ workouts
only: the one in progress (`active = 1`) is left out, as `selectSessions` leaves it out.

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
  `PreviousPerformancesProvider`, limit 10), and the exercise history sheet (no limit).
- `bestsBefore(session)` - for each of the workout's movements, the best estimated 1RM and the heaviest
  set over the finished workouts before it, as `RecordLedger` holds them; `sessionRecords(session, bests)`
  then names the records the workout set. Sets are scored as in `personalRecords()`, so the two agree
  except on an exact e1RM tie that floats can't tell apart.
- `latestPerLineage({ progressionKeys?, excludeWorkoutId? })` - the latest performance of every lineage
  (see `lineageKeys`: a repeat of an exercise within one workout is numbered by position in SQL too),
  over _every_ workout, the one in progress included: the carry-over cache below. With `excludeWorkoutId`
  it is what that workout's exercises carried on from (Today's target).

Writes, `latestPerLineage` and `latestPlanned` run in the order they were issued, on one queue inside the
repository, so the reads the store builds on see every write before them: the read that corrects the
carry-over cache after a write, and the plan position that finishing a workout asks for as soon as it has
dispatched the write.
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
History sit under the workout screen while sets are logged, as `useAppSelectorWhenFocused` did for the
selectors it replaces. Deps are compared like `useEffect`'s, so pass primitives, not js-joda values. An
`ignoreWrite` option names the writes that can't change the answer, so a query that leaves the workout in
progress out doesn't re-run on every set logged in it.

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
since finishing is what makes a workout count. All-time stats rebuild every `Session` in the range (about 0.8 s under Node for 5,000
workouts), which hydration used to pay once; pushing the per-movement aggregates into SQL is the
follow-up that removes it.

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
  test and never run on a device.
- `store/settings/import-backup-effects.spec.ts`: restores `utils/__test__/backup.liftlogbackup.sqlite.gz`,
  a backup made by this app's own export, round-trips export then restore, and rejects a pre-relational
  backup.

The reads are pinned by `services/workout-repository.spec.ts` too: each query against hand-built
workouts, and `personalRecords()` against `findPersonalRecords` over any generated history (fast-check).
`hooks/useWorkoutQuery.spec.tsx` covers the refresh and focus rules, and
`store/stored-sessions/history-from-sql.spec.ts` drives the store through an edit and a delete of a past
workout and reads the month list, calendar, records and stats back from the tables; its carry-over cases
start the next workout through `SessionService` after each, and a property check dispatches random writes
back to back and compares the cache with `latestPerLineage()` once they settle.

History-derived behaviour is pinned by snapshots:

- `store/stored-sessions/history-snapshots.spec.ts` runs every history aggregate (latest exercise per
  progression key, "last time", previous comparable session, month and range lists, streak, activity
  calendar, personal records, stats, export order) over a 420-session fixture
  (`utils/__test__/history-420.sessions.json.gz`), written through `WorkoutRepository.putMany` and
  hydrated by the real startup effect. Every case but the export order is fed by the repository's queries
  (the carry-over cache by the startup effect, which loads it from one). A change to that snapshot is a
  change in what users see, so it has to be deliberate and called out in the PR.
- `store/stored-sessions/startup-baseline.spec.ts` measures cold start (migrate, hydrate, first
  aggregates) and retained heap over a synthetic history (`utils/__test__/synthetic-history.ts`,
  5,000 sessions by default). It is skipped in the normal suite; run `npm run bench:startup` from `app/`
  (`LIFTLOG_BENCH_SESSIONS` / `LIFTLOG_BENCH_RUNS` override the size and repeat count). The numbers are
  only comparable with other runs on the same machine.

## Which one do I use?

Use **preferences** for a single scalar the user sets and the app reads - a toggle, a colour, a token, a
timestamp. Use **SQLite** for anything the user creates in quantity, anything queried or deleted by id,
and anything that needs to survive versioned shape changes.

Startup order is `initializeSettingsStateSlice` → (once settings are hydrated)
`initializeStoredSessionsStateSlice`. Preferences are therefore available to DB hydration, but not the
other way round; `stored-sessions/effects.ts` asserts this explicitly.

## Sessions, and the one in progress

`storedSessions.sessions` holds every session the user owns - their history _and_ the workout in
progress - keyed by id, with `activeSessionId` pointing at the live one. Screens address a session by
id (`updateStoredSession({ sessionId, update })`, mirroring `updateProgram`), so two screens editing
different sessions cannot collide.

Two things follow from that, and both matter when you touch this slice:

- **Editing a session must not re-run every aggregate.** Nothing on the workout path reads the whole
  history any more: "last time", Today's target, the comparison and the records come from the tables
  (see [Workouts](#workouts)), and the carry-over cache is kept per lineage. What is left on
  `selectSessions` (the Routines tab's last-done and round counts, the You profile, export, the CSV import
  dedupe) goes in PM-14. Until then it returns only _finished_ sessions and memoizes with
  `resultEqualityCheck: shallowEqual`, so the workout in progress cannot move it: the map changes identity
  on every recorded set, and handing back the previous array is what stops everything downstream from
  recomputing.

  Use `selectSession(state, id)` to look up a session by id, active or not, and `selectActiveSession`
  for the live workout.

- `useAppSelectorWhenFocused` (`store/index.ts`) does not run its selector at all while the screen is
  offscreen - it is the tool for an expensive selector on a screen that stays mounted underneath
  another. It returns the last value it saw until focus comes back. `useWorkoutQuery` applies the same
  rule to repository reads.
- `putStoredSession` / `updateStoredSession` mean "this session changed" and only write its content. An
  update that changes only what isn't stored (the rest timer, a running cardio timer) writes nothing.
  `sessionFinished` means "the user is done with it" and is what queues the feed publish, exports to the
  health aggregator and clears the active pointer. Keep completion work on the latter, or it fires once
  per set. Stats are the exception that listens to both: any write to a _finished_ session (edit,
  import, delete) marks them dirty, while sets recorded in the workout in progress don't, and
  `sessionFinished` covers that workout once it ends.
- **The carry-over cache** (`latestExercises`, the latest performance per lineage, which
  `SessionService` and the routine editor read) is loaded at startup by one query, `latestPerLineage()`,
  and kept current in two steps. The reducer moves it forward synchronously: a set logged in the workout
  in progress, or an edit at the same time or later, swaps the entry in without reading anything, so
  finishing a workout can build the next one at once. An entry the write may have moved _back_ - the
  workout that held it was deleted, or its exercise there was cleared, removed or moved earlier - is left
  in place, and after the write has landed the effect re-reads just those lineages
  (`staleLineages` + `refreshStaleLineages` in `stored-sessions/effects.ts`) and re-fetches the upcoming
  workouts. A lineage two workouts logged at the same instant is re-read too, so the tables' tie-break
  (then by reference time, workout id and position) decides rather than the order the writes came in. `latestExerciseWorkoutIds` records which workout each entry came from, which is how a write
  knows what it can have changed. A restore or import re-reads the whole cache. `earliestSession` is still
  derived from the hydrated sessions (its one reader, the You profile, moves in PM-14); stats ask the
  table (`earliestDate()`).

The `active` column has a single writer, `WorkoutRepository.setActive` (called by the `setActiveSessionId`
effect), with a unique partial index (`single_active_workout`) enforcing at most one - the same shape the
`program` table uses for the active plan.

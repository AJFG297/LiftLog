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
built-in exercise id list, the "built-in programs seeded" marker. That's the escape hatch for a value
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
- **The exercise blueprint** stays a JSON column on `workout_exercise`, and `workout.blueprint_version`
  records the `SessionBlueprintJSON` version it was written at. It is migrated on read by
  `sessionBlueprintMigrations`. A cardio set's own blueprint copy is JSON too; no chain step has ever
  changed it, so it is read as written.
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

History-derived behaviour is pinned by snapshots:

- `store/stored-sessions/history-snapshots.spec.ts` runs every whole-history aggregate (latest exercise
  per progression key, "last time", previous comparable session, month and range lists, streak, activity
  calendar, personal records, stats, export order) over a 420-session fixture
  (`utils/__test__/history-420.sessions.json.gz`), written through `WorkoutRepository.putMany` and
  hydrated by the real startup effect. A change to that snapshot is a change in what users see, so it has
  to be deliberate and called out in the PR.
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

- **Editing a session must not re-run every aggregate.** Streak, personal records, volume scales, the
  month list and the "previous performances" lookup all sweep the whole history, and screens that
  subscribe to them stay mounted while you edit - the History tab sits behind the workout screen, and
  the History list sits behind `/history/edit`. Three things keep an edit off that path, and all three
  matter:
  - `selectSessions` returns only _finished_ sessions, so the workout in progress cannot move it.
  - `selectRecentlyCompletedExercises(state, sessionId)` additionally drops the session being viewed,
    which is both what "previous" means and what makes editing a history session cheap.
  - Both memoize with `resultEqualityCheck: shallowEqual`. The underlying map changes identity on every
    recorded set, so the filter re-runs; handing back the previous array is what stops everything
    downstream from recomputing.

  Use `selectSession(state, id)` to look up a session by id, active or not, and `selectActiveSession`
  for the live workout.

- `useAppSelectorWhenFocused` (`store/index.ts`) does not run its selector at all while the screen is
  offscreen - it is the tool for an expensive selector on a screen that stays mounted underneath
  another. It returns the last value it saw until focus comes back.
- `putStoredSession` / `updateStoredSession` mean "this session changed" and only write its content. An
  update that changes only what isn't stored (the rest timer, a running cardio timer) writes nothing.
  `sessionFinished` means "the user is done with it" and is what queues the feed publish, exports to the
  health aggregator and clears the active pointer. Keep completion work on the latter, or it fires once
  per set. Stats are the exception that listens to both: any write to a _finished_ session (edit,
  import, delete) marks them dirty, while sets recorded in the workout in progress don't, and
  `sessionFinished` covers that workout once it ends.
- The derived caches (`latestExercises`, `earliestSession`) are kept by `storeSession` in the slice.
  Writes only move them forward, except when a write replaces the session a cached entry came from; then
  that entry is recomputed, so an edit that moves an exercise earlier or removes it can't leave a stale
  "latest" behind.

The `active` column has a single writer, `WorkoutRepository.setActive` (called by the `setActiveSessionId`
effect), with a unique partial index (`single_active_workout`) enforcing at most one - the same shape the
`program` table uses for the active plan.

# Plan: relational storage and stable exercise identity

Status: **draft**, not started.

This plan rests on two assumptions:

1. **The fork has no users yet.** There's no on-device data to keep, so there's no startup conversion, no
   writing to both old and new storage, no keeping legacy tables, and no downgrade support. The new tables
   replace the old ones outright.
2. **The fork talks only to its own backend and keeps no compatibility with upstream**
   ([ADR-0001](../adr/0001-own-backend-no-upstream-compatibility.md)). JSON versions can be bumped
   freely, and nothing has to stay readable by upstream clients.

If the first assumption stops holding before this ships, re-read "Dropped because there are no users"
below.

## Why

Two decisions in the data layer limit the app as history grows:

1. **Every session is a JSON blob, and the whole history lives in Redux.**
   - At startup the app runs `SELECT * FROM session`, migrates each payload into a `Session` class
     instance, and blocks the UI until that finishes (`app/src/store/stored-sessions/effects.ts:46-60`,
     `components/smart/app-state-provider.tsx:22`).
   - Every aggregate sweeps the full history in JS: streak, PRs, calendar, stats, "last time".
   - Every set tap rewrites the whole session row.
   - Startup time and memory grow with history. Upstream #967 reports about 10 s to start after a large
     import.
2. **Exercises are identified by a fuzzy name, not an ID.**
   - `normalizeExerciseName` / `movementKey()` / `progressionKey()`
     (`app/src/models/blueprint-models/index.ts:340-1004`) are the only link between history, stats, PRs
     and carry-over. No blueprint references an `ExerciseDescriptor`.
   - Renaming an exercise in the editor splits its history and resets carry-over to 0.
   - Renaming it in manage-exercises orphans its history.
   - Localized names get baked into history.
   - The normalizer merges and splits names arbitrarily: "Lunge" ≠ "Lunges", and "lunges" becomes
     "lung".

## Goals / non-goals

**Goals**

- History lives in queryable tables. Redux holds only the active workout and small derived caches.
- Startup cost doesn't grow with history size.
- Exercises have stable IDs, so renaming an exercise keeps its history and carry-over.
- Aggregates behave exactly as they do today, unless a change is deliberate and written down.

**Non-goals** (separate follow-ups)

- Moving programs, feed items or preferences off JSON blobs. Programs are small and always edited whole.
- Removing class instances from Redux, or re-enabling `serializableCheck`. The active workout stays a
  `Session` instance.
- Changing how the normalizer merges and splits names. That becomes a user-facing "merge exercises"
  feature.
- Repointing the built-in backend away from `api.liftlog.online`. That's tracked by ADR-0001's follow-up.

## Dropped because there are no users

- Converting existing on-device sessions to rows at startup.
- Writing both blobs and rows, verification checks, and a soak release before switching the source of
  truth.
- Keeping the legacy `session` table.
- Backfilling exercise IDs into existing history and programs.
- Downgrade support, and letting an old app restore a new backup.
- Importing upstream LiftLog backups (also ruled out by ADR-0001).

## Constraints that still apply

- **This fork's own app versions must stay compatible with each other** for anything shared through the
  feed. The migrator rejects payloads from a newer version, so bumping versions is fine as long as it
  follows the chain rules in `docs/Migrations.md`.
- **Generated schemas must be regenerated with every session or blueprint version bump.**
  - `npm run json-schema` regenerates them.
  - The Android workout worker's Kotlin is generated from these schemas and asserts the exact session
    version.
  - The plan-file validator shipped in the plan-builder plugin is generated from the same schemas.
- **Aggregate behaviour.** Carry-over, PRs, streak, calendar and stats must compute the same results
  (see phase 0).

## Key decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Hybrid relational.** Sessions, exercises and sets become rows. The recorded exercise's *blueprint snapshot* stays a JSON column, still migrated by `sessionBlueprintMigrations`. | Blueprints (progression rules, rest, planned sets) are complex, never queried, and already have a tested migration chain. Sets are what every aggregate queries. |
| D2 | **Replace, don't coexist.** One SQL migration drops `session` and creates the new tables. `app/src/drizzle/` can be squashed to a fresh baseline. | Nothing on devices needs preserving. |
| D3 | **Storage is separate from the domain model.** A mapper converts rows to and from `Session`. `Session.toJSON()` remains the serialized form for the feed, share links and the worker. | Storage shape and wire shape can then evolve independently, and the rows are shaped for queries, not for transport. |
| D4 | **`exerciseId` goes directly on the blueprint JSON** (a new version in the blueprint chain). An `ExerciseResolver` turns incoming *names* into IDs: plan files, the AI planner, CSV import, placeholders. Renaming a descriptor changes only the descriptor, and history follows because it references the ID. | ADR-0001 lets JSON versions change freely. That is simpler than the alias table the earlier draft needed to keep upstream-compatible JSON. |
| D5 | **History reads go through a repository and hooks, not Redux.** Redux keeps the active session and small caches (latest by progression key, earliest date). | Removes the full hydration. Screens query only what they show. |
| D6 | **Query columns are computed on write:** `movement_key` (`exercise_id\|kind`), `progression_key`, `completed_at`, weight as exact text plus `weight_kg` real, `effective_weight_kg`, session `reference_time`, and `volume_kg`. | These come from JS methods today. SQL can't aggregate values it can't see. |
| D7 | **An edit rewrites only that workout's child rows, in one transaction.** Changes that only touch the rest timer stop persisting. | O(workout) per tap instead of O(history). Diffing individual sets can come later if it's needed. |

## Target schema (sketch)

The final shape gets settled in ticket 2.

```ts
// Built-in IDs stay the English catalog name, which is already stable and is the key for override rows.
// User exercises keep their uuid. Blueprints carry `exerciseId` (D4).

workout          (id TEXT PK,
                  active INTEGER NOT NULL DEFAULT 0,  // partial unique index, as today
                  date TEXT NOT NULL, reference_time TEXT,
                  started_at TEXT, ended_at TEXT,
                  name TEXT NOT NULL, notes TEXT NOT NULL, is_freeform INTEGER NOT NULL,
                  bodyweight_value TEXT, bodyweight_unit TEXT,
                  volume_kg REAL)

workout_exercise (id TEXT PK, workout_id TEXT NOT NULL REFERENCES workout ON DELETE CASCADE,
                  position INTEGER NOT NULL, kind TEXT NOT NULL,   // 'weighted' | 'cardio'
                  exercise_id TEXT NOT NULL,
                  movement_key TEXT NOT NULL, progression_key TEXT NOT NULL,
                  latest_time TEXT, notes TEXT,
                  blueprint JSON NOT NULL)

weighted_set     (workout_exercise_id REFERENCES workout_exercise ON DELETE CASCADE,
                  position INTEGER, completed_at TEXT,
                  weight_value TEXT, weight_unit TEXT, weight_kg REAL, effective_weight_kg REAL,
                  reps INTEGER, target_reps INTEGER, rpe REAL,
                  PRIMARY KEY (workout_exercise_id, position))

cardio_set       (… duration, distance, resistance, incline, weight, steps, completed_at …)

-- indexes: workout(date), workout(reference_time), workout_exercise(workout_id),
--          workout_exercise(movement_key, latest_time), workout_exercise(progression_key, latest_time)
```

## Phases

Rough estimates, one person. Tracked in Linear as PM-8, with sub-issues PM-9 to PM-14:

- PM-9: phase 0
- PM-10: phase 1 steps 1–3, plus backups
- PM-11: phase 1 steps 4–7
- PM-12 and PM-13: phase 2 steps 1–3; these two can run in parallel
- PM-14: the rest of phase 2, plus docs

### Phase 0: behaviour snapshots and baseline (about 1 day)

- **Characterization tests.** Run today's selectors over the existing backup fixture
  (`utils/__test__/export.liftlogbackup.sqlite.gz`, 420 sessions) and snapshot their outputs. These
  snapshots are the oracle for the rewrite, so commit them before touching storage. Cover:
  - `selectLatestExercises`, `selectRecentlyCompletedExercises`, `selectPreviousComparableSession`
  - `selectSessionsInMonth`, `selectSessionsBy`
  - `selectStreakStats`, `selectActivityMonth`, `selectHistoryPersonalRecords`
  - `calculateStats`, `getOrderedSessions`
- **Baseline.** Scale the fixture to about 5k sessions and measure cold start to interactive. That
  number is the success metric.
- **Known bugs.** Fix each one or pin it in a test. Don't carry any over by accident:
  - `stats.isDirty` isn't set on delete or edit.
  - `earliestSession` isn't recomputed on delete or reset.
  - `latestExercises` only grows on edit.
  - `importBackupData` doesn't await its upserts before re-running migrations.

### Phase 1: new schema, exercise identity, repository (about 1 week)

1. **Schema.** Add the tables above and drop `session` in the same migration. Consider squashing
   `app/src/drizzle/` to one baseline. Add a check that the journal (`drizzle/migrations.js`) matches the
   folder: the Vitest shim reads the folder, so a missing journal entry wouldn't fail any test.
2. **Row mapper** (`Session ⇄ rows`), with a round-trip property test using the existing fast-check
   generators (`app/src/models/storage/generators.ts`). It must cover cardio, supersets, RPE, unlogged
   sets and the embedded blueprint.
3. **`WorkoutRepository`**, injected via `extra`. It owns every write: put, update, delete, set active,
   and bulk insert for CSV import. Each write is a per-workout transaction (D7).
   `stored-sessions/effects.ts` calls the repository instead of writing SQL directly.
4. **`exerciseId` on blueprints.** Add a new blueprint-chain version, then regenerate the schemas (for
   the worker Kotlin and the plan-builder validator).
5. **`ExerciseResolver`** (`resolve(name, kind) → exerciseId`). It resolves in this order:
   1. a user descriptor with the same normalized name
   2. a built-in by English name, any locale overlay name, or an override's name
   3. otherwise, a new stub descriptor

   Weighted and cardio exercises with the same name get separate IDs, matching today's split
   `movementKey`.
6. **Route every producer of exercise names through the resolver:**
   - editor search selection (carry the descriptor ID instead of copying the name)
   - built-in program seeding
   - `.liftlogplan` import (`exerciseId` is optional in plan files, and names resolve)
   - AI plan save
   - FitNotes/StrongLifts CSV import
   - incoming feed and shared items (friends' IDs for their own custom exercises mean nothing locally)
   - the "Exercise N" / "New Exercise" placeholders
   - route params (`exercise-history`, `expanded-weighted-exercise`)
7. **Keys.**
   - `movementKey` becomes `exerciseId|kind`.
   - `progressionKey` becomes the exercise ID plus the rep scheme. This intentionally merges lineages
     that differ only by case ("Squat" vs "squat").
   - `selectExerciseView` currently matches by name without type; move it to `movementKey`.

### Phase 2: reads from SQL, remove full hydration (1-2 weeks)

Move one consumer group at a time, each gated by the phase 0 snapshots. Add a `useWorkoutQuery` hook
that refreshes on repository write events. Use Drizzle's `useLiveQuery` only if it works under the
libsql Vitest shim; otherwise wrap it.

1. **Hot path:**
   - Build `latestExercises` at startup from "latest `workout_exercise` per `progression_key`", including
     the active session, and update it incrementally on write.
   - Plan position: the most recent non-freeform workout.
   - "Last time" and previous reps (`movement_key … ORDER BY latest_time DESC LIMIT n`).
   - Previous comparable session.
2. **History tab:**
   - Month list and day filter.
   - Calendar volume (`volume_kg`, p10/p90).
   - Streak (distinct days per week).
   - PR badges: start with a running-max query, and materialize a `personal_record` table only if that's
     slow.
3. **Stats.** First fetch the date range from SQL and reuse `calculateStats` as it is. Later, push the
   per-movement aggregates into SQL. Invalidate on any workout write.
4. **The rest:**
   - Plaintext export (streamed in order).
   - CSV-import dedupe, reaction acceptance and feed publishing (point or `IN` queries).
   - The exercise-history screen (paginated).
5. **Remove full hydration.** `storedSessions.sessions` holds only the active session, plus an on-demand
   "editing" slot that `/history/edit` loads by ID. Delete `ProgressRepository` and
   `selectFinishedSessions`, and remove any uses of `useAppSelectorWhenFocused` that are no longer
   needed. Startup then waits only for the active session and the latest-by-key cache.
6. **Measure** against the phase 0 baseline.

### Phase 3: backups and cleanup (2-3 days)

- **Backups.** The raw SQLite copy (`store/settings/util.ts`) already carries the new tables. Restore
  becomes: run migrations on the file, then copy its rows. Replace the upstream-era fixtures in
  `import-backup-effects.spec.ts` with a new-format backup.
- **Delete upstream-era import code** (ADR-0001):
  - legacy key-value/protobuf data migrations: `import-sessions`, `import-programs`,
    `import-exercises`, `import-exercises-from-workouts`, `import-feed`
  - `migrate-nil-weight-units`
  - `legacy-current-session`
  - the protobuf backup restore path

  Keep the payload migration chains: the blueprint JSON column and feed items still use them.
- **Docs.** Update `docs/Storage.md` and `docs/Migrations.md`, and add an ADR covering D1-D4.
- **Follow-ups:**
  - Exercise merge UI and the normalizer fix.
  - Rename detection in `blueprint-diff`.
  - Showing descriptor muscles and instructions during a workout.
  - Removing class instances from Redux.

## Formats to keep working

Only this fork's own formats are listed (ADR-0001).

| Format | Guarded by |
|---|---|
| Feed and share payloads between versions of this fork | `feed-items-effects.spec.ts`, the migrator's future-version rejection |
| Workout-worker messages (Kotlin asserts the session version) | `workout-worker-messages.spec.ts`. Regenerate schemas on every bump |
| `.liftlogplan` and AI-plan JSON | `plan-file.spec.ts`. Regenerate the plugin validator on a blueprint bump |
| Plaintext CSV column order and JSON shape | `export-plaintext-effects.spec.ts` snapshot |
| Session IDs (Health Connect / HealthKit record IDs, CSV UUID v5 dedupe) | Repository and mapper keep IDs; add an assertion |

## Risks and open questions

- **Deliberate behaviour changes:**
  - `progressionKey` merges case variants.
  - Whichever phase 0 bugs get fixed.
  - Stats stay fresh after edits.

  List them in the PR.
- **Ambiguous names.** One incoming string can match several candidates: a user exercise, a built-in, a
  locale name. The resolver's order is fixed (phase 1, step 5). Log collisions in dev.

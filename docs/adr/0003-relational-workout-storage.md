# ADR-0003: Workouts in relational tables, read on demand, with stable exercise ids

Status: accepted (2026-10-03)

## Context

- Every workout was one JSON blob in a `session` table, and the whole history lived in Redux.
  - Startup read every row, migrated each payload into a `Session` and blocked the UI until it finished.
  - Every aggregate (streak, records, calendar, stats, "last time") swept the whole history in JS.
  - Every logged set rewrote the whole session row.
  - Startup time and memory grew with the history: about 1 s and 88 MB retained for 5,000 workouts under
    Node (`npm run bench:startup`, PM-9), and upstream reported about 10 s after a large import.
- Exercises were linked to their history by a normalised name, not an id. Renaming an exercise split its
  history and reset carry-over; localized names were baked into history.
- The fork has no users to migrate and talks only to its own backend (ADR-0001), so JSON versions can change
  freely and old tables can simply be replaced.

The work was planned in [plans/relational-storage.md](../plans/relational-storage.md) and done in PM-9 to
PM-14. This records its decisions.

## Decision

- **D1 - Hybrid relational.** A workout is rows: `workout`, `workout_exercise`, `weighted_set`,
  `warmup_set` and `cardio_set`. The recorded exercise's blueprint stays a JSON column, migrated on read by
  `sessionBlueprintMigrations` at the version `workout.blueprint_version` records. Blueprints are complex
  and never queried; sets are what every aggregate queries.
- **D2 - Replace, don't coexist.** Migration `0009` drops `session` and creates the tables. There was no
  dual writing, verification phase or downgrade path. A backup from before the layout is refused on restore.
- **D3 - Storage is separate from the domain model.** `services/workout-rows.ts` maps a `Session` to rows
  and back. `Session.toJSON()` stays the wire format for the feed, share links and the workout worker, so
  the storage shape and the wire shape change independently.
- **D4 - Stable exercise ids on the blueprint.** Every blueprint carries an `exerciseId`: a built-in's
  English catalog name, a user exercise's uuid, or a stub id derived from the normalised name. Names coming
  in from outside are turned into ids by `ExerciseResolver`. Renaming an exercise changes only its
  descriptor. `movement_key` and `progression_key` are built from the id.
- **D5 - History reads go through a repository, not Redux.** `WorkoutRepository` owns every read and write
  of the tables. Screens read what they show through `useWorkoutQuery`, which re-queries after the
  repository reports a write. Redux holds only the workout in progress, an editing slot the history
  editor loads by id, a recent slot for the workout just finished, and small caches: the carry-over cache and the stats view. Startup reads the workout
  in progress and the carry-over cache, nothing else.
- **D6 - Query columns are computed on write.** `reference_time_ms`, `volume_kg`, `movement_key`,
  `progression_key`, `lineage`, `latest_time_ms`, `completed_at_ms`, `weight_kg` and
  `effective_weight_kg` come from the same domain methods the app computes them with, so SQL can't drift
  from what the app shows. They are never read back into a `Session`.
- **D7 - An edit rewrites only that workout's rows, in one transaction** (`writeAtomically`, which is
  atomic on the synchronous device driver too). Changes to what isn't stored, like the rest timer, write
  nothing.

## Consequences

- Startup no longer grows with the history: 5,000 workouts start in about 170 ms with 0.6 MB retained
  under Node, against about 1,040 ms and 88 MB before, and hydration takes about 9 ms at 500 workouts and
  at 5,000. A test (`store/stored-sessions/startup-reads.spec.ts`) holds startup to the same bounded,
  index-seeking statements whatever the history's size.
- A logged set costs one workout's rows, not the history.
- Renaming an exercise keeps its history and carry-over.
- Each screen pays for what it shows, when it is shown. Whole-range screens (all-time Stats, the Progress
  tab) still rebuild every workout in their range; pushing their per-movement aggregates into SQL is the
  follow-up.
- Two migration mechanisms to keep straight: SQL migrations for tables and query columns (a new query
  column must fill the rows already stored), and payload chains for the blueprint JSON
  ([Migrations.md](../Migrations.md)).
- Code that edits a past workout must open it first (`openSessionForEditing`); an update to a workout
  that isn't open does nothing. [Storage.md](../Storage.md) has the rules.

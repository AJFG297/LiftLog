import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { deserializeDatabaseAsync, openDatabaseAsync } from 'expo-sqlite';
import { dataMigrationsSchema, exercisesSchema } from '@/db/schema';
import { normalizeExerciseName } from '@/models/blueprint-models';
import { fromExerciseDescriptorJSON } from '@/models/exercise-models';
import { ExerciseMerge } from '@/models/exercise-merge';
import { legacyNormalizeExerciseName } from '@/models/legacy-exercise-name';
import { exerciseDescriptorMigrations } from '@/models/storage/versions/migrations';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import {
  addedBuiltInExerciseIdsStorageKey,
  dedupeBuiltInExercises,
  dedupeBuiltInExercisesDataMigration,
} from '@/services/data-migrations/dedupe-builtin-exercises';
import { readHiddenBuiltInIds } from '@/services/hidden-built-in-exercises';
import { linkExerciseIds, linkExerciseIdsDataMigration } from '@/services/data-migrations/link-exercise-ids';
import { mergeExerciseNames, planStoredExerciseMerges } from '@/services/data-migrations/merge-exercise-names';
import { loadBuiltInExerciseNames, loadCanonicalBuiltInExercises } from '@/services/exercise-catalog';
import { WorkoutRepository } from '@/services/workout-repository';
import { generateSyntheticHistory } from '@/utils/__test__/synthetic-history';

/**
 * The merge migration's dry run: runs it over an in-memory copy of a backup, or of the PM-9 synthetic
 * history, and prints the merged name groups and re-keyed stubs of every round. The file is never written.
 * Skipped unless asked for:
 *
 *   LIFTLOG_MERGE_DRY_RUN=path/to/backup.liftlogbackup.sqlite.gz npm run merge-exercises:dry-run
 *   LIFTLOG_MERGE_DRY_RUN=synthetic npm run merge-exercises:dry-run   (LIFTLOG_BENCH_SESSIONS sets the size)
 *
 * Data that was never linked to exercise ids is linked first with the old fold (`legacyNormalizeExerciseName`),
 * the way a phone on an older build linked it, so the plan is the one that phone would run.
 *
 * Deleted built-ins come from the backup the way the phone gets them: the built-in de-dup lists them in the
 * key-value store and the merge reads them back. A backup from before the de-dup holds a copy of every
 * built-in its build knew, so one missing was deleted (or added to the catalog since). A later backup doesn't carry the list (it lives
 * only on the phone), and the plan is made with none.
 */
const source = process.env.LIFTLOG_MERGE_DRY_RUN;

const fold = vi.hoisted(() => ({ legacy: undefined as ((name: string) => string) | undefined }));
vi.mock('@/models/blueprint-models/exercise-name', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/models/blueprint-models/exercise-name')>();
  return { normalizeExerciseName: (name: string) => (fold.legacy ?? actual.normalizeExerciseName)(name) };
});

const logger = { info: vi.fn() };
// The phone's key-value store, for the de-dup to write the deleted built-ins to.
const stored = new Map<string, string>();
const keyValueStore = {
  getItem: (key: string) => Promise.resolve(stored.get(key)),
  setItem: (key: string, value: string) => Promise.resolve(void stored.set(key, value)),
};

async function open(from: string): Promise<ExpoSQLiteDatabase> {
  if (from === 'synthetic') {
    const db = drizzle(await openDatabaseAsync(':memory:'));
    await new DatabaseMigrationService(db, logger as never, { importOldData: async () => {} }).migrate();
    const count = Number(process.env.LIFTLOG_BENCH_SESSIONS ?? 5000);
    await new WorkoutRepository(db).putMany(generateSyntheticHistory({ count }));
    return db;
  }
  const bytes = readFileSync(from);
  const db = drizzle(await deserializeDatabaseAsync(from.endsWith('.gz') ? gunzipSync(bytes) : bytes));
  await new DatabaseMigrationService(db, logger as never, { importOldData: async () => {} }).migrate();
  return db;
}

/** Runs the data migrations before the merge that `db` hasn't had, as an older build ran them. */
async function catchUp(db: ExpoSQLiteDatabase) {
  const run = new Set((await db.select().from(dataMigrationsSchema)).map((x) => x.id));
  if (!run.has(dedupeBuiltInExercisesDataMigration)) {
    // Builds before the de-dup copied every built-in into the table, and listed each one they copied. A
    // table with no copies (a fresh install, the synthetic history) had none to list.
    const builtIns = Object.keys(await loadCanonicalBuiltInExercises());
    const ids = new Set((await db.select({ id: exercisesSchema.id }).from(exercisesSchema)).map((x) => x.id));
    const copied = builtIns.some((id) => ids.has(id)) ? builtIns : [];
    await keyValueStore.setItem(addedBuiltInExerciseIdsStorageKey, JSON.stringify(copied));
    await dedupeBuiltInExercises(db, keyValueStore as never);
  }
  if (!run.has(linkExerciseIdsDataMigration)) {
    fold.legacy = legacyNormalizeExerciseName;
    try {
      await linkExerciseIds(db);
    } finally {
      fold.legacy = undefined;
    }
  }
}

/** What the report names exercises by, read before the merge changes it. */
async function snapshot(db: ExpoSQLiteDatabase) {
  return {
    names: Object.fromEntries(
      (await db.select().from(exercisesSchema)).map((row) => [
        row.id,
        fromExerciseDescriptorJSON(exerciseDescriptorMigrations.migrate(row.payload)).name,
      ]),
    ),
    usage: await new WorkoutRepository(db).exerciseUsage(),
    started: (await new WorkoutRepository(db).startedWorkouts()).count,
  };
}

async function report(
  { names, usage, started }: Awaited<ReturnType<typeof snapshot>>,
  hidden: string[] | undefined,
  rounds: ExerciseMerge[][],
): Promise<string> {
  const merges = rounds.flat();
  const describe = (id: string) => `"${names[id] ?? id}" (${usage[id]?.workouts ?? 0} workouts) [${id}]`;
  // A merge of one exercise that nothing sits beside is a stub moving to its new id.
  const isRekey = (merge: ExerciseMerge) =>
    merge.survivor.kind === 'stub' && merge.mergedIds.length === 1 && !(merge.survivor.id in names);
  const groups = merges.filter((x) => !isRekey(x));
  const rekeys = merges.filter(isRekey);

  const builtIns = Object.keys(await loadBuiltInExerciseNames());
  const changed = builtIns.filter((id) => legacyNormalizeExerciseName(id) !== normalizeExerciseName(id));

  return [
    `Source: ${source}`,
    `Exercises in the table: ${Object.keys(names).length}; workouts: ${started} started`,
    hidden
      ? `Deleted built-ins: ${hidden.length}${hidden.length ? ` (${hidden.join(', ')})` : ''}`
      : 'Deleted built-ins: not in this backup (kept on the phone); planned with none',
    `Rounds: ${rounds.length}`,
    '',
    `Merged name groups: ${groups.length}`,
    ...groups.flatMap((merge) => [
      `  ${merge.normalizedName} -> ${merge.survivor.kind} ${
        merge.survivor.kind === 'builtin' ? `"${merge.survivor.id}"` : describe(merge.survivor.id)
      }${merge.survivor.kind === 'stub' && !(merge.survivor.id in names) ? ' (new stub id)' : ''}`,
      ...merge.mergedIds.map((id) => `      merges ${describe(id)}`),
    ]),
    '',
    `Re-keyed stubs: ${rekeys.length}`,
    ...rekeys.map((merge) => `  ${describe(merge.mergedIds[0]!)} -> ${merge.survivor.id}`),
    '',
    `Built-ins whose key changed: ${changed.length} of ${builtIns.length} (ids unchanged; only how names match them)`,
    ...changed.map((id) => `  ${id}: "${legacyNormalizeExerciseName(id)}" -> "${normalizeExerciseName(id)}"`),
  ].join('\n');
}

describe.skipIf(!source)('merge exercise names, dry run', () => {
  it(`plans the merge over ${source}`, { timeout: 600_000 }, async () => {
    const db = await open(source!);
    const deduped = (await db.select().from(dataMigrationsSchema)).some(
      (x) => x.id === dedupeBuiltInExercisesDataMigration,
    );
    await catchUp(db);
    const hidden = deduped ? undefined : await readHiddenBuiltInIds(keyValueStore);
    const before = await snapshot(db);

    const rounds = await mergeExerciseNames(db, hidden ?? []);

    // Straight to stdout: Vitest's console interception drops logs from passing tests.
    process.stdout.write(`\nMERGE_DRY_RUN\n${await report(before, hidden, rounds)}\n`);
    // What the phone relies on: no round keeps an id it merges, and the merge leaves nothing to plan.
    for (const round of rounds) {
      const kept = new Set(round.map((x) => x.survivor.id));
      expect(round.flatMap((x) => x.mergedIds).filter((id) => kept.has(id))).toEqual([]);
    }
    expect(await planStoredExerciseMerges(db, hidden ?? [])).toEqual([]);
  });
});

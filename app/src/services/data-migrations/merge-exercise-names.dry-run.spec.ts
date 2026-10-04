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
  dedupeBuiltInExercises,
  dedupeBuiltInExercisesDataMigration,
} from '@/services/data-migrations/dedupe-builtin-exercises';
import { linkExerciseIds, linkExerciseIdsDataMigration } from '@/services/data-migrations/link-exercise-ids';
import { planStoredExerciseMerges } from '@/services/data-migrations/merge-exercise-names';
import { loadBuiltInExerciseNames } from '@/services/exercise-catalog';
import { WorkoutRepository } from '@/services/workout-repository';
import { generateSyntheticHistory } from '@/utils/__test__/synthetic-history';

/**
 * The merge migration's dry run: plans it over a backup, or over the PM-9 synthetic history, and prints the
 * merged name groups and re-keyed stubs without writing anything back. Skipped unless asked for:
 *
 *   LIFTLOG_MERGE_DRY_RUN=path/to/backup.liftlogbackup.sqlite.gz npm run merge:dry-run
 *   LIFTLOG_MERGE_DRY_RUN=synthetic npm run merge:dry-run        (LIFTLOG_BENCH_SESSIONS sets the size)
 *
 * Data that was never linked to exercise ids is linked first with the fold from before the fix, the way a
 * phone on an older build linked it, so the plan is the one that phone would run.
 */
const source = process.env.LIFTLOG_MERGE_DRY_RUN;

const fold = vi.hoisted(() => ({ legacy: undefined as ((name: string) => string) | undefined }));
vi.mock('@/models/blueprint-models/exercise-name', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/models/blueprint-models/exercise-name')>();
  return { normalizeExerciseName: (name: string) => (fold.legacy ?? actual.normalizeExerciseName)(name) };
});

const logger = { info: vi.fn() };
const keyValueStore = { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() };

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

async function report(db: ExpoSQLiteDatabase, merges: ExerciseMerge[]): Promise<string> {
  const names = Object.fromEntries(
    (await db.select().from(exercisesSchema)).map((row) => [
      row.id,
      fromExerciseDescriptorJSON(exerciseDescriptorMigrations.migrate(row.payload)).name,
    ]),
  );
  const usage = await new WorkoutRepository(db).exerciseUsage();
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
    `Exercises in the table: ${Object.keys(names).length}; workouts: ${(await new WorkoutRepository(db).startedWorkouts()).count} started`,
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
    await catchUp(db);

    const merges = await planStoredExerciseMerges(db, []);

    // Straight to stdout: Vitest's console interception drops logs from passing tests.
    process.stdout.write(`\nMERGE_DRY_RUN\n${await report(db, merges)}\n`);
    expect(merges).toBeDefined();
  });
});

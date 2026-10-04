import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { eq, inArray, sql } from 'drizzle-orm';
import { writeAtomically } from '@/db/helpers';
import { dataMigrationsSchema, exercisesSchema, programsSchema } from '@/db/schema';
import { ExerciseBlueprint, ExerciseId, ProgramBlueprint } from '@/models/blueprint-models';
import { fromExerciseDescriptorJSON, toExerciseDescriptorJSON } from '@/models/exercise-models';
import { ExerciseMerge, planExerciseMerges } from '@/models/exercise-merge';
import { mapProgramExercises, mapSessionExercises } from '@/models/exercise-resolver';
import { exerciseDescriptorMigrations, programBlueprintMigrations } from '@/models/storage/versions/migrations';
import { loadBuiltInExerciseNames, loadCanonicalBuiltInExercises } from '@/services/exercise-catalog';
import { WorkoutRepository } from '@/services/workout-repository';

export const mergeExerciseNamesDataMigration = 'MERGE_PLURAL_EXERCISE_NAMES';

/**
 * The merges {@link mergeExerciseNames} would apply to `db`, read from the exercise table and one count of
 * workouts per exercise. Also what the dry run prints.
 */
export async function planStoredExerciseMerges(
  db: ExpoSQLiteDatabase,
  hiddenBuiltInIds: readonly ExerciseId[],
): Promise<ExerciseMerge[]> {
  const [rows, builtInNames, builtInExercises, usage] = await Promise.all([
    db.select().from(exercisesSchema),
    loadBuiltInExerciseNames(),
    loadCanonicalBuiltInExercises(),
    new WorkoutRepository(db).exerciseUsage(),
  ]);
  return planExerciseMerges({
    savedExercises: Object.fromEntries(
      rows.map((row) => [row.id, fromExerciseDescriptorJSON(exerciseDescriptorMigrations.migrate(row.payload))]),
    ),
    builtInNames,
    builtInExercises,
    hiddenBuiltInIds,
    usage,
  });
}

/**
 * Before PM-5 the name fold kept `Lunge` and `Lunges` apart, so linking (`LINK_EXERCISE_IDS`) gave each its
 * own exercise and split their history. Merge every group the fixed fold joins, and move each stub to the id
 * its name now derives (see `planExerciseMerges`).
 *
 * Safe to stop at any point and run again: the plan is read afresh and comes out the same, and each step
 * only touches what still points at a merged id. In order:
 *   1. the survivors' descriptors are written, so the plan read after a crash finds them;
 *   2. the workouts logging a merged id are rewritten through the repository, `batchSize` at a time,
 *      which recomputes their `movement_key`, `progression_key` and `lineage`;
 *   3. the saved plans are rewritten, the merged descriptors deleted and the migration recorded, together.
 * A user with nothing to merge has none of their data written.
 */
export async function mergeExerciseNames(
  db: ExpoSQLiteDatabase,
  hiddenBuiltInIds: readonly ExerciseId[],
  { batchSize = 200 }: { batchSize?: number } = {},
) {
  const merges = await planStoredExerciseMerges(db, hiddenBuiltInIds);
  const survivorOf = new Map(merges.flatMap((merge) => merge.mergedIds.map((id) => [id, merge.survivor.id] as const)));
  const repoint = <T extends ExerciseBlueprint>(blueprint: T): T => {
    const survivor = survivorOf.get(blueprint.exerciseId);
    return survivor === undefined ? blueprint : (blueprint.with({ exerciseId: survivor }) as T);
  };

  const survivors = merges.flatMap(({ survivor, survivorDescriptor }) =>
    survivorDescriptor ? [{ id: survivor.id, payload: toExerciseDescriptorJSON(survivorDescriptor) }] : [],
  );
  if (survivors.length) {
    await db
      .insert(exercisesSchema)
      .values(survivors)
      .onConflictDoUpdate({
        target: exercisesSchema.id,
        set: { payload: sql.raw(`excluded.${exercisesSchema.payload.name}`) },
      });
  }

  const workoutRepository = new WorkoutRepository(db);
  const workoutIds = await workoutRepository.workoutIdsLogging([...survivorOf.keys()]);
  for (let start = 0; start < workoutIds.length; start += batchSize) {
    const workouts = await workoutRepository.getMany(workoutIds.slice(start, start + batchSize));
    await workoutRepository.putMany(workouts.map((workout) => mapSessionExercises(workout, repoint)));
  }

  const programs = survivorOf.size
    ? (await db.select().from(programsSchema)).flatMap((row) => {
        const program = ProgramBlueprint.fromJSON(programBlueprintMigrations.migrate(row.payload));
        const payload = mapProgramExercises(program, repoint).toJSON();
        return JSON.stringify(payload) === JSON.stringify(program.toJSON()) ? [] : [{ id: row.id, payload }];
      })
    : [];
  const mergedIds = [...survivorOf.keys()];
  await writeAtomically(db, (tx) => [
    ...programs.map(({ id, payload }) => tx.update(programsSchema).set({ payload }).where(eq(programsSchema.id, id))),
    ...(mergedIds.length ? [tx.delete(exercisesSchema).where(inArray(exercisesSchema.id, mergedIds))] : []),
    tx.insert(dataMigrationsSchema).values({ id: mergeExerciseNamesDataMigration }).onConflictDoNothing(),
  ]);
}

import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { writeAtomically } from '@/db/helpers';
import { dataMigrationsSchema, exercisesSchema, programsSchema } from '@/db/schema';
import { ProgramBlueprint } from '@/models/blueprint-models';
import { fromExerciseDescriptorJSON, toExerciseDescriptorJSON } from '@/models/exercise-models';
import { ExerciseResolver, logAmbiguousInDev } from '@/models/exercise-resolver';
import { exerciseDescriptorMigrations, programBlueprintMigrations } from '@/models/storage/versions/migrations';
import { loadBuiltInExerciseNames } from '@/services/exercise-catalog';
import { WorkoutRepository } from '@/services/workout-repository';

export const linkExerciseIdsDataMigration = 'LINK_EXERCISE_IDS';

/**
 * Workouts and plans stored before blueprints carried an exercise id only have names. Link every one of
 * them to an exercise, adding stubs for names nothing matches, and write each workout back so its
 * `movement_key` and `progression_key` columns come from the ids too.
 *
 * Safe to run twice: a linked blueprint keeps its id, and stubs are only added where missing.
 */
export async function linkExerciseIds(db: ExpoSQLiteDatabase) {
  const savedExercises = Object.fromEntries(
    (await db.select().from(exercisesSchema)).map((row) => [
      row.id,
      fromExerciseDescriptorJSON(exerciseDescriptorMigrations.migrate(row.payload)),
    ]),
  );
  const resolver = new ExerciseResolver({
    savedExercises,
    builtInNames: await loadBuiltInExerciseNames(),
    // Runs before the store and its logger exist.
    onAmbiguous: logAmbiguousInDev(console),
  });

  const workoutRepository = new WorkoutRepository(db);
  const { workouts } = await workoutRepository.loadAll();
  const linkedWorkouts = workouts.map((workout) => resolver.linkSession(workout));
  const programs = (await db.select().from(programsSchema)).map((row) => ({
    id: row.id,
    payload: resolver.linkProgram(ProgramBlueprint.fromJSON(programBlueprintMigrations.migrate(row.payload))).toJSON(),
  }));
  const stubs = Object.entries(resolver.stubs).map(([id, exercise]) => ({
    id,
    payload: toExerciseDescriptorJSON(exercise),
  }));

  // Every workout, not just the ones whose ids changed: the key columns of all of them are stale.
  await workoutRepository.putMany(linkedWorkouts);
  await writeAtomically(db, (tx) => [
    ...(stubs.length ? [tx.insert(exercisesSchema).values(stubs).onConflictDoNothing()] : []),
    ...programs.map(({ id, payload }) => tx.update(programsSchema).set({ payload }).where(eq(programsSchema.id, id))),
    tx.insert(dataMigrationsSchema).values({ id: linkExerciseIdsDataMigration }),
  ]);
}

import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { writeAtomically } from '@/db/helpers';
import { dataMigrationsSchema, exercisesSchema } from '@/db/schema';
import { fromExerciseDescriptorJSON, musclesOf, toExerciseDescriptorJSON, withMuscles } from '@/models/exercise-models';
import { exerciseDescriptorMigrations } from '@/models/storage/versions/migrations';
import { loadCanonicalBuiltInExercises } from '@/services/exercise-catalog';

export const restoreMuscleRolesDataMigration = 'RESTORE_MUSCLE_ROLES';

/**
 * Exercises stored before primary and secondary muscles were split read back with every muscle primary. A row
 * that overrides a built-in (one the user edited) takes each muscle's role from the catalog again, so an edited
 * Bench Press still counts its triceps as half a set. Muscles the catalog doesn't list stay primary; custom
 * exercises are left alone.
 */
export async function restoreMuscleRoles(db: ExpoSQLiteDatabase) {
  const canonical = await loadCanonicalBuiltInExercises();
  const rows = await db.select().from(exercisesSchema);

  const updates = rows.flatMap((row) => {
    const builtIn = canonical[row.id];
    if (!builtIn) {
      return [];
    }
    const stored = fromExerciseDescriptorJSON(exerciseDescriptorMigrations.migrate(row.payload));
    const { primaryMuscles, secondaryMuscles } = withMuscles(builtIn, musclesOf(stored));
    return [{ id: row.id, payload: toExerciseDescriptorJSON({ ...stored, primaryMuscles, secondaryMuscles }) }];
  });

  await writeAtomically(db, (tx) => [
    ...updates.map(({ id, payload }) => tx.update(exercisesSchema).set({ payload }).where(eq(exercisesSchema.id, id))),
    tx.insert(dataMigrationsSchema).values({ id: restoreMuscleRolesDataMigration }),
  ]);
}

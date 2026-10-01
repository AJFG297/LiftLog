import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { and, eq, sql } from 'drizzle-orm';
import { writeAtomically } from '@/db/helpers';
import { dataMigrationsSchema, workoutExercisesSchema } from '@/db/schema';

export const rekeyProgressionDataMigration = 'REKEY_PROGRESSION_BY_EXERCISE';

const WEIGHTED = '_WeightedExerciseBlueprint';

/**
 * A weighted exercise's `progression_key` used to carry its set count and rep scheme after the exercise:
 * `<exerciseId>_WeightedExerciseBlueprint_3_10`. It is the exercise alone now, so cut every stored key
 * back to `<exerciseId>_WeightedExerciseBlueprint`. Nothing reads the column yet (the store keys carry-over
 * in memory), so this only keeps it true for whatever reads it next. Cardio keys did not change.
 *
 * Safe to run twice: a key already cut back has no `_` after the marker, so it is left alone.
 */
export async function rekeyProgression(db: ExpoSQLiteDatabase) {
  const column = workoutExercisesSchema.progressionKey;
  const marker = sql`instr(${column}, ${`${WEIGHTED}_`})`;
  await writeAtomically(db, (tx) => [
    tx
      .update(workoutExercisesSchema)
      .set({ progressionKey: sql`substr(${column}, 1, ${marker} - 1 + ${WEIGHTED.length})` })
      .where(and(eq(workoutExercisesSchema.kind, 'weighted'), sql`${marker} > 0`)),
    tx.insert(dataMigrationsSchema).values({ id: rekeyProgressionDataMigration }),
  ]);
}

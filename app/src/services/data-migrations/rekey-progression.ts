import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { and, eq, sql } from 'drizzle-orm';
import { Transaction, writeAtomically } from '@/db/helpers';
import { dataMigrationsSchema, workoutExercisesSchema } from '@/db/schema';

export const rekeyProgressionDataMigration = 'REKEY_PROGRESSION_BY_EXERCISE';

const WEIGHTED = '_WeightedExerciseBlueprint';

/**
 * A weighted exercise's `progression_key` used to carry its set count and rep scheme after the exercise:
 * `<exerciseId>_WeightedExerciseBlueprint_3_10`. It is the exercise alone now, so cut every stored key
 * back to `<exerciseId>_WeightedExerciseBlueprint`. Cardio keys did not change. Two exercises of one workout
 * that only differed by set count now share a key, so the `lineage` column is numbered again from the new
 * keys, as `lineageKeys` numbers them.
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
    renumberLineages(tx),
    tx.insert(dataMigrationsSchema).values({ id: rekeyProgressionDataMigration }),
  ]);
}

/**
 * Sets every exercise's `lineage` from its `progression_key`: the key for its first place in the workout,
 * `<key>#n` for the n-th, as `lineageKeys` does on write. Migration 0013 runs the same update.
 */
function renumberLineages(tx: Transaction) {
  return {
    run: () =>
      tx.run(sql`
        update ${workoutExercisesSchema} set lineage = numbered.lineage from (
          select workout_id, position,
            case when row_number() over (partition by workout_id, progression_key order by position) = 1
              then progression_key
              else progression_key || '#' || row_number() over (partition by workout_id, progression_key order by position)
            end as lineage
          from ${workoutExercisesSchema}
        ) as numbered
        where numbered.workout_id = ${workoutExercisesSchema}.workout_id and numbered.position = ${workoutExercisesSchema}.position
      `),
  };
}

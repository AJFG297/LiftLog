import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { dataMigrationsSchema, sessionsSchema } from '@/db/schema';
import { RecordedExerciseJSON, SessionJSON } from '@/models/storage/versions/latest';
import { PreferenceService } from '../preference-service';
import { WeightUnit } from '@/models/weight';
import { sessionMigrations } from '@/models/storage/versions/migrations/session';

export const migrateNilWeightUnitsDataMigration = 'MIGRATE_NIL_WEIGHT_UNITS';

export async function migrateNilWeightUnits(db: ExpoSQLiteDatabase, preferenceService: PreferenceService) {
  const preferredUnit = (await preferenceService.getUseImperialUnits()) ? 'pounds' : 'kilograms';

  await db.transaction(async (tx) => {
    const sessions = await tx.select().from(sessionsSchema);
    for (const row of sessions) {
      const session = sessionMigrations.migrate(row.payload);
      const coalesced = coalesceNilWeights(session, preferredUnit);
      if (coalesced !== session) {
        await tx.update(sessionsSchema).set({ payload: coalesced }).where(eq(sessionsSchema.id, session.id));
      }
    }
    await tx.insert(dataMigrationsSchema).values({ id: migrateNilWeightUnitsDataMigration });
  });
}

/** Gives unit-less weights the user's unit. Returns the same object when there were none. */
export function coalesceNilWeights(session: SessionJSON, preferredUnit: WeightUnit): SessionJSON {
  if (preferredUnit === 'nil') {
    return session;
  }
  let hasNilWeight = false;
  const recordedExercises = session.recordedExercises.map((ex): RecordedExerciseJSON => {
    if (ex.type !== 'RecordedWeightedExercise') {
      return ex;
    }
    return {
      ...ex,
      potentialSets: ex.potentialSets.map((ps) => {
        if (ps.weight.unit !== 'nil') {
          return ps;
        }
        hasNilWeight = true;
        return { ...ps, weight: { unit: preferredUnit, value: ps.weight.value } };
      }),
    };
  });
  return hasNilWeight ? { ...session, recordedExercises } : session;
}

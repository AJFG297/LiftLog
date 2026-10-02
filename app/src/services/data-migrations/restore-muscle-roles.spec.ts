import { describe, it, expect, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { dataMigrationsSchema, exercisesSchema } from '@/db/schema';
import { fromExerciseDescriptorJSON, toExerciseDescriptorJSON } from '@/models/exercise-models';
import { exerciseDescriptorMigrations } from '@/models/storage/versions/migrations';
import { loadCanonicalBuiltInExercises } from '@/services/exercise-catalog';
import { restoreMuscleRoles } from '@/services/data-migrations/restore-muscle-roles';

async function createTestDb(): Promise<ExpoSQLiteDatabase> {
  const db = drizzle(await openDatabaseAsync(':memory:'));
  await new DatabaseMigrationService(db, { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never, {
    importOldData: async () => {},
  }).migrate();
  return db;
}

async function storedMuscles(db: ExpoSQLiteDatabase) {
  const rows = await db.select().from(exercisesSchema);
  return Object.fromEntries(
    rows.map((row) => {
      const { primaryMuscles, secondaryMuscles } = fromExerciseDescriptorJSON(
        exerciseDescriptorMigrations.migrate(row.payload),
      );
      return [row.id, { primaryMuscles, secondaryMuscles }];
    }),
  );
}

describe('restoreMuscleRoles', () => {
  it("gives an edited built-in's muscles their catalog roles again, and leaves custom exercises alone", async () => {
    const db = await createTestDb();
    const canonical = await loadCanonicalBuiltInExercises();
    const [id, builtIn] = Object.entries(canonical).find(([, x]) => x.secondaryMuscles.length > 0)!;
    const { primaryMuscles, secondaryMuscles, ...rest } = builtIn;
    // As written before the split: one joined list, plus a muscle the user added.
    const legacy = { ...rest, muscles: [...primaryMuscles, ...secondaryMuscles, 'neck'], name: 'My bench' };
    await db.insert(exercisesSchema).values([
      { id, payload: legacy as never },
      { id: 'user-uuid', payload: { ...legacy, name: 'Custom' } as never },
    ]);

    await restoreMuscleRoles(db);

    expect(await storedMuscles(db)).toEqual({
      [id]: { primaryMuscles: [...primaryMuscles, 'neck'], secondaryMuscles },
      'user-uuid': { primaryMuscles: [...primaryMuscles, ...secondaryMuscles, 'neck'], secondaryMuscles: [] },
    });
    expect((await db.select().from(dataMigrationsSchema)).map((x) => x.id)).toContain('RESTORE_MUSCLE_ROLES');
  });

  it('writes nothing new for a row already in the current shape', async () => {
    const db = await createTestDb();
    const canonical = await loadCanonicalBuiltInExercises();
    const [id, builtIn] = Object.entries(canonical).find(([, x]) => x.secondaryMuscles.length > 0)!;
    await db.insert(exercisesSchema).values({ id, payload: toExerciseDescriptorJSON(builtIn) });

    await restoreMuscleRoles(db);

    expect((await storedMuscles(db))[id]).toEqual({
      primaryMuscles: builtIn.primaryMuscles,
      secondaryMuscles: builtIn.secondaryMuscles,
    });
  });
});

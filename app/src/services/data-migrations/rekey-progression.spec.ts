import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { eq } from 'drizzle-orm';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { dataMigrationsSchema, workoutExercisesSchema } from '@/db/schema';
import { makeCardioBlueprint, makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { rekeyProgression, rekeyProgressionDataMigration } from '@/services/data-migrations/rekey-progression';

/** A database a build from before PM-34 wrote: weighted keys with their set count and rep scheme. */
async function dbWithOldKeys() {
  const db = drizzle(await openDatabaseAsync(':memory:'));
  await new DatabaseMigrationService(db, { info: vi.fn() } as never, { importOldData: async () => {} }).migrate();
  const exercises = [
    makeWeightedBlueprint({ name: 'Squat', exerciseId: 'Squat', sets: 3, repsConfig: { type: 'fixed', reps: 5 } }),
    makeWeightedBlueprint({
      name: 'Press',
      exerciseId: 'user-1',
      sets: 4,
      repsConfig: { type: 'range', min: 8, max: 12 },
    }),
    makeCardioBlueprint(),
  ];
  await new WorkoutRepository(db).putMany([makeSession(exercises)]);
  const oldKeys = ['Squat_WeightedExerciseBlueprint_3_5', 'user-1_WeightedExerciseBlueprint_4_8-12'];
  for (const [position, progressionKey] of oldKeys.entries()) {
    await db
      .update(workoutExercisesSchema)
      .set({ progressionKey })
      .where(eq(workoutExercisesSchema.position, position));
  }
  return db;
}

const keys = async (db: Awaited<ReturnType<typeof dbWithOldKeys>>) =>
  (await db.select().from(workoutExercisesSchema)).map((row) => row.progressionKey);

describe('rekeyProgression', () => {
  it('cuts a weighted key back to the exercise, the key the app now computes', async () => {
    const db = await dbWithOldKeys();
    const cardioKey = (await keys(db))[2];
    expect((await keys(db)).slice(0, 2)).toEqual([
      'Squat_WeightedExerciseBlueprint_3_5',
      'user-1_WeightedExerciseBlueprint_4_8-12',
    ]);

    await rekeyProgression(db);

    const { workouts } = await new WorkoutRepository(db).loadAll();
    expect(await keys(db)).toEqual(workouts[0]!.recordedExercises.map((exercise) => exercise.progressionKey()));
    expect(await keys(db)).toEqual(['Squat_WeightedExerciseBlueprint', 'user-1_WeightedExerciseBlueprint', cardioKey]);
    expect((await db.select().from(dataMigrationsSchema)).map((x) => x.id)).toContain(rekeyProgressionDataMigration);
  });

  it('numbers the lineages again where two old keys became one', async () => {
    const db = drizzle(await openDatabaseAsync(':memory:'));
    await new DatabaseMigrationService(db, { info: vi.fn() } as never, { importOldData: async () => {} }).migrate();
    const squat = (sets: number) =>
      makeWeightedBlueprint({ name: 'Squat', exerciseId: 'Squat', sets, repsConfig: { type: 'fixed', reps: 5 } });
    await new WorkoutRepository(db).putMany([makeSession([squat(3), squat(5)])]);
    // Stored as two lineages, each the first of its old key.
    for (const [position, progressionKey] of [
      'Squat_WeightedExerciseBlueprint_3_5',
      'Squat_WeightedExerciseBlueprint_5_5',
    ].entries()) {
      await db
        .update(workoutExercisesSchema)
        .set({ progressionKey, lineage: progressionKey })
        .where(eq(workoutExercisesSchema.position, position));
    }

    await rekeyProgression(db);

    const rows = await db.select().from(workoutExercisesSchema);
    expect(rows.map((row) => row.lineage)).toEqual([
      'Squat_WeightedExerciseBlueprint',
      'Squat_WeightedExerciseBlueprint#2',
    ]);
  });

  it('changes nothing the second time', async () => {
    const db = await dbWithOldKeys();
    await rekeyProgression(db);
    const rows = await db.select().from(workoutExercisesSchema);
    await db.delete(dataMigrationsSchema);

    await rekeyProgression(db);

    expect(await db.select().from(workoutExercisesSchema)).toEqual(rows);
  });
});

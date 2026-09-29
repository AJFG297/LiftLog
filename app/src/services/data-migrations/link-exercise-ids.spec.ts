import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { sql } from 'drizzle-orm';
import { LocalDate } from '@js-joda/core';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { dataMigrationsSchema, exercisesSchema, programsSchema, workoutExercisesSchema } from '@/db/schema';
import { toExerciseDescriptorJSON } from '@/models/exercise-models';
import { stubDescriptor } from '@/models/exercise-resolver';
import { movementKeyFor, ProgramBlueprint, SessionBlueprint, stubExerciseId } from '@/models/blueprint-models';
import { programBlueprintMigrations } from '@/models/storage/versions/migrations';
import { makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { linkExerciseIds, linkExerciseIdsDataMigration } from '@/services/data-migrations/link-exercise-ids';

const WEIGHTED = 'WeightedExerciseBlueprint';

/** A database as a build from before exercise ids left it: names only, and name-based key columns. */
async function legacyDb() {
  const db = drizzle(await openDatabaseAsync(':memory:'));
  await new DatabaseMigrationService(db, { info: vi.fn() } as never, { importOldData: async () => {} }).migrate();
  await db
    .insert(exercisesSchema)
    .values({ id: 'user-1', payload: toExerciseDescriptorJSON(stubDescriptor('Hack Squat')) });

  const exercises = ['hack squat', 'Leg Press', 'Tyre Flip Complex'].map((name) => makeWeightedBlueprint({ name }));
  await new WorkoutRepository(db).putMany([makeSession(exercises)]);
  db.run(sql`UPDATE workout SET blueprint_version = 8`);
  db.run(
    sql`UPDATE workout_exercise SET blueprint = json_set(json_remove(blueprint, '$.exerciseId')), movement_key = 'stale', progression_key = 'stale'`,
  );

  const program = new ProgramBlueprint('Plan', [new SessionBlueprint('Day', exercises, '')], LocalDate.of(2026, 1, 1));
  const programJson = program.toJSON();
  programJson.sessions.forEach((session) => session.exercises.forEach((x) => delete x.exerciseId));
  await db.insert(programsSchema).values({
    id: 'plan',
    active: true,
    payload: { ...programJson, sessions: programJson.sessions.map((x) => ({ ...x, version: 8 as never })) },
  });
  return db;
}

describe('linkExerciseIds', () => {
  it('links stored workouts and plans by name and rewrites their key columns', async () => {
    const db = await legacyDb();

    await linkExerciseIds(db);

    const { workouts } = await new WorkoutRepository(db).loadAll();
    const ids = workouts[0]!.recordedExercises.map((x) => x.blueprint.exerciseId);
    expect(ids).toEqual(['user-1', 'Leg Press', stubExerciseId('Tyre Flip Complex')]);
    expect(workouts[0]!.recordedExercises.every((x) => x.blueprint.isLinked)).toBe(true);

    const rows = await db.select().from(workoutExercisesSchema);
    expect(rows.map((x) => x.movementKey)).toEqual(ids.map((id) => movementKeyFor(id, WEIGHTED)));
    expect(rows.map((x) => x.progressionKey)).toEqual(workouts[0]!.recordedExercises.map((x) => x.progressionKey()));

    const [program] = await db.select().from(programsSchema);
    const plan = ProgramBlueprint.fromJSON(programBlueprintMigrations.migrate(program!.payload));
    expect(plan.sessions[0]!.exercises.map((x) => x.exerciseId)).toEqual(ids);

    const exercises = await db.select().from(exercisesSchema);
    expect(exercises.map((x) => x.id).toSorted()).toEqual(['user-1', stubExerciseId('Tyre Flip Complex')].toSorted());
    expect((await db.select().from(dataMigrationsSchema)).map((x) => x.id)).toContain(linkExerciseIdsDataMigration);
  });

  it('changes nothing the second time', async () => {
    const db = await legacyDb();
    await linkExerciseIds(db);
    const rows = await db.select().from(workoutExercisesSchema);
    const exercises = await db.select().from(exercisesSchema);
    await db.delete(dataMigrationsSchema);

    await linkExerciseIds(db);

    expect(await db.select().from(workoutExercisesSchema)).toEqual(rows);
    expect(await db.select().from(exercisesSchema)).toEqual(exercises);
  });
});

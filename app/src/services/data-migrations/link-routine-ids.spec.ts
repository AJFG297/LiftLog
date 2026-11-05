import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { eq } from 'drizzle-orm';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { dataMigrationsSchema, programsSchema, workoutsSchema } from '@/db/schema';
import { ProgramBlueprint, SessionBlueprint } from '@/models/blueprint-models';
import { programBlueprintMigrations } from '@/models/storage/versions/migrations';
import { makeRecordedExercise, makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';
import { linkRoutineIds, linkRoutineIdsDataMigration } from '@/services/data-migrations/link-routine-ids';

/** A database as a build from before routines had ids: a named program and a workout of that name. */
async function legacyDb(names: string[]) {
  const db = drizzle(await openDatabaseAsync(':memory:'));
  await new DatabaseMigrationService(db, { info: vi.fn() } as never, { importOldData: async () => {} }).migrate();
  const date = LocalDate.of(2026, 4, 5);
  const sessions = names.map((name) => {
    const blueprint = makeWeightedBlueprint({ name: 'Squat', sets: 1 });
    const recorded = makeRecordedExercise(blueprint, [5], new Weight(100, 'kilograms'), () =>
      OffsetDateTime.parse(`${date.toString()}T12:00:00Z`),
    );
    return makeSession([blueprint], date).withName(name).withExercise(0, recorded);
  });
  await new WorkoutRepository(db).putMany(sessions);
  const program = new ProgramBlueprint(
    'Plan',
    names.map((name) => new SessionBlueprint(name, [makeWeightedBlueprint({ name: 'Squat' })], '')),
    date,
  );
  const payload = program.toJSON();
  for (const session of payload.sessions) {
    delete session.id;
  }
  await db.insert(programsSchema).values({ id: 'plan', active: true, payload });
  return db;
}

async function planOf(db: Awaited<ReturnType<typeof legacyDb>>) {
  const [row] = await db.select().from(programsSchema);
  return ProgramBlueprint.fromJSON(programBlueprintMigrations.migrate(row!.payload));
}

describe('linkRoutineIds', () => {
  it('stamps a workout onto the one routine of its name, so a rename still finds it', async () => {
    const db = await legacyDb(['Push']);

    await linkRoutineIds(db);

    const plan = await planOf(db);
    const id = plan.sessions[0]?.id;
    if (!id) {
      throw new Error('routine id was not assigned');
    }
    const [workout] = await db.select().from(workoutsSchema).where(eq(workoutsSchema.name, 'Push'));
    expect(workout!.routineId).toBe(id);
    const history = await new WorkoutRepository(db).routineHistory([{ id, name: 'Press' }]);
    expect(history.lastDone.get(id)?.toString()).toBe('2026-04-05');
    expect((await db.select().from(dataMigrationsSchema)).map((x) => x.id)).toContain(linkRoutineIdsDataMigration);
  });

  it('leaves a shared name unstamped', async () => {
    const db = await legacyDb(['Push', 'Push']);

    await linkRoutineIds(db);

    const workouts = await db.select().from(workoutsSchema);
    expect(workouts.map((x) => x.routineId)).toEqual([null, null]);
    const plan = await planOf(db);
    expect(plan.sessions[0]!.id).toEqual(expect.any(String));
    expect(plan.sessions[0]!.id).not.toBe(plan.sessions[1]!.id);
  });

  it('keeps the ids it assigned the second time', async () => {
    const db = await legacyDb(['Push']);
    await linkRoutineIds(db);
    const id = (await planOf(db)).sessions[0]!.id;
    await db.delete(dataMigrationsSchema);

    await linkRoutineIds(db);

    expect((await planOf(db)).sessions[0]!.id).toBe(id);
    const [workout] = await db.select().from(workoutsSchema);
    expect(workout!.routineId).toBe(id);
  });
});

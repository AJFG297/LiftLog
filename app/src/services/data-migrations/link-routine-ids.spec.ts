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

  it('disambiguates built-in routines sharing a name by exercise overlap', async () => {
    const db = drizzle(await openDatabaseAsync(':memory:'));
    await new DatabaseMigrationService(db, { info: vi.fn() } as never, { importOldData: async () => {} }).migrate();
    const date = LocalDate.of(2026, 4, 5);
    const bench = makeWeightedBlueprint({ name: 'Bench Press', sets: 1 });
    const pushups = makeWeightedBlueprint({ name: 'Pushups', sets: 1 });
    const dips = makeWeightedBlueprint({ name: 'Dips', sets: 1 });
    const pplPush = new SessionBlueprint('Push', [bench], '');
    const calPush = new SessionBlueprint('Push', [pushups, dips], '');
    const pplPayload = new ProgramBlueprint('PPL', [pplPush], date).toJSON();
    const calPayload = new ProgramBlueprint('Light Calisthenics', [calPush], date).toJSON();
    delete pplPayload.sessions[0]!.id;
    delete calPayload.sessions[0]!.id;
    await db.insert(programsSchema).values([
      { id: 'ppl', active: true, payload: pplPayload },
      { id: 'cal', active: false, payload: calPayload },
    ]);
    const logged = makeSession([bench], date)
      .withName('Push')
      .withExercise(
        0,
        makeRecordedExercise(bench, [8], new Weight(80, 'kilograms'), () =>
          OffsetDateTime.parse('2026-04-05T12:00:00Z'),
        ),
      );
    const repository = new WorkoutRepository(db);
    await repository.put(logged);

    await linkRoutineIds(db, repository);

    const programs = Object.fromEntries(
      (await db.select().from(programsSchema)).map((row) => [
        row.id,
        ProgramBlueprint.fromJSON(programBlueprintMigrations.migrate(row.payload)),
      ]),
    );
    const pplPushId = programs.ppl!.sessions[0]!.id!;
    const [workout] = await db.select().from(workoutsSchema);
    expect(workout!.routineId).toBe(pplPushId);
    const history = await repository.routineHistory([{ id: pplPushId, name: 'Press' }]);
    expect(history.lastDone.get(pplPushId)?.toString()).toBe('2026-04-05');
  });

  it('breaks identical-exercise ties across programs in favour of the active program', async () => {
    const db = drizzle(await openDatabaseAsync(':memory:'));
    await new DatabaseMigrationService(db, { info: vi.fn() } as never, { importOldData: async () => {} }).migrate();
    const date = LocalDate.of(2026, 4, 5);
    const squat = makeWeightedBlueprint({ name: 'Squat', sets: 1 });
    const ssPayload = new ProgramBlueprint(
      'Starting Strength',
      [new SessionBlueprint('Workout B', [squat], '')],
      date,
    ).toJSON();
    const slPayload = new ProgramBlueprint(
      'Stronglifts 5x5',
      [new SessionBlueprint('Workout B', [squat], '')],
      date,
    ).toJSON();
    delete ssPayload.sessions[0]!.id;
    delete slPayload.sessions[0]!.id;
    await db.insert(programsSchema).values([
      { id: 'ss', active: false, payload: ssPayload },
      { id: 'sl', active: true, payload: slPayload },
    ]);
    const repository = new WorkoutRepository(db);
    await repository.put(makeSession([squat], date).withName('Workout B'));

    await linkRoutineIds(db, repository);

    const slRow = (await db.select().from(programsSchema)).find((row) => row.id === 'sl')!;
    const slRoutineId = ProgramBlueprint.fromJSON(programBlueprintMigrations.migrate(slRow.payload)).sessions[0]!.id!;
    const [workout] = await db.select().from(workoutsSchema);
    expect(workout!.routineId).toBe(slRoutineId);
  });

  it('stamps workouts through WorkoutRepository and notifies listeners without rewriting programs when opted out', async () => {
    const db = await legacyDb(['Push']);
    const [row] = await db.select().from(programsSchema);
    const seeded = ProgramBlueprint.fromJSON(programBlueprintMigrations.migrate(row!.payload)).withSessions([
      new SessionBlueprint('Push', [makeWeightedBlueprint({ name: 'Squat' })], '', undefined, 'push-id'),
    ]);
    await db.update(programsSchema).set({ payload: seeded.toJSON() }).where(eq(programsSchema.id, 'plan'));
    const repository = new WorkoutRepository(db);
    const writes: { workoutIds: readonly string[]; activeChanged: boolean }[] = [];
    const unsubscribe = repository.subscribe((write) => writes.push(write));

    await linkRoutineIds(db, repository, { updatePrograms: false, recordMigration: false });
    unsubscribe();

    const [workout] = await db.select().from(workoutsSchema);
    expect(workout!.routineId).toBe('push-id');
    expect(writes).toEqual([{ workoutIds: [workout!.id], activeChanged: false }]);
    expect(await db.select().from(dataMigrationsSchema)).toEqual([]);
  });
});

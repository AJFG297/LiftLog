import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { sql } from 'drizzle-orm';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { SessionGenerator } from '@/models/storage/generators';
import { CardioExerciseBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { filledPotentialSet, makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { workoutsSchema } from '@/db/schema';

const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

async function createTestDb(): Promise<ExpoSQLiteDatabase> {
  const db = drizzle(await openDatabaseAsync(':memory:'));
  await new DatabaseMigrationService(db, logger as never, { importOldData: async () => {} }).migrate();
  return db;
}

/** A workout with a weighted and a cardio exercise, so every table gets rows. */
function workout(date = LocalDate.of(2026, 4, 10)) {
  const squat = makeWeightedBlueprint({ name: 'Squat' });
  const session = makeSession([squat, CardioExerciseBlueprint.empty().with({ name: 'Row' })], date);
  return session.withExercise(
    0,
    new RecordedWeightedExercise(
      squat,
      [filledPotentialSet(5, OffsetDateTime.parse(`${date.toString()}T09:00:00Z`))],
      undefined,
    ),
  );
}

type RowIds = { table: string; workoutId: string; rowid: number }[];

async function childRowIds(db: ExpoSQLiteDatabase): Promise<RowIds> {
  const rows: RowIds = [];
  for (const table of ['workout_exercise', 'weighted_set', 'cardio_set']) {
    // The drizzle types are expo's synchronous driver; under Vitest it is libsql, which is async.
    const result = await Promise.resolve(
      db.all<{ rowid: number; workout_id: string }>(sql.raw(`SELECT rowid, workout_id FROM ${table} ORDER BY rowid`)),
    );
    rows.push(...result.map((x) => ({ table, workoutId: x.workout_id, rowid: x.rowid })));
  }
  return rows;
}

async function activeIds(db: ExpoSQLiteDatabase) {
  return (await db.select().from(workoutsSchema)).filter((x) => x.active).map((x) => x.id);
}

describe('WorkoutRepository', () => {
  let db: ExpoSQLiteDatabase;
  let repository: WorkoutRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repository = new WorkoutRepository(db);
  });

  it('replaces the session table with the workout tables on a fresh install', async () => {
    const objects = await Promise.resolve(
      db.all<{ type: string; name: string }>(
        sql.raw(`SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'`),
      ),
    );
    const names = objects.map((x) => `${x.type} ${x.name}`);

    expect(names).not.toContain('table session');
    expect(names).toEqual(
      expect.arrayContaining([
        'table workout',
        'table workout_exercise',
        'table weighted_set',
        'table cardio_set',
        'index single_active_workout',
        'index workout_date',
        'index workout_reference_time',
        'index workout_exercise_movement',
        'index workout_exercise_progression',
      ]),
    );
  });

  it('round-trips any session through SQLite', async () => {
    await fc.assert(
      fc.asyncProperty(SessionGenerator, async (session) => {
        await repository.put(session);
        const { workouts } = await repository.loadAll();
        const restored = workouts.find((x) => x.id === session.id);

        expect(restored?.toJSON()).toEqual(session.toJSON());
      }),
      { numRuns: 30 },
    );
  });

  describe('put', () => {
    it('rewrites only that workout, in one transaction', async () => {
      const edited = workout(LocalDate.of(2026, 4, 10));
      const untouched = workout(LocalDate.of(2026, 4, 11));
      await repository.putMany([edited, untouched]);
      const before = await childRowIds(db);
      const transaction = vi.spyOn(db, 'transaction');

      await repository.put(edited.withCycledExerciseReps(0, 0, OffsetDateTime.parse('2026-04-10T09:05:00Z')));

      expect(transaction).toHaveBeenCalledTimes(1);
      const after = await childRowIds(db);
      const of = (rows: RowIds, id: string) => rows.filter((x) => x.workoutId === id);
      // Rows of the other workout keep their rowids, so they were never deleted and reinserted.
      expect(of(after, untouched.id)).toEqual(of(before, untouched.id));
      expect(of(after, edited.id).map((x) => x.table)).toEqual(of(before, edited.id).map((x) => x.table));
      expect(of(after, edited.id).every((x) => !of(before, edited.id).some((y) => y.rowid === x.rowid))).toBe(true);
    });

    it('removes child rows the workout no longer has', async () => {
      const session = workout();
      await repository.put(session);

      await repository.put(session.withRemovedExercise(1).withRemovedExercise(0));

      expect(await childRowIds(db)).toEqual([]);
      const { workouts } = await repository.loadAll();
      expect(workouts[0]!.recordedExercises).toEqual([]);
    });

    it('never claims or clears the active flag', async () => {
      const session = workout();
      await repository.put(session);
      expect(await activeIds(db)).toEqual([]);

      await repository.setActive(session);
      await repository.put(session.withName('Renamed'));

      expect(await activeIds(db)).toEqual([session.id]);
    });
  });

  describe('putMany', () => {
    it('stores restored workouts inactive and leaves a workout in progress alone', async () => {
      const inProgress = workout(LocalDate.of(2026, 4, 10));
      await repository.setActive(inProgress);

      await repository.putMany([inProgress, workout(LocalDate.of(2026, 3, 1))]);

      expect(await activeIds(db)).toEqual([inProgress.id]);
    });

    it('writes more rows than fit in one statement', async () => {
      const sessions = Array.from({ length: 300 }, (_, i) => workout(LocalDate.of(2020, 1, 1).plusDays(i)));

      await repository.putMany(sessions);

      const { workouts } = await repository.loadAll();
      expect(workouts).toHaveLength(300);
      expect(new Set(workouts.map((x) => x.id))).toEqual(new Set(sessions.map((x) => x.id)));
    });
  });

  describe('setActive', () => {
    it('keeps exactly one workout active', async () => {
      const first = workout(LocalDate.of(2026, 4, 10));
      const second = workout(LocalDate.of(2026, 4, 11));

      await repository.setActive(first);
      await repository.setActive(second);

      expect(await activeIds(db)).toEqual([second.id]);
      expect((await repository.loadAll()).activeWorkoutId).toBe(second.id);
    });

    it('writes the workout itself, so it does not depend on a content write landing first', async () => {
      const session = workout();

      await repository.setActive(session);

      const { workouts, activeWorkoutId } = await repository.loadAll();
      expect(activeWorkoutId).toBe(session.id);
      expect(workouts[0]!.toJSON()).toEqual(session.toJSON());
    });

    it('clears the flag when given nothing', async () => {
      await repository.setActive(workout());

      await repository.setActive(undefined);

      expect(await activeIds(db)).toEqual([]);
    });
  });

  it('delete removes only that workout and its rows', async () => {
    const deleted = workout(LocalDate.of(2026, 4, 10));
    const kept = workout(LocalDate.of(2026, 4, 11));
    await repository.putMany([deleted, kept]);

    await repository.delete(deleted.id);

    const { workouts } = await repository.loadAll();
    expect(workouts.map((x) => x.id)).toEqual([kept.id]);
    expect((await childRowIds(db)).every((x) => x.workoutId === kept.id)).toBe(true);
  });

  it('keeps every workout id', async () => {
    const sessions: Session[] = [workout(), Session.freeformSession(LocalDate.of(2026, 4, 12), undefined)];

    await repository.putMany(sessions);

    expect((await repository.loadAll()).workouts.map((x) => x.id).toSorted()).toEqual(
      sessions.map((x) => x.id).toSorted(),
    );
  });
});

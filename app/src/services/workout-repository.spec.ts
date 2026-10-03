import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { LocalDate, OffsetDateTime, ZoneOffset } from '@js-joda/core';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { sql } from 'drizzle-orm';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { SessionGenerator } from '@/models/storage/generators';
import { CardioExerciseBlueprint, movementKeyFor, SessionBlueprint, stubExerciseId } from '@/models/blueprint-models';

import { FREEFORM_WORKOUT_NAME, RecordedExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import {
  emptyPotentialSet,
  filledPotentialSet,
  makeRecordedExercise,
  makeSession,
  makeWeightedBlueprint,
} from '@/models/session-models/__test__/helpers';
import { workoutsSchema } from '@/db/schema';
import { Weight } from '@/models/weight';
import { TemporalComparer } from '@/models/comparers';
import { getSessionReferenceTime } from '@/store/stored-sessions';
import { findPersonalRecords, RecordLedger, SessionRecord, sessionRecords } from '@/store/stats/personal-records';
import { oneRepMaxOf } from '@/store/stats/calculate-stats';
import { volumeScaleOf } from '@/store/activity/volume';

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

  describe('reads', () => {
    /** A finished workout of one exercise: `reps` logged at `kg`, the last at `time` on `date`. */
    function lifted(
      name: string,
      date: LocalDate,
      { kg = 100, reps = [5, 5, 5] as (number | undefined)[], exercise = 'Squat', time = '12:00' } = {},
    ): Session {
      const blueprint = makeWeightedBlueprint({ name: exercise, sets: reps.length });
      const last = OffsetDateTime.parse(`${date.toString()}T${time}:00Z`);
      const recorded = makeRecordedExercise(blueprint, reps, new Weight(kg, 'kilograms'), (index) =>
        last.minusMinutes((reps.length - 1 - index) * 3),
      );
      return makeSession([blueprint], date).withName(name).withExercise(0, recorded);
    }

    const april = (day: number) => LocalDate.of(2026, 4, day);

    describe('finishedBetween', () => {
      it('covers both ends of the range, latest first', async () => {
        const first = lifted('A', april(1));
        const morning = lifted('B', april(10), { time: '08:00' });
        const evening = lifted('C', april(10), { time: '19:00' });
        const last = lifted('D', april(30));
        await repository.putMany([
          lifted('Before', LocalDate.of(2026, 3, 31)),
          first,
          morning,
          evening,
          last,
          lifted('After', LocalDate.of(2026, 5, 1)),
        ]);

        const inApril = await repository.finishedBetween(april(1), april(30));

        expect(inApril.map((x) => x.blueprint.name)).toEqual(['D', 'C', 'B', 'A']);
        expect(inApril.map((x) => x.toJSON())).toEqual([last, evening, morning, first].map((x) => x.toJSON()));
      });

      it('leaves out the workout in progress', async () => {
        const done = lifted('Done', april(10));
        const running = lifted('Running', april(10));
        await repository.put(done);
        await repository.setActive(running);

        expect((await repository.finishedBetween(april(10), april(10))).map((x) => x.id)).toEqual([done.id]);
      });
    });

    it('latestNamed finds the last few started workouts of that name, latest first', async () => {
      const sessions = [1, 2, 3, 4].map((day) => lifted('Push', april(day)));
      const neverStarted = lifted('Push', april(5), { reps: [undefined, undefined] });
      await repository.putMany([...sessions, lifted('Pull', april(6)), neverStarted]);

      const latest = await repository.latestNamed('Push', 3);

      expect(latest.map((x) => x.date.toString())).toEqual(['2026-04-04', '2026-04-03', '2026-04-02']);
    });

    describe('latestNamed before a workout', () => {
      it('finds the previous comparable workout: the newest earlier one of the name, logged or not', async () => {
        const first = lifted('Push', april(1));
        const empty = lifted('Push', april(3), { reps: [undefined, undefined] });
        const sameSecond = lifted('Push', april(5), { time: '12:00' });
        const viewed = lifted('Push', april(5), { time: '12:00' });
        const later = lifted('Push', april(9));
        await repository.putMany([first, empty, sameSecond, viewed, later, lifted('Pull', april(4))]);

        const comparable = (session: Session, includeUnstarted: boolean) =>
          repository.latestNamed('Push', 5, { before: session, includeUnstarted }).then((x) => x.map((y) => y.id));

        // Done in the same second as the viewed one, so not before it, as the selectors compared them.
        expect(await comparable(viewed, true)).toEqual([empty.id, first.id]);
        expect(await comparable(viewed, false)).toEqual([first.id]);
        // The two of one second order by id, which only has to be stable.
        expect(await comparable(later, true)).toEqual([
          ...[viewed.id, sameSecond.id].sort((a, b) => a.localeCompare(b)),
          empty.id,
          first.id,
        ]);
        expect(await comparable(first, true)).toEqual([]);
      });
    });

    describe('latestPlanned', () => {
      it('is the most recent finished workout that was not freeform', async () => {
        const planned = lifted('Legs', april(1));
        const freeform = lifted(FREEFORM_WORKOUT_NAME, april(8));
        await repository.putMany([planned, freeform]);
        await repository.setActive(lifted('Push', april(9)));

        expect((await repository.latestPlanned())?.id).toBe(planned.id);
      });

      it('is undefined with only freeform workouts', async () => {
        await repository.put(lifted(FREEFORM_WORKOUT_NAME, april(8)));

        expect(await repository.latestPlanned()).toBeUndefined();
      });
    });

    describe('latestPerLineage', () => {
      const squat = makeWeightedBlueprint({ name: 'Squat', sets: 1 });
      const key = squat.progressionKey();
      /** Squats twice in one workout, a heavy single then back-offs, logged at `hour` and `hour` + 1. */
      function twice(id: string, day: number, kg: number) {
        const at = (hour: number) => OffsetDateTime.of(2026, 4, day, hour, 0, 0, 0, ZoneOffset.UTC);
        return new Session(
          id,
          new SessionBlueprint('Legs', [squat, squat], ''),
          [
            makeRecordedExercise(squat, [1], new Weight(kg, 'kilograms'), () => at(9)),
            makeRecordedExercise(squat, [5], new Weight(kg - 20, 'kilograms'), () => at(10)),
          ],
          april(day),
          undefined,
          undefined,
        );
      }

      it('keeps each place of a repeated exercise as its own lineage, the workout in progress included', async () => {
        const earlier = twice('earlier', 1, 100);
        const latest = twice('latest', 8, 105);
        await repository.putMany([earlier, lifted('Other', april(4), { exercise: 'Bench' })]);
        await repository.setActive(latest);

        const latestPerLineage = await repository.latestPerLineage();

        expect(Object.keys(latestPerLineage).sort()).toEqual(
          [key, `${key}#2`, makeWeightedBlueprint({ name: 'Bench' }).progressionKey()].sort(),
        );
        const described = Object.fromEntries(
          Object.entries(latestPerLineage).map(([lineage, x]) => [lineage, [x.workoutId, x.exercise.toJSON()]]),
        );
        expect(described[key]).toEqual(['latest', latest.recordedExercises[0]!.toJSON()]);
        expect(described[`${key}#2`]).toEqual(['latest', latest.recordedExercises[1]!.toJSON()]);
      });

      it('numbers a repeat by its place among every exercise, logged or not', async () => {
        const session = twice('skipped-single', 1, 100);
        const unloggedSingle = session.with({
          recordedExercises: [
            (session.recordedExercises[0] as RecordedWeightedExercise).with({ potentialSets: [emptyPotentialSet(1)] }),
            session.recordedExercises[1]!,
          ],
        });
        await repository.put(unloggedSingle);

        const latestPerLineage = await repository.latestPerLineage();

        expect(Object.keys(latestPerLineage)).toEqual([`${key}#2`]);
      });

      it('can leave a workout out and limit itself to some keys', async () => {
        const earlier = twice('earlier', 1, 100);
        const latest = twice('latest', 8, 105);
        await repository.putMany([earlier, latest, lifted('Other', april(4), { exercise: 'Bench' })]);

        const before = await repository.latestPerLineage({ progressionKeys: [key], excludeWorkoutId: 'latest' });

        expect(Object.keys(before).sort()).toEqual([key, `${key}#2`]);
        expect(before[key]?.workoutId).toBe('earlier');
        expect(await repository.latestPerLineage({ progressionKeys: [] })).toEqual({});
      });

      it('leaves out an exercise with nothing logged, however recent', async () => {
        const logged = lifted('Legs', april(1));
        const abandoned = lifted('Legs', april(8), { reps: [undefined] });
        await repository.putMany([logged, abandoned]);

        const latestPerLineage = await repository.latestPerLineage();

        expect(latestPerLineage[key]?.workoutId).toBe(logged.id);
      });
    });

    describe('previousPerformances', () => {
      const movement = makeWeightedBlueprint({ name: 'Squat' }).movementKey();

      it('lists the finished, logged performances of each movement newest first, up to the limit', async () => {
        const days = [1, 3, 5, 7];
        await repository.putMany([
          ...days.map((day) => lifted('Legs', april(day), { kg: 100 + day })),
          lifted('Legs', april(9), { reps: [undefined] }),
          lifted('Pull', april(2), { exercise: 'Deadlift' }),
        ]);
        await repository.setActive(lifted('Legs', april(11), { kg: 200 }));

        const all = await repository.previousPerformances([movement]);
        const limited = await repository.previousPerformances([movement], { limit: 2 });

        const kgs = (list: RecordedExercise[] | undefined) =>
          list?.map((x) => (x as RecordedWeightedExercise).potentialSets[0]!.weight.value.toNumber());
        expect(kgs(all.get(movement))).toEqual([107, 105, 103, 101]);
        expect(kgs(limited.get(movement))).toEqual([107, 105]);
        expect(all.has(makeWeightedBlueprint({ name: 'Deadlift' }).movementKey())).toBe(false);
      });

      it('leaves out the workout being viewed, which is not its own previous', async () => {
        const earlier = lifted('Legs', april(1));
        const viewed = lifted('Legs', april(8));
        await repository.putMany([earlier, viewed]);

        const previous = await repository.previousPerformances([movement], { excludeWorkoutId: viewed.id });

        expect(previous.get(movement)?.map((x) => x.toJSON())).toEqual([earlier.recordedExercises[0]!.toJSON()]);
        expect(await repository.previousPerformances([])).toEqual(new Map());
      });
    });

    describe('bestsBefore', () => {
      it("is each movement's best estimated 1RM and heaviest set from the workouts before", async () => {
        const light = lifted('Legs', april(1), { kg: 100, reps: [8] });
        const heavy = lifted('Legs', april(8), { kg: 120, reps: [1] });
        const today = lifted('Legs', april(15), { kg: 110, reps: [5] });
        await repository.putMany([light, heavy, today, lifted('Legs', april(22), { kg: 200, reps: [5] })]);

        const bests = await repository.bestsBefore(today);

        expect([...bests.keys()]).toEqual([movementKeyFor(stubExerciseId('Squat'), 'WeightedExerciseBlueprint')]);
        const best = bests.get(movementKeyFor(stubExerciseId('Squat'), 'WeightedExerciseBlueprint'))!;
        // Epley: 100 x 8 = 126.7 beats 120 x 1 = 124.
        expect(best.oneRepMax).toEqual(oneRepMaxOf(new Weight(100, 'kilograms'), 8));
        expect(best.heaviest).toEqual(new Weight(120, 'kilograms'));
      });

      it('gives the same records as a ledger over the earlier workouts, for any history', async () => {
        await fc.assert(
          fc.asyncProperty(fc.array(SessionGenerator, { maxLength: 8 }), async (sessions) => {
            const db = await createTestDb();
            const repository = new WorkoutRepository(db);
            await repository.putMany(sessions);
            const oldestFirst = [...sessions].sort(
              (a, b) =>
                TemporalComparer(getSessionReferenceTime(a), getSessionReferenceTime(b)) || a.id.localeCompare(b.id),
            );
            const describe = (records: SessionRecord[]) =>
              records.map((x) => `${x.kind} ${x.key} ${x.previous.convertTo('kilograms').value.toFixed(6)}`).sort();

            const ledger = new RecordLedger();
            for (const session of oldestFirst) {
              const expected = sessionRecords(session, ledger.bests);
              const fromRows = sessionRecords(session, await repository.bestsBefore(session));
              expect(describe(fromRows)).toEqual(describe(expected));
              ledger.add(session);
            }
          }),
          { numRuns: 25 },
        );
      });
    });

    describe('earliestDate', () => {
      it('is the first finished workout, started or not', async () => {
        await repository.putMany([lifted('A', april(10)), lifted('Empty', april(3), { reps: [undefined] })]);
        await repository.setActive(lifted('Running', april(1)));

        expect((await repository.earliestDate())?.toString()).toBe('2026-04-03');
      });

      it('is undefined without any history', async () => {
        expect(await repository.earliestDate()).toBeUndefined();
      });
    });

    it('dailyActivity counts and sums the started workouts of each day', async () => {
      await repository.putMany([
        lifted('A', april(10), { kg: 100, reps: [10], time: '08:00' }),
        lifted('B', april(10), { kg: 50, reps: [10], time: '19:00' }),
        lifted('C', april(12), { kg: 80, reps: [10] }),
        lifted('Opened', april(11), { reps: [undefined, undefined] }),
      ]);
      await repository.setActive(lifted('Running', april(13), { kg: 60, reps: [10] }));

      expect((await repository.dailyActivity()).map((x) => `${x.date.toString()} ${x.workouts} ${x.volumeKg}`)).toEqual(
        ['2026-04-10 2 1500', '2026-04-12 1 800'],
      );
    });

    it('volumeScale grades against the started workouts, as the calendar always has', async () => {
      const volumes = [10, 20, 30, 40, 50];
      await repository.putMany(volumes.map((kg, index) => lifted(`W${index}`, april(index + 1), { kg, reps: [1] })));
      await repository.put(lifted('Opened', april(20), { reps: [undefined] }));

      expect(await repository.volumeScale()).toEqual(volumeScaleOf(volumes));
    });

    it('volumeScale is undefined without any started workout', async () => {
      await repository.put(lifted('Opened', april(20), { reps: [undefined] }));

      expect(await repository.volumeScale()).toBeUndefined();
    });

    describe('personalRecords', () => {
      it('is a record only when a movement beats its own earlier best', async () => {
        const first = lifted('Legs', april(1), { kg: 100, reps: [5] });
        const better = lifted('Legs', april(8), { kg: 100, reps: [6] });
        const worse = lifted('Legs', april(15), { kg: 90, reps: [5] });
        const otherExercise = lifted('Pull', april(22), { kg: 200, reps: [5], exercise: 'Deadlift' });
        await repository.putMany([first, better, worse, otherExercise]);

        const records = await repository.personalRecords();

        expect([...records.keys()]).toEqual([better.id]);
        expect(records.get(better.id)).toEqual([{ exerciseName: 'Squat', oneRepMax: new Weight(120, 'kilograms') }]);
      });

      it('finds the same records as the whole-history walk, for any history', async () => {
        await fc.assert(
          fc.asyncProperty(fc.array(SessionGenerator, { maxLength: 12 }), async (sessions) => {
            const db = await createTestDb();
            const repository = new WorkoutRepository(db);
            await repository.putMany(sessions);
            const oldestFirst = [...sessions].sort(
              (a, b) =>
                TemporalComparer(getSessionReferenceTime(a), getSessionReferenceTime(b)) || a.id.localeCompare(b.id),
            );
            const describe = (records: Map<string, { exerciseName: string; oneRepMax: Weight }[]>) =>
              Object.fromEntries(
                [...records].map(([id, list]) => [
                  id,
                  list.map((x) => `${x.exerciseName} ${x.oneRepMax.value.toString()}${x.oneRepMax.unit}`),
                ]),
              );

            expect(describe(await repository.personalRecords())).toEqual(describe(findPersonalRecords(oldestFirst)));
          }),
          { numRuns: 25 },
        );
      });
    });

    describe('subscribe', () => {
      it('tells listeners after each kind of write has landed, and what it touched', async () => {
        const seen: number[] = [];
        const writes: unknown[] = [];
        repository.subscribe((write) => {
          writes.push(write);
          void repository.loadAll().then(({ workouts }) => seen.push(workouts.length));
        });
        const a = lifted('A', april(1));
        const b = lifted('B', april(2));
        const c = lifted('C', april(3));

        await repository.put(a);
        await repository.putMany([b]);
        await repository.setActive(c);
        await repository.delete(a.id);
        await repository.setActive(undefined);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(seen).toEqual([1, 2, 3, 2, 2]);
        expect(writes).toEqual([
          { workoutIds: [a.id], activeChanged: false },
          { workoutIds: [b.id], activeChanged: false },
          { workoutIds: [c.id], activeChanged: true },
          { workoutIds: [a.id], activeChanged: false },
          { workoutIds: [], activeChanged: true },
        ]);
      });

      it('stops once unsubscribed', async () => {
        const listener = vi.fn();
        const unsubscribe = repository.subscribe(listener);
        await repository.put(lifted('A', april(1)));
        unsubscribe();
        await repository.put(lifted('B', april(2)));

        expect(listener).toHaveBeenCalledTimes(1);
      });
    });
  });
});

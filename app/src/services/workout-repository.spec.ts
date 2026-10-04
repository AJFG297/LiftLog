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
import {
  CardioExerciseBlueprint,
  lineageKeys,
  movementKeyFor,
  progressionKeyOf,
  SessionBlueprint,
  stubExerciseId,
} from '@/models/blueprint-models';

import { FREEFORM_WORKOUT_NAME, RecordedExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import {
  emptyPotentialSet,
  filledPotentialSet,
  makeRecordedExercise,
  makeSession,
  makeWeightedBlueprint,
} from '@/models/session-models/__test__/helpers';
import {
  cardioSetsSchema,
  warmupSetsSchema,
  weightedSetsSchema,
  workoutExercisesSchema,
  workoutsSchema,
} from '@/db/schema';
import { Weight } from '@/models/weight';
import { TemporalComparer } from '@/models/comparers';
import { getSessionReferenceTime } from '@/store/stored-sessions';
import { findPersonalRecords, RecordLedger, SessionRecord, sessionRecords } from '@/store/stats/personal-records';
import { oneRepMaxOf } from '@/store/stats/calculate-stats';
import { volumeScaleOf } from '@/store/activity/volume';
import { generateSyntheticHistory } from '@/utils/__test__/synthetic-history';
import { mapSessionExercises } from '@/models/exercise-resolver';

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

      it('sees a write issued before it, awaited or not', async () => {
        const planned = lifted('Legs', april(1));
        void repository.put(planned);

        expect((await repository.latestPlanned())?.id).toBe(planned.id);
      });

      it('is undefined with only freeform workouts', async () => {
        await repository.put(lifted(FREEFORM_WORKOUT_NAME, april(8)));

        expect(await repository.latestPlanned()).toBeUndefined();
      });
    });

    describe('active', () => {
      it('is the workout in progress, read whole', async () => {
        const running = lifted('Running', april(2));
        await repository.putMany([lifted('Done', april(1)), lifted('Other', april(3))]);
        await repository.setActive(running);

        expect((await repository.active())?.toJSON()).toEqual(running.toJSON());
      });

      it('is undefined with no workout in progress', async () => {
        await repository.put(lifted('Done', april(1)));

        expect(await repository.active()).toBeUndefined();
      });
    });

    describe('get', () => {
      it('reads one workout by id, finished or in progress', async () => {
        const done = lifted('Done', april(1));
        const running = lifted('Running', april(2));
        await repository.putMany([done, lifted('Other', april(3))]);
        await repository.setActive(running);

        expect((await repository.get(done.id))?.toJSON()).toEqual(done.toJSON());
        expect((await repository.get(running.id))?.toJSON()).toEqual(running.toJSON());
        expect(await repository.get('missing')).toBeUndefined();
      });

      it('sees a write issued before it, awaited or not', async () => {
        const done = lifted('Done', april(1));
        void repository.put(done);

        expect((await repository.get(done.id))?.blueprint.name).toBe('Done');
      });
    });

    describe('routineHistory', () => {
      /** A workout with only a warm-up logged. */
      function warmedUp(name: string, date: LocalDate): Session {
        const blueprint = makeWeightedBlueprint({ name: 'Squat', sets: 1 });
        const recorded = new RecordedWeightedExercise(blueprint, [emptyPotentialSet()], undefined).with({
          warmupSets: [filledPotentialSet(5, OffsetDateTime.parse(`${date.toString()}T09:00:00Z`))],
        });
        return makeSession([blueprint], date).withName(name).withExercise(0, recorded);
      }

      it('counts the logged workouts of each routine, by name, with the last day each was done', async () => {
        await repository.putMany([
          lifted('Push', april(1)),
          lifted('Pull', april(2)),
          lifted('Push', april(5)),
          warmedUp('Legs', april(6)),
          lifted('Legs', april(7), { reps: [undefined] }),
          lifted(FREEFORM_WORKOUT_NAME, april(8)),
          lifted('Arms', april(9)),
        ]);
        await repository.setActive(lifted('Pull', april(10)));

        const history = await repository.routineHistory(['Push', 'Pull', 'Legs', FREEFORM_WORKOUT_NAME]);

        expect(history.workoutsDone).toBe(4);
        expect([...history.lastDone].map(([name, date]) => `${name} ${date.toString()}`).sort()).toEqual([
          'Legs 2026-04-06',
          'Pull 2026-04-02',
          'Push 2026-04-05',
        ]);
        // Push, Pull, Push, Legs: three of the four done this round (the freeform name never counts).
        expect(history.routinesDoneThisRound).toBe(3);
      });

      it('walks the round in the order the workouts were done, by day and then by time', async () => {
        await repository.putMany([
          lifted('A', april(3), { time: '19:00' }),
          lifted('B', april(3), { time: '08:00' }),
          lifted('A', april(2), { time: '23:00' }),
        ]);

        // A, B closes a round, then A starts the next. By day alone, in the order stored, it would read
        // A, A, B and close the round on B.
        expect((await repository.routineHistory(['A', 'B'])).routinesDoneThisRound).toBe(1);
        await repository.put(lifted('B', april(4)));
        expect((await repository.routineHistory(['A', 'B'])).routinesDoneThisRound).toBe(0);
      });

      it('is empty for no routines', async () => {
        await repository.put(lifted('Push', april(1)));

        expect(await repository.routineHistory([])).toEqual({
          lastDone: new Map(),
          workoutsDone: 0,
          routinesDoneThisRound: 0,
        });
      });
    });

    describe('inExportOrder', () => {
      async function exported(batchSize: number) {
        const batches: string[][] = [];
        for await (const batch of repository.inExportOrder(batchSize)) {
          batches.push(batch.map((x) => x.blueprint.name));
        }
        return batches;
      }

      it('is every workout, the one in progress included, latest first, in batches', async () => {
        await repository.putMany([
          lifted('A', april(1)),
          lifted('C', april(10), { time: '19:00' }),
          lifted('B', april(10), { time: '08:00' }),
          lifted('E', april(30)),
        ]);
        await repository.setActive(lifted('Running', april(20)));

        expect(await exported(2)).toEqual([['E', 'Running'], ['C', 'B'], ['A']]);
        expect(await exported(100)).toEqual([['E', 'Running', 'C', 'B', 'A']]);
      });

      it('keeps the order workouts were first stored in when their times tie', async () => {
        await repository.putMany(['First', 'Second', 'Third'].map((name) => lifted(name, april(1))));
        // A rewrite keeps the row where it was.
        await repository.put(lifted('First', april(1)).with({ id: (await repository.latestNamed('First', 1))[0]!.id }));

        expect(await exported(1)).toEqual([['First'], ['Second'], ['Third']]);
      });

      it('rebuilds each workout as stored', async () => {
        const session = lifted('A', april(1));
        await repository.put(session);

        const read: Session[] = [];
        for await (const batch of repository.inExportOrder(10)) {
          read.push(...batch);
        }

        expect(read.map((x) => x.toJSON())).toEqual([session.toJSON()]);
      });

      it('yields nothing without any workout', async () => {
        expect(await exported(10)).toEqual([]);
      });
    });

    describe('existingIds', () => {
      it('is the ids asked about that are stored, the workout in progress included', async () => {
        const done = lifted('Done', april(1)).with({ id: 'done' });
        await repository.put(done);
        await repository.setActive(lifted('Running', april(2)).with({ id: 'running' }));

        expect([...(await repository.existingIds(['done', 'running', 'new']))].sort()).toEqual(['done', 'running']);
        expect(await repository.existingIds([])).toEqual(new Set());
      });

      it('asks about more ids than fit in one statement', async () => {
        await repository.put(lifted('Done', april(1)).with({ id: 'id-1500' }));
        const ids = Array.from({ length: 2000 }, (_, index) => `id-${index}`);

        expect([...(await repository.existingIds(ids))]).toEqual(['id-1500']);
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

      it('breaks a tie of the same instant by the workout that went on later, then by id', async () => {
        const bench = makeWeightedBlueprint({ name: 'Bench', sets: 1 });
        const at = (hour: number) => OffsetDateTime.of(2026, 4, 1, hour, 0, 0, 0, ZoneOffset.UTC);
        const squatsAtNine = (id: string, benchHour?: number) =>
          new Session(
            id,
            new SessionBlueprint('Legs', [squat, bench], ''),
            [
              makeRecordedExercise(squat, [5], new Weight(100, 'kilograms'), () => at(9)),
              makeRecordedExercise(bench, [benchHour === undefined ? undefined : 5], new Weight(60, 'kilograms'), () =>
                at(benchHour ?? 9),
              ),
            ],
            april(1),
            undefined,
            undefined,
          );
        await repository.putMany([squatsAtNine('a'), squatsAtNine('c', 11), squatsAtNine('b', 11)]);

        expect((await repository.latestPerLineage())[key]?.workoutId).toBe('b');
      });

      it('agrees with a walk over every workout, for any history', async () => {
        /** Each lineage's latest place: by its time, then the workout's reference time, then workout id. */
        function walked(sessions: Session[], excludeWorkoutId?: string) {
          const best = new Map<string, { at: number; reference: number; session: Session; position: number }>();
          for (const session of sessions.filter((x) => x.id !== excludeWorkoutId)) {
            const reference = getSessionReferenceTime(session).toInstant().toEpochMilli();
            lineageKeys(session.recordedExercises).forEach((lineage, position) => {
              const at = session.recordedExercises[position]!.latestTime?.toInstant().toEpochMilli();
              const current = best.get(lineage);
              const later =
                !current ||
                (at ?? -Infinity) > current.at ||
                (at === current.at &&
                  (reference > current.reference ||
                    (reference === current.reference && session.id < current.session.id)));
              if (at !== undefined && later) {
                best.set(lineage, { at, reference, session, position });
              }
            });
          }
          return Object.fromEntries(
            [...best].map(([lineage, x]) => [
              lineage,
              [x.session.id, x.session.recordedExercises[x.position]!.toJSON()],
            ]),
          );
        }
        const read = async (options?: Parameters<WorkoutRepository['latestPerLineage']>[0]) =>
          Object.fromEntries(
            Object.entries(await repository.latestPerLineage(options)).map(([lineage, x]) => [
              lineage,
              [x.workoutId, x.exercise.toJSON()],
            ]),
          );

        await fc.assert(
          fc.asyncProperty(fc.array(SessionGenerator, { minLength: 1, maxLength: 8 }), async (generated) => {
            const sessions = generated.map((session, index) => session.with({ id: `w${index}` }));
            repository = new WorkoutRepository(await createTestDb());
            await repository.putMany(sessions);

            expect(await read()).toEqual(walked(sessions));
            expect(await read({ excludeWorkoutId: 'w0' })).toEqual(walked(sessions, 'w0'));
            const keys = [...new Set(sessions[0]!.recordedExercises.map((x) => x.progressionKey()))];
            const ofKeys = Object.fromEntries(
              Object.entries(walked(sessions)).filter(([lineage]) => keys.includes(progressionKeyOf(lineage as never))),
            );
            expect(await read({ progressionKeys: keys })).toEqual(ofKeys);
          }),
          { numRuns: 30 },
        );
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

    it('startedWorkouts counts the finished, started workouts and the date of the first', async () => {
      expect(await repository.startedWorkouts()).toEqual({ count: 0, firstDate: undefined });

      await repository.putMany([
        lifted('Opened', april(1), { reps: [undefined] }),
        lifted('A', april(2)),
        lifted('B', april(3)),
      ]);
      await repository.setActive(lifted('Running', april(1)));

      // Neither the opened-only workout nor the one in progress counts, for the count or the date.
      expect(await repository.startedWorkouts()).toEqual({ count: 2, firstDate: april(2) });
    });

    it('exerciseUsage counts the workouts logging each exercise, of either kind, and dates the first', async () => {
      const first = workout(april(10));
      const second = workout(april(12));
      await repository.putMany([first, second, lifted('A', april(11), { time: '12:00' })]);
      await repository.setActive(lifted('Running', april(13), { exercise: 'Bench Press' }));

      expect(await repository.exerciseUsage()).toEqual({
        [stubExerciseId('Squat')]: { workouts: 3, firstReferenceTimeMs: Date.parse('2026-04-10T09:00:00Z') },
        [stubExerciseId('Row')]: { workouts: 2, firstReferenceTimeMs: Date.parse('2026-04-10T09:00:00Z') },
        [stubExerciseId('Bench Press')]: { workouts: 1, firstReferenceTimeMs: Date.parse('2026-04-13T12:00:00Z') },
      });
      expect((await repository.workoutIdsLogging([stubExerciseId('Row'), 'nothing'])).sort()).toEqual(
        [first.id, second.id].sort(),
      );
    });

    it('repointExercises writes the rows putMany writes for the repointed workouts', async () => {
      const history = generateSyntheticHistory({ count: 400 });
      const survivorOf = new Map([
        [stubExerciseId('Bench Press'), 'bench-press'],
        // Into an exercise the same workouts log, so they get a repeat.
        [stubExerciseId('Leg Press'), stubExerciseId('Squat')],
        [stubExerciseId('Leg Curl'), stubExerciseId('Front Squat')],
        [stubExerciseId('Rower'), 'rower'],
        [stubExerciseId('Treadmill'), 'rower'],
      ]);
      const viaSql = await createTestDb();
      await new WorkoutRepository(viaSql).putMany(history);
      const viaPutMany = await createTestDb();
      await new WorkoutRepository(viaPutMany).putMany(history);

      await new WorkoutRepository(viaSql).repointExercises(survivorOf);
      await new WorkoutRepository(viaPutMany).putMany(
        history.map((session) =>
          mapSessionExercises(session, (blueprint) => {
            const to = survivorOf.get(blueprint.exerciseId);
            return to ? (blueprint.with({ exerciseId: to }) as typeof blueprint) : blueprint;
          }),
        ),
      );

      // The stored text of every column, unparsed, so the blueprint JSON that `json_set` writes is compared
      // byte for byte with the one `putMany` serialises.
      const rows = async (db: ExpoSQLiteDatabase) => {
        const sorted = async (table: unknown) =>
          (await Promise.resolve(db.all<unknown>(sql`select * from ${table}`)))
            .map((row) => JSON.stringify(row))
            .sort();
        return {
          workout: await sorted(workoutsSchema),
          workoutExercise: await sorted(workoutExercisesSchema),
          weightedSet: await sorted(weightedSetsSchema),
          warmupSet: await sorted(warmupSetsSchema),
          cardioSet: await sorted(cardioSetsSchema),
        };
      };
      const repointed = await rows(viaSql);
      expect(repointed).toEqual(await rows(viaPutMany));
      expect(repointed.workoutExercise[0]).toContain('"blueprint":"{');
      expect(repointed.workoutExercise.some((row) => row.includes('#2'))).toBe(true);
      expect(repointed.workoutExercise.some((row) => row.includes('rower|CardioExerciseBlueprint'))).toBe(true);
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

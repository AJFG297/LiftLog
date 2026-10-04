import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { LocalDate, OffsetDateTime, ZoneOffset } from '@js-joda/core';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { SessionService } from '@/services/session-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { ProgressionKey, SessionBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { Weight } from '@/models/weight';
import {
  emptyPotentialSet,
  makeRecordedExercise,
  makeWeightedBlueprint,
} from '@/models/session-models/__test__/helpers';
import { createEffectStore } from '@/utils/__test__/effect-store';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import { applyStatsEffects } from '@/store/stats/effects';
import {
  deleteStoredSession,
  initializeStoredSessionsStateSlice,
  putStoredSession,
  selectLatestExercises,
  sessionFinished,
  setActiveSessionId,
  updateStoredSession,
  upsertStoredSessions,
  openSessionForEditing,
  openSessionForSummary,
} from '@/store/stored-sessions';
import type { RootState } from '@/store/store';
import type { UnknownAction } from '@reduxjs/toolkit';
import { fetchOverallStats } from '@/store/stats';
import { oneRepMaxOf } from '@/store/stats/calculate-stats';
import { setIsHydrated as setSettingsIsHydrated } from '@/store/settings';

/**
 * What the History list, the calendar, the PR badges and Stats read now comes from the workout tables
 * (PM-13), so an edit or a delete of a past workout shows everywhere after the write lands, with no
 * restart: the queries answer from the rows, and `WorkoutRepository.subscribe` tells the screens to ask
 * again.
 */
vi.stubEnv('TZ', 'UTC');

const TODAY = LocalDate.of(2026, 6, 3);

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  time: async (_: string, action: () => unknown) => action(),
};

const squat = makeWeightedBlueprint({ name: 'Squat', exerciseId: 'Squat', sets: 3 });

/** Three Mondays of squats in March 2026: 100, 102.5 then 105 kg for 3x10. */
function history(): Session[] {
  return [0, 1, 2].map((week) => {
    const date = LocalDate.of(2026, 3, 2 + week * 7);
    const at = (index: number) => OffsetDateTime.of(2026, 3, 2 + week * 7, 10, week, index, 0, ZoneOffset.UTC);
    return new Session(
      `week-${week}`,
      new SessionBlueprint('Legs', [squat], ''),
      [makeRecordedExercise(squat, [10, 10, 10], new Weight(100 + week * 2.5, 'kilograms'), at)],
      date,
      undefined,
      undefined,
    );
  });
}

async function startApp(sessions: Session[]) {
  const db = drizzle(await openDatabaseAsync(':memory:'));
  await new DatabaseMigrationService(db, logger as never, { importOldData: async () => {} }).migrate();
  const workoutRepository = new WorkoutRepository(db);
  await workoutRepository.putMany(sessions);
  const harness = createEffectStore({
    db,
    workoutRepository,
    logger: logger as never,
    keyValueStore: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() } as never,
  });
  applyStoredSessionsEffects(harness.addEffect);
  applyStatsEffects(harness.addEffect);
  harness.store.dispatch(setSettingsIsHydrated(true));
  harness.store.dispatch(initializeStoredSessionsStateSlice());
  await harness.settle();
  return { ...harness, workoutRepository };
}

const march = { from: LocalDate.of(2026, 3, 1), to: LocalDate.of(2026, 3, 31) };

/** Opens a past workout for editing, as the history editor does when it mounts. */
async function openForEditing(app: Awaited<ReturnType<typeof startApp>>, sessionId: string) {
  app.store.dispatch(openSessionForEditing(sessionId));
  await app.settle();
}

describe('history read from SQL', () => {
  beforeEach(() => {
    // Only the clock: `fetchOverallStats` waits on a real timer.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-03T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("editing a past workout's sets updates the month list, the calendar, the PR badges and the stats", async () => {
    const app = await startApp(history());
    const { workoutRepository: repository } = app;
    const writes = vi.fn();
    repository.subscribe(writes);
    app.store.dispatch(fetchOverallStats());
    await app.settle();
    expect(app.getState().stats.overallView.unwrapOr(undefined)?.heaviestLift?.weight).toEqual(
      new Weight(105, 'kilograms'),
    );
    expect([...(await repository.personalRecords()).keys()]).toEqual(['week-1', 'week-2']);

    // The middle week gets a heavier top set: 120 kg for 10, the best of the three by a distance.
    await openForEditing(app, 'week-1');
    app.store.dispatch(
      updateStoredSession({
        sessionId: 'week-1',
        update: (session) => {
          const exercise = session.recordedExercises[0] as RecordedWeightedExercise;
          const top = exercise.potentialSets[2]!;
          return session.withExercise(
            0,
            exercise.with({
              potentialSets: [
                ...exercise.potentialSets.slice(0, 2),
                top.with({ weight: new Weight(120, 'kilograms') }),
              ],
            }),
          );
        },
      }),
    );
    await app.settle();

    expect(writes).toHaveBeenCalledTimes(1);
    // The History list: the edited workout reads back with its new set.
    const inMarch = await repository.finishedBetween(march.from, march.to);
    expect(inMarch.map((x) => x.id)).toEqual(['week-2', 'week-1', 'week-0']);
    const edited = inMarch[1]!.recordedExercises[0] as RecordedWeightedExercise;
    expect(edited.potentialSets.map((x) => x.weight.value.toNumber())).toEqual([102.5, 102.5, 120]);
    // The calendar: that day's volume is 102.5*10*2 + 120*10.
    expect((await repository.dailyActivity()).map((x) => `${x.date.toString()} ${x.workouts} ${x.volumeKg}`)).toEqual([
      '2026-03-02 1 3000',
      '2026-03-09 1 3250',
      '2026-03-16 1 3150',
    ]);
    // The PR badges: week 1 now holds the record, and week 2 no longer beats it.
    const records = await repository.personalRecords();
    expect([...records.keys()]).toEqual(['week-1']);
    // Epley: 120 kg for 10 reps, as `calculateOneRepMax` computes it (1 + 10/30 isn't exact in BigNumber).
    expect(records.get('week-1')).toEqual([
      { exerciseName: 'Squat', oneRepMax: oneRepMaxOf(new Weight(120, 'kilograms'), 10) },
    ]);
    // Stats: stale after the write, and recalculated from the rows on the next fetch.
    expect(app.getState().stats.isDirty).toBe(true);
    app.store.dispatch(fetchOverallStats());
    await app.settle();
    expect(app.getState().stats.overallView.unwrapOr(undefined)?.heaviestLift?.weight).toEqual(
      new Weight(120, 'kilograms'),
    );
  });

  it('startup loads none of the history; the editor loads one past workout by id, saves and deletes it', async () => {
    const app = await startApp(history());
    const { workoutRepository: repository } = app;
    expect(app.getState().storedSessions.sessions).toEqual({});

    await openForEditing(app, 'week-1');
    expect(Object.keys(app.getState().storedSessions.sessions)).toEqual(['week-1']);
    expect(app.getState().storedSessions.editingSessionId).toBe('week-1');

    app.store.dispatch(
      updateStoredSession({ sessionId: 'week-1', update: (s) => s.withUpdatedDate(LocalDate.of(2026, 3, 10)) }),
    );
    app.store.dispatch(sessionFinished('week-1'));
    await app.settle();
    expect((await repository.get('week-1'))?.date.toString()).toBe('2026-03-10');

    // Opening another past workout closes this one: only one is held in memory at a time.
    await openForEditing(app, 'week-0');
    expect(Object.keys(app.getState().storedSessions.sessions)).toEqual(['week-0']);

    app.store.dispatch(deleteStoredSession('week-0'));
    await app.settle();
    expect(await repository.get('week-0')).toBeUndefined();
    expect(app.getState().storedSessions).toMatchObject({ sessions: {}, editingSessionId: undefined });
    expect((await repository.finishedBetween(march.from, march.to)).map((x) => x.id)).toEqual(['week-2', 'week-1']);
  });

  describe('a past workout open in the editor', () => {
    const renamed = (name: string) => updateStoredSession({ sessionId: 'week-1', update: (s) => s.withName(name) });
    const live = () => history()[0]!.with({ id: 'live', date: TODAY });

    it('keeps its edits when the workout in progress is finished meanwhile', async () => {
      const app = await startApp(history());
      app.store.dispatch(putStoredSession(live()));
      app.store.dispatch(setActiveSessionId('live'));
      await openForEditing(app, 'week-1');
      app.store.dispatch(renamed('First edit'));

      // Finished from the notification while the editor is still open.
      app.store.dispatch(sessionFinished('live'));
      await app.settle();
      app.store.dispatch(renamed('Second edit'));
      await app.settle();

      expect(app.getState().storedSessions.sessions['week-1']?.blueprint.name).toBe('Second edit');
      expect((await app.workoutRepository.get('week-1'))?.blueprint.name).toBe('Second edit');
      // The finished workout stays open too, for its summary.
      expect(app.getState().storedSessions.sessions['live']).toBeDefined();
    });

    it('keeps its edits when a new workout is started meanwhile', async () => {
      const app = await startApp(history());
      await openForEditing(app, 'week-1');
      app.store.dispatch(renamed('First edit'));

      app.store.dispatch(putStoredSession(live()));
      app.store.dispatch(setActiveSessionId('live'));
      await app.settle();
      app.store.dispatch(renamed('Second edit'));
      await app.settle();

      expect(app.getState().storedSessions.sessions['week-1']?.blueprint.name).toBe('Second edit');
      expect((await app.workoutRepository.get('week-1'))?.blueprint.name).toBe('Second edit');
    });
  });

  it('a summary opened by link after a restart loads its workout by id, beside the editor', async () => {
    const app = await startApp(history());
    await openForEditing(app, 'week-0');

    app.store.dispatch(openSessionForSummary('week-2'));
    await app.settle();

    expect(app.getState().storedSessions).toMatchObject({ editingSessionId: 'week-0', recentSessionId: 'week-2' });
    expect(app.getState().storedSessions.sessions['week-2']?.blueprint.name).toBe('Legs');
  });

  it('a summary or editor opened for a workout that is gone is told so', async () => {
    const app = await startApp(history());

    app.store.dispatch(openSessionForSummary('deleted-elsewhere'));
    await app.settle();
    expect(app.getState().storedSessions.notFoundSessionId).toBe('deleted-elsewhere');

    await openForEditing(app, 'week-1');
    expect(app.getState().storedSessions.notFoundSessionId).toBe('deleted-elsewhere');
  });

  it('opening a missing workout for editing opens nothing', async () => {
    const app = await startApp(history());

    await openForEditing(app, 'deleted-elsewhere');

    expect(app.getState().storedSessions).toMatchObject({ sessions: {}, editingSessionId: undefined });
  });

  it('deleting a workout drops it from the stats on the next fetch', async () => {
    const app = await startApp(history());
    app.store.dispatch(fetchOverallStats());
    await app.settle();
    // The last 90 days from June 3 start on March 5, so they hold weeks 1 and 2 over 91 days.
    expect(app.getState().stats.overallView.unwrapOr(undefined)?.workoutsPerWeek).toBeCloseTo((2 * 7) / 91, 6);

    app.store.dispatch(deleteStoredSession('week-1'));
    await app.settle();

    expect(app.getState().stats.isDirty).toBe(true);
    app.store.dispatch(fetchOverallStats());
    await app.settle();
    expect(app.getState().stats.overallView.unwrapOr(undefined)?.workoutsPerWeek).toBeCloseTo(7 / 91, 6);
  });

  it('a fetch that overtakes a slow write still ends with stats from the new rows', async () => {
    const app = await startApp(history());
    const { workoutRepository: repository } = app;
    app.store.dispatch(fetchOverallStats());
    await app.settle();
    const heaviest = () => app.getState().stats.overallView.unwrapOr(undefined)?.heaviestLift?.weight;
    expect(heaviest()).toEqual(new Weight(105, 'kilograms'));

    await openForEditing(app, 'week-1');
    // The persist effect's write waits on the test, as a big import or a slow device would make it.
    let commit = () => {};
    const putMany = repository.putMany.bind(repository);
    vi.spyOn(repository, 'putMany').mockImplementation(async (sessions) => {
      await new Promise<void>((resolve) => (commit = resolve));
      return putMany(sessions);
    });
    app.store.dispatch(
      updateStoredSession({
        sessionId: 'week-1',
        update: (session) => {
          const exercise = session.recordedExercises[0] as RecordedWeightedExercise;
          const top = exercise.potentialSets[2]!;
          return session.withExercise(
            0,
            exercise.with({
              potentialSets: [
                ...exercise.potentialSets.slice(0, 2),
                top.with({ weight: new Weight(120, 'kilograms') }),
              ],
            }),
          );
        },
      }),
    );
    // Stats were marked stale by the action; a screen asks before the rows have changed.
    app.store.dispatch(fetchOverallStats());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(heaviest()).toEqual(new Weight(105, 'kilograms'));

    commit();
    await app.settle();

    // The commit must leave the stats stale again, so the next ask reads the new rows.
    expect(app.getState().stats.isDirty).toBe(true);
    app.store.dispatch(fetchOverallStats());
    await app.settle();
    expect(heaviest()).toEqual(new Weight(120, 'kilograms'));
  });

  describe('carry-over', () => {
    const legs = new SessionBlueprint('Legs', [squat], '');
    const push = new SessionBlueprint('Push', [makeWeightedBlueprint({ name: 'Bench', exerciseId: 'Bench' })], '');
    const key = squat.progressionKey();
    /** The weight the next Legs opens on: the best set last time plus the 2.5 kg rule. */
    const nextSquatKg = (app: Awaited<ReturnType<typeof startApp>>) => {
      const service = new SessionService(app.workoutRepository, app.getState);
      const next = service.hydrateSessionFromBlueprint(legs, selectLatestExercises(app.getState()));
      return (next.recordedExercises[0] as RecordedWeightedExercise).potentialSets.map((x) =>
        x.weight.value.toNumber(),
      );
    };

    it('starting a workout from a program applies carry-over and progression from the tables', async () => {
      const app = await startApp(history());
      // Loaded at startup by one query, not derived from the hydrated sessions.
      expect(selectLatestExercises(app.getState())[key]?.latestTime?.toString()).toBe('2026-03-16T10:02:02Z');

      const service = new SessionService(app.workoutRepository, app.getState);
      const upcoming: Session[] = [];
      for await (const session of service.getUpcomingSessions([legs, push], selectLatestExercises(app.getState()))) {
        upcoming.push(session);
        if (upcoming.length === 2) break;
      }

      // The last planned workout was Legs, so Push is next; Legs then carries 105 kg forward.
      expect(upcoming.map((x) => x.blueprint.name)).toEqual(['Push', 'Legs']);
      const squats = upcoming[1]!.recordedExercises[0] as RecordedWeightedExercise;
      expect(squats.potentialSets.map((x) => x.weight.value.toNumber())).toEqual([107.5, 107.5, 107.5]);
    });

    it('editing the latest past workout down moves carry-over back for the next one, without a restart', async () => {
      const app = await startApp(history());
      expect(nextSquatKg(app)).toEqual([107.5, 107.5, 107.5]);

      // Week 2's sets are cleared: week 1 (102.5 kg) is the latest Squat again.
      await openForEditing(app, 'week-2');
      app.store.dispatch(
        updateStoredSession({
          sessionId: 'week-2',
          update: (session) =>
            session.withExercise(
              0,
              (session.recordedExercises[0] as RecordedWeightedExercise).with({
                potentialSets: [emptyPotentialSet(105), emptyPotentialSet(105), emptyPotentialSet(105)],
              }),
            ),
        }),
      );
      await app.settle();

      const latest = selectLatestExercises(app.getState())[key];
      expect(latest?.latestTime?.toString()).toBe('2026-03-09T10:01:02Z');
      expect(app.getState().storedSessions.latestExerciseWorkoutIds[key]).toBe('week-1');
      expect(nextSquatKg(app)).toEqual([105, 105, 105]);
    });

    it('deleting the latest past workout moves carry-over back for the next one, without a restart', async () => {
      const app = await startApp(history());

      app.store.dispatch(deleteStoredSession('week-2'));
      await app.settle();

      expect(app.getState().storedSessions.latestExerciseWorkoutIds[key]).toBe('week-1');
      expect(nextSquatKg(app)).toEqual([105, 105, 105]);

      app.store.dispatch(deleteStoredSession('week-1'));
      app.store.dispatch(deleteStoredSession('week-0'));
      await app.settle();

      expect(selectLatestExercises(app.getState())).toEqual({});
      expect(nextSquatKg(app)).toEqual([0, 0, 0]);
    });

    it('logging a set in the workout in progress moves carry-over forward without reading the tables', async () => {
      const app = await startApp(history());
      const live = new Session(
        'live',
        legs,
        [RecordedWeightedExercise.empty(squat, 'kilograms')],
        TODAY,
        undefined,
        undefined,
      );
      const latestPerLineage = vi.spyOn(app.workoutRepository, 'latestPerLineage');
      app.store.dispatch(putStoredSession(live));
      app.store.dispatch(setActiveSessionId(live.id));
      await app.settle();

      expect(app.getState().storedSessions.latestExerciseWorkoutIds[key]).toBe('week-2');
      app.store.dispatch(
        updateStoredSession({
          sessionId: live.id,
          update: (s) => s.withCycledExerciseReps(0, 0, OffsetDateTime.of(2026, 6, 3, 10, 0, 0, 0, ZoneOffset.UTC)),
        }),
      );
      await app.settle();

      expect(app.getState().storedSessions.latestExerciseWorkoutIds[key]).toBe('live');
      expect(latestPerLineage).not.toHaveBeenCalled();
    });

    it('agrees with the tables when two workouts logged a lineage at the same instant', async () => {
      const app = await startApp([]);
      const at = OffsetDateTime.of(2026, 4, 1, 1, 0, 0, 0, ZoneOffset.UTC);
      const squatsAt = (id: string) =>
        new Session(
          id,
          legs,
          [makeRecordedExercise(squat, [5], new Weight(100, 'kilograms'), () => at)],
          LocalDate.of(2026, 4, 1),
          undefined,
          undefined,
        );
      // Stored b first, then a: the tables break the tie by id, so a is the latest there.
      app.store.dispatch(putStoredSession(squatsAt('b')));
      app.store.dispatch(putStoredSession(squatsAt('a')));
      await app.settle();

      expect((await app.workoutRepository.latestPerLineage())[key]?.workoutId).toBe('a');
      expect(app.getState().storedSessions.latestExerciseWorkoutIds[key]).toBe('a');
    });

    it('agrees with the tables when the tying workout is closed before its write lands', async () => {
      const app = await startApp([]);
      const at = OffsetDateTime.of(2026, 4, 1, 1, 0, 0, 0, ZoneOffset.UTC);
      const squatsAt = (id: string) =>
        new Session(
          id,
          legs,
          [makeRecordedExercise(squat, [5], new Weight(100, 'kilograms'), () => at)],
          LocalDate.of(2026, 4, 1),
          undefined,
          undefined,
        );
      // The second put of b takes the recent slot from a before a's write has landed; the tie a's write
      // makes is still judged by what it wrote.
      app.store.dispatch(putStoredSession(squatsAt('b')));
      app.store.dispatch(putStoredSession(squatsAt('a')));
      app.store.dispatch(putStoredSession(squatsAt('b')));
      await app.settle();

      expect(app.getState().storedSessions.sessions['a']).toBeUndefined();
      expect(app.getState().storedSessions.latestExerciseWorkoutIds[key]).toBe('a');
    });

    interface Write {
      kind: 'put' | 'update' | 'upsert' | 'delete';
      id: string;
      hour: number;
      name: string;
      abandoned: boolean;
    }

    /** Dispatches `writes` back to back, as taps and edits are, and checks the cache against the tables. */
    async function cacheMatchesTablesAfter(write: fc.Arbitrary<Write>, numRuns: number) {
      const describe = (latest: Record<ProgressionKey, { workoutId: string; exercise: { latestTime?: unknown } }>) =>
        Object.fromEntries(
          Object.entries(latest).map(([lineage, x]) => [
            lineage,
            `${x.workoutId} ${x.exercise.latestTime?.toString()}`,
          ]),
        );
      await fc.assert(
        fc.asyncProperty(fc.array(write, { minLength: 2, maxLength: 12 }), async (writes) => {
          const app = await startApp([]);
          const actions = writes.map((w): UnknownAction => {
            const blueprint = makeWeightedBlueprint({ name: w.name, exerciseId: w.name, sets: 1 });
            const at = OffsetDateTime.of(2026, 4, 1, w.hour, 0, 0, 0, ZoneOffset.UTC);
            const built = new Session(
              w.id,
              new SessionBlueprint('Day', [blueprint], ''),
              [makeRecordedExercise(blueprint, [w.abandoned ? undefined : 5], new Weight(100, 'kilograms'), () => at)],
              LocalDate.of(2026, 4, 1),
              undefined,
              undefined,
            );
            switch (w.kind) {
              case 'put':
                return putStoredSession(built);
              case 'update':
                return updateStoredSession({ sessionId: w.id, update: () => built });
              case 'upsert':
                return upsertStoredSessions([built]);
              default:
                return deleteStoredSession(w.id);
            }
          });
          // Back to back, so the refreshes overlap the writes.
          actions.forEach((action) => app.store.dispatch(action));
          await app.settle();

          const state: RootState = app.getState();
          const cached = Object.fromEntries(
            Object.entries(selectLatestExercises(state)).map(([lineage, exercise]) => [
              lineage,
              `${state.storedSessions.latestExerciseWorkoutIds[lineage as ProgressionKey]} ${exercise?.latestTime?.toString()}`,
            ]),
          );
          expect(cached).toEqual(describe(await app.workoutRepository.latestPerLineage()));
        }),
        { numRuns },
      );
    }

    it('stays equal to the tables after any mix of writes', async () => {
      await cacheMatchesTablesAfter(
        fc.record({
          kind: fc.constantFrom('put', 'update', 'upsert', 'delete'),
          id: fc.constantFrom('a', 'b', 'c', 'd'),
          hour: fc.integer({ min: 0, max: 3 }),
          name: fc.constantFrom('Squat', 'Bench'),
          abandoned: fc.boolean(),
        }),
        40,
      );
    });

    it('stays equal to the tables when workouts log a lineage at the same instant', async () => {
      // Two workouts, one movement, one instant: every logged write ties with the other workout's, and the
      // tables, not the order of writes, break the tie. No bulk write, which would re-read everything.
      await cacheMatchesTablesAfter(
        fc.record({
          kind: fc.constantFrom('put', 'update', 'delete'),
          id: fc.constantFrom('a', 'b'),
          hour: fc.constant(1),
          name: fc.constant('Squat'),
          abandoned: fc.boolean(),
        }),
        40,
      );
    });
  });

  it('a set logged in the workout in progress leaves the stats alone, finishing it does not', async () => {
    const app = await startApp(history());
    const live = history()[0]!.with({ id: 'live', date: TODAY });
    app.store.dispatch(putStoredSession(live));
    app.store.dispatch(setActiveSessionId(live.id));
    await app.settle();
    app.store.dispatch(fetchOverallStats());
    await app.settle();
    expect(app.getState().stats.isDirty).toBe(false);

    app.store.dispatch(updateStoredSession({ sessionId: live.id, update: (s) => s.withName('Renamed') }));
    await app.settle();
    expect(app.getState().stats.isDirty).toBe(false);

    app.store.dispatch(sessionFinished(live.id));
    await app.settle();
    expect(app.getState().stats.isDirty).toBe(true);
  });
});

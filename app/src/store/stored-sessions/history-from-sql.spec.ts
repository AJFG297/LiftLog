import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { LocalDate, OffsetDateTime, ZoneOffset } from '@js-joda/core';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { SessionBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { Weight } from '@/models/weight';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { createEffectStore } from '@/utils/__test__/effect-store';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import { applyStatsEffects } from '@/store/stats/effects';
import {
  deleteStoredSession,
  initializeStoredSessionsStateSlice,
  putStoredSession,
  sessionFinished,
  setActiveSessionId,
  updateStoredSession,
} from '@/store/stored-sessions';
import { fetchOverallStats, setOverallViewTime } from '@/store/stats';
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
    app.store.dispatch(setOverallViewTime(march));
    await app.settle();
    expect(app.getState().stats.overallView.unwrapOr(undefined)?.heaviestLift?.weight).toEqual(
      new Weight(105, 'kilograms'),
    );
    expect([...(await repository.personalRecords()).keys()]).toEqual(['week-1', 'week-2']);

    // The middle week gets a heavier top set: 120 kg for 10, the best of the three by a distance.
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

  it('deleting the earliest workout moves the all-time stats start', async () => {
    const app = await startApp(history());
    const { workoutRepository: repository } = app;
    app.store.dispatch(setOverallViewTime('all-time'));
    await app.settle();
    // 2026-03-02 to today is 94 days: 3 workouts over 94/7 weeks.
    expect((await repository.earliestDate())?.toString()).toBe('2026-03-02');
    expect(app.getState().stats.overallView.unwrapOr(undefined)?.workoutsPerWeek).toBeCloseTo((3 * 7) / 94, 6);

    app.store.dispatch(deleteStoredSession('week-0'));
    await app.settle();

    expect((await repository.earliestDate())?.toString()).toBe('2026-03-09');
    expect(app.getState().stats.isDirty).toBe(true);
    app.store.dispatch(fetchOverallStats());
    await app.settle();
    // 2026-03-09 to today is 87 days: 2 workouts over 87/7 weeks.
    expect(app.getState().stats.overallView.unwrapOr(undefined)?.workoutsPerWeek).toBeCloseTo((2 * 7) / 87, 6);
    expect(TODAY.toString()).toBe(LocalDate.now().toString());
  });

  it('a fetch that overtakes a slow write still ends with stats from the new rows', async () => {
    const app = await startApp(history());
    const { workoutRepository: repository } = app;
    app.store.dispatch(setOverallViewTime(march));
    await app.settle();
    const heaviest = () => app.getState().stats.overallView.unwrapOr(undefined)?.heaviestLift?.weight;
    expect(heaviest()).toEqual(new Weight(105, 'kilograms'));

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

  it('a set logged in the workout in progress leaves the stats alone, finishing it does not', async () => {
    const app = await startApp(history());
    const live = history()[0]!.with({ id: 'live', date: TODAY });
    app.store.dispatch(putStoredSession(live));
    app.store.dispatch(setActiveSessionId(live.id));
    await app.settle();
    app.store.dispatch(setOverallViewTime(march));
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

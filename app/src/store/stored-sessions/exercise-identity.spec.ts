import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { LocalDate, OffsetDateTime, ZoneOffset } from '@js-joda/core';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { ProgressRepository } from '@/services/progress-repository';
import { SessionService } from '@/services/session-service';
import { createEffectStore } from '@/utils/__test__/effect-store';
import { exercisesSchema, workoutExercisesSchema } from '@/db/schema';
import { toExerciseDescriptorJSON } from '@/models/exercise-models';
import { stubDescriptor } from '@/models/exercise-resolver';
import {
  movementKeyFor,
  ProgramBlueprint,
  SessionBlueprint,
  stubExerciseId,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { Session } from '@/models/session-models';
import { Weight } from '@/models/weight';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import {
  initializeStoredSessionsStateSlice,
  putStoredSession,
  selectExerciseById,
  selectExercises,
  selectHistoryPersonalRecords,
  selectLatestExercises,
  selectRecentlyCompletedExercises,
  selectSessions,
  deleteExercise,
  updateExercise,
} from '@/store/stored-sessions';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import { applyProgramEffects } from '@/store/program/effects';
import { linkPlanExercises, savePlan } from '@/store/program';
import { importBackupData, setIsHydrated as setSettingsIsHydrated, setPreferredLanguage } from '@/store/settings';
import { addImportBackupEffects } from '@/store/settings/import-backup-effects';
import { calculateStats } from '@/store/stats/calculate-stats';
import { sessionsFromNormalized } from '@/services/csv-import/csv-to-sessions';
import type { RootState } from '@/store';

vi.stubEnv('TZ', 'UTC');

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  time: async (_: string, action: () => unknown) => action(),
};

const USER_EXERCISE = 'user-hack-squat';
const WEIGHTED = 'WeightedExerciseBlueprint';

const hackSquat = makeWeightedBlueprint({ name: 'Hack Squat', exerciseId: USER_EXERCISE, sets: 3 });
const legPress = makeWeightedBlueprint({ name: 'Leg Press', exerciseId: 'Leg Press', sets: 3 });

/** Three weeks of the same two exercises, 100, 102.5 then 105kg. */
function history(): Session[] {
  return [0, 1, 2].map((week) => {
    const at = (index: number) => OffsetDateTime.of(2026, 3, 2 + week * 7, 10, week, index, 0, ZoneOffset.UTC);
    const weight = new Weight(100 + week * 2.5, 'kilograms');
    return new Session(
      `week-${week}`,
      new SessionBlueprint('Legs', [hackSquat, legPress], ''),
      [
        makeRecordedExercise(hackSquat, [10, 10, 10], weight, at),
        makeRecordedExercise(legPress, [10, 10, 10], weight, at),
      ],
      LocalDate.of(2026, 3, 2 + week * 7),
      undefined,
      undefined,
    );
  });
}

async function migratedDb(): Promise<ExpoSQLiteDatabase> {
  const db = drizzle(await openDatabaseAsync(':memory:'));
  await new DatabaseMigrationService(db, logger as never, { importOldData: async () => {} }).migrate();
  return db;
}

/** Starts the app's stored-sessions, program and import effects over `db`, the way startup does. */
async function startApp(db: ExpoSQLiteDatabase) {
  const workoutRepository = new WorkoutRepository(db);
  let getState: () => RootState = () => {
    throw new Error('not started');
  };
  const sessionService = new SessionService(new ProgressRepository(() => getState()), () => getState());
  const harness = createEffectStore({
    db,
    workoutRepository,
    sessionService,
    logger: logger as never,
    tolgee: { t: (s: string) => s } as never,
    keyValueStore: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() } as never,
  });
  getState = harness.getState;
  applyStoredSessionsEffects(harness.addEffect);
  applyProgramEffects(harness.addEffect);
  addImportBackupEffects(harness.addEffect);
  harness.store.dispatch(setSettingsIsHydrated(true));
  harness.store.dispatch(initializeStoredSessionsStateSlice());
  await harness.settle();
  return { ...harness, sessionService };
}

async function appWithHistory() {
  const db = await migratedDb();
  await db
    .insert(exercisesSchema)
    .values({ id: USER_EXERCISE, payload: toExerciseDescriptorJSON(stubDescriptor('Hack Squat')) });
  await new WorkoutRepository(db).putMany(history());
  return { db, app: await startApp(db) };
}

/** Everything that hangs off an exercise's history, read the way the screens read it. */
function whatHangsOff(state: RootState, exerciseId: string) {
  const movementKey = movementKeyFor(exerciseId, WEIGHTED);
  const sessions = selectSessions(state);
  const stats = calculateStats(sessions, 'kilograms', { from: LocalDate.of(2026, 1, 1), to: LocalDate.of(2026, 4, 1) });
  return {
    history: selectRecentlyCompletedExercises(state, undefined)(movementKey).map((x) => x.latestTime?.toString()),
    stats: stats.weightedExerciseStats
      .filter((x) => x.movementKey === movementKey)
      .map((x) => x.maxLiftedPerSessionStatistics.maxValue.value.toString()),
    // Records are found per movement; each one names the exercise as it was logged that day.
    records: [...selectHistoryPersonalRecords(state).entries()].map(
      ([sessionId, records]) => `${sessionId}: ${records.map((x) => x.exerciseName).join(', ')}`,
    ),
  };
}

describe('exercise identity through the store', () => {
  it.each([
    ['a user exercise', USER_EXERCISE, hackSquat],
    ['a copy-on-write edit of a built-in', 'Leg Press', legPress],
  ])('renaming %s keeps history, stats, records and carry-over attached', async (_, exerciseId, blueprint) => {
    const { db, app } = await appWithHistory();
    const before = whatHangsOff(app.getState(), exerciseId);
    expect(before.history).toHaveLength(3);
    expect(before.stats).toHaveLength(1);
    expect(before.records.length).toBeGreaterThan(0);

    const exercise = selectExercises(app.getState())[exerciseId]!;
    app.store.dispatch(updateExercise({ id: exerciseId, exercise: { ...exercise, name: 'Renamed' } }));
    await app.settle();

    expect(selectExerciseById(app.getState(), exerciseId)?.name).toBe('Renamed');
    expect(whatHangsOff(app.getState(), exerciseId)).toEqual(before);

    // Carry-over: the plan now calls it by its new name and still picks up last week's 105kg.
    const renamedInPlan = blueprint.with({ name: 'Renamed' });
    const upcoming = await app.sessionService
      .getUpcomingSessions([new SessionBlueprint('Legs', [renamedInPlan], '')], selectLatestExercises(app.getState()))
      .next();
    const carried = (upcoming.value as Session).recordedExercises[0]!;
    expect(carried.blueprint.name).toBe('Renamed');
    expect((carried as ReturnType<typeof makeRecordedExercise>).potentialSets[0]!.weight.value.toNumber()).toBe(107.5);

    // A workout logged under the new name joins the same history, stats and records.
    const week3 = LocalDate.of(2026, 3, 23);
    const at = (index: number) => OffsetDateTime.of(2026, 3, 23, 10, 0, index, 0, ZoneOffset.UTC);
    app.store.dispatch(
      putStoredSession(
        new Session(
          'week-3',
          new SessionBlueprint('Legs', [renamedInPlan], ''),
          [makeRecordedExercise(renamedInPlan, [10, 10, 10], new Weight(110, 'kilograms'), at)],
          week3,
          undefined,
          undefined,
        ),
      ),
    );
    await app.settle();
    const after = whatHangsOff(app.getState(), exerciseId);
    expect(after.history).toHaveLength(4);
    expect(after.stats).toEqual(['110']);
    expect(after.records.find((x) => x.startsWith('week-3'))).toContain('Renamed');

    // And after a restart, from what is on disk.
    const restarted = await startApp(db);
    expect(selectExerciseById(restarted.getState(), exerciseId)?.name).toBe('Renamed');
    expect(whatHangsOff(restarted.getState(), exerciseId)).toEqual(after);
  });

  it('stores the key columns from the exercise id', async () => {
    const { db } = await appWithHistory();
    const rows = await db.select().from(workoutExercisesSchema);
    expect(new Set(rows.map((x) => x.movementKey))).toEqual(
      new Set([movementKeyFor(USER_EXERCISE, WEIGHTED), movementKeyFor('Leg Press', WEIGHTED)]),
    );
    expect(rows.every((x) => x.progressionKey.startsWith(`${x.movementKey.split('|')[0]}_`))).toBe(true);
  });

  it('keeps history whole across a language switch', async () => {
    const { app } = await appWithHistory();
    const before = whatHangsOff(app.getState(), 'Leg Press');

    app.store.dispatch(setPreferredLanguage('ru'));
    await app.settle();

    expect(selectExercises(app.getState())['Leg Press']?.name).toBe('Жим ногами');
    expect(whatHangsOff(app.getState(), 'Leg Press')).toEqual(before);
  });

  it('links an imported plan to the exercises the user already has, by any name, without duplicates', async () => {
    const { app } = await appWithHistory();
    const exercisesBefore = Object.keys(selectExercises(app.getState()));
    // As a plan file, the AI planner or a friend's share hands it over: names, no ids.
    const plan = new ProgramBlueprint(
      'Imported',
      [
        new SessionBlueprint(
          'Day',
          [
            WeightedExerciseBlueprint.of({ name: 'hack squat' }),
            WeightedExerciseBlueprint.of({ name: 'Жим ногами' }),
            WeightedExerciseBlueprint.of({ name: 'Belt Squat' }),
            WeightedExerciseBlueprint.of({ name: 'Belt Squats', exerciseId: 'someone-elses-id' }),
          ],
          '',
        ),
      ],
      LocalDate.of(2026, 4, 1),
    );

    app.store.dispatch(savePlan({ programId: 'imported', programBlueprint: plan }));
    app.store.dispatch(linkPlanExercises({ programId: 'imported' }));
    await app.settle();

    const linked = app.getState().program.savedPrograms['imported']!.sessions[0]!.exercises;
    expect(linked.map((x) => x.exerciseId)).toEqual([
      USER_EXERCISE,
      'Leg Press',
      stubExerciseId('Belt Squat'),
      stubExerciseId('Belt Squat'),
    ]);
    // One new exercise for the one name nothing matched.
    expect(Object.keys(selectExercises(app.getState())).toSorted()).toEqual(
      [...exercisesBefore, stubExerciseId('Belt Squat')].toSorted(),
    );
  });

  it('links a CSV import to existing exercises and makes one stub per unknown name', async () => {
    const { app } = await appWithHistory();
    const exercisesBefore = Object.keys(selectExercises(app.getState()));
    const sets = [{ reps: 8, weight: 60, unit: 'kilograms' as const }];
    const workouts = sessionsFromNormalized(
      ['2026-04-01', '2026-04-08'].map((date) => ({
        contentDateKey: date,
        date: LocalDate.parse(date),
        sessionName: 'Imported',
        exercises: [
          { name: 'Hack Squat', sets },
          { name: 'leg press', sets },
          { name: 'Sissy Squat', sets },
        ],
      })),
    );

    app.store.dispatch(importBackupData({ source: 'external', workouts, programs: {}, successMessage: 'done' }));
    await app.settle();

    const imported = selectSessions(app.getState()).filter((x) => x.blueprint.name === 'Imported');
    expect(imported).toHaveLength(2);
    for (const session of imported) {
      expect(session.recordedExercises.map((x) => x.blueprint.exerciseId)).toEqual([
        USER_EXERCISE,
        'Leg Press',
        stubExerciseId('Sissy Squat'),
      ]);
    }
    expect(Object.keys(selectExercises(app.getState())).toSorted()).toEqual(
      [...exercisesBefore, stubExerciseId('Sissy Squat')].toSorted(),
    );
    expect(whatHangsOff(app.getState(), USER_EXERCISE).history).toHaveLength(5);
  });

  it('keeps a renamed stub descriptor when a CSV repeats its original name', async () => {
    const { db, app } = await appWithHistory();
    const originalName = 'Custom cable movement';
    const id = stubExerciseId(originalName);
    const renamed = {
      ...stubDescriptor('Renamed cable movement'),
      equipment: 'cable',
      instructions: 'Keep these instructions',
    };
    app.store.dispatch(updateExercise({ id, exercise: renamed }));
    await app.settle();

    const workouts = sessionsFromNormalized([
      {
        contentDateKey: '2026-04-01',
        date: LocalDate.of(2026, 4, 1),
        sessionName: 'Imported',
        exercises: [{ name: originalName, sets: [{ reps: 8, weight: 60, unit: 'kilograms' }] }],
      },
    ]);
    app.store.dispatch(importBackupData({ source: 'external', workouts, programs: {}, successMessage: 'done' }));
    await app.settle();

    expect(selectExerciseById(app.getState(), id)).toEqual(renamed);
    expect(
      selectSessions(app.getState()).find((x) => x.blueprint.name === 'Imported')?.recordedExercises[0]?.blueprint
        .exerciseId,
    ).toBe(id);
    expect(selectExerciseById((await startApp(db)).getState(), id)).toEqual(renamed);
  });

  it('restores linked ids after deleting a descriptor, while resolving old names-only rows', async () => {
    const db = await migratedDb();
    const app = await startApp(db);
    app.store.dispatch(updateExercise({ id: USER_EXERCISE, exercise: stubDescriptor('Original custom lift') }));
    await app.settle();
    app.store.dispatch(deleteExercise(USER_EXERCISE));
    await app.settle();

    const workouts = history()
      .slice(0, 2)
      .map((session, index) => {
        const blueprint = hackSquat.with({ name: index ? 'Renamed custom lift' : 'Original custom lift' });
        return session.with({
          blueprint: session.blueprint.with({ exercises: [blueprint] }),
          recordedExercises: [makeRecordedExercise(blueprint, [10, 10, 10])],
        });
      });
    const legacyBlueprint = WeightedExerciseBlueprint.of({ name: 'Leg Press' });
    const legacy = history()[2]!.with({
      id: 'legacy-row',
      blueprint: new SessionBlueprint('Legacy', [legacyBlueprint], ''),
      recordedExercises: [makeRecordedExercise(legacyBlueprint, [10])],
    });
    const plan = new ProgramBlueprint(
      'Restored',
      [new SessionBlueprint('Day', [hackSquat.with({ name: 'Renamed custom lift' }), legacyBlueprint], '')],
      LocalDate.of(2026, 4, 1),
    );
    app.store.dispatch(
      importBackupData({
        source: 'backup',
        workouts: [...workouts, legacy],
        programs: { restored: plan },
        exercises: {},
        successMessage: 'done',
      }),
    );
    await app.settle();
    expect(app.getState().program.savedPrograms.restored?.sessions[0]?.exercises.map((x) => x.exerciseId)).toEqual([
      USER_EXERCISE,
      'Leg Press',
    ]);

    const restored = await startApp(db);
    const sessions = selectSessions(restored.getState());
    expect(
      sessions
        .filter((x) => workouts.some((workout) => workout.id === x.id))
        .map((x) => x.recordedExercises[0]!.blueprint.exerciseId),
    ).toEqual([USER_EXERCISE, USER_EXERCISE]);
    expect(sessions.find((x) => x.id === legacy.id)?.recordedExercises[0]?.blueprint.exerciseId).toBe('Leg Press');
    expect(selectExerciseById(restored.getState(), USER_EXERCISE)).toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Duration, LocalDate } from '@js-joda/core';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { eq, sql } from 'drizzle-orm';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import {
  deleteStoredSession,
  initializeStoredSessionsStateSlice,
  putStoredSession,
  sessionFinished,
  setActiveSessionId,
  setExercises,
  setStoredSessions,
  upsertExercises,
  upsertStoredSessions,
  updateStoredSession,
} from '@/store/stored-sessions';
import { addUnpublishedSessionId } from '@/store/feed';
import { setStatsIsDirty } from '@/store/stats';
import { createAddEffectTestBed } from '@/utils/__test__/add-effect-testbed';
import { exercisesSchema, workoutsSchema } from '@/db/schema';
import { WorkoutRepository } from '@/services/workout-repository';
import { RestTimer } from '@/models/session-models/rest-timer';
import { createEffectStore } from '@/utils/__test__/effect-store';
import { setIsHydrated as setSettingsIsHydrated } from '@/store/settings';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import {
  emptyPotentialSet,
  filledPotentialSet,
  makeSession,
  makeWeightedBlueprint,
  tick,
} from '@/models/session-models/__test__/helpers';
import type { RootState } from '@/store/store';
import { stubDescriptor } from '@/models/exercise-resolver';

async function createTestDb(): Promise<ExpoSQLiteDatabase> {
  const expoDb = await openDatabaseAsync(':memory:');
  const db = drizzle(expoDb);
  await new DatabaseMigrationService(
    db,
    { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), time: timeStub } as never,
    { importOldData: async () => {} },
  ).migrate();
  return db;
}

function makeKvStore(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: vi.fn().mockImplementation((key: string) => Promise.resolve(store[key] ?? null)),
    getItemBytes: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockImplementation((key: string, val: string) => {
      store[key] = val;
      return Promise.resolve();
    }),
    removeItem: vi.fn().mockImplementation((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
    raw: store,
  };
}

const timeStub = async (_: string, action: () => unknown) => action();

const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), time: timeStub };

describe('stored-sessions effects', () => {
  let db: ExpoSQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  function bed(options: { keyValueStore?: ReturnType<typeof makeKvStore>; state?: Partial<RootState> }) {
    const testBed = createAddEffectTestBed({
      initialState: {
        settings: { isHydrated: true, preferredLanguage: 'en', exportToHealthAggregator: false },
        storedSessions: { sessions: {}, activeSessionId: undefined },
        ...options.state,
      } as Partial<RootState>,
      services: {
        db,
        workoutRepository: new WorkoutRepository(db),
        logger,
        keyValueStore: options.keyValueStore ?? makeKvStore(),
        healthExportService: { canExport: () => false },
      },
    });
    applyStoredSessionsEffects(testBed.addEffect);
    return testBed;
  }

  describe('the active session in SQLite', () => {
    it('persists content without ever claiming the active flag', async () => {
      const session = Session.freeformSession(LocalDate.of(2026, 4, 10), undefined);
      const testBed = bed({ state: { storedSessions: { sessions: { [session.id]: session } } } as Partial<RootState> });

      await testBed.dispatchHandled(putStoredSession(session));

      const [row] = await db.select().from(workoutsSchema).where(eq(workoutsSchema.id, session.id));
      expect(row).toBeDefined();
      expect(row!.active).toBe(false);
    });

    it('keeps exactly one row active as the workout changes', async () => {
      const first = Session.freeformSession(LocalDate.of(2026, 4, 10), undefined);
      const second = Session.freeformSession(LocalDate.of(2026, 4, 11), undefined);
      const sessions = { [first.id]: first, [second.id]: second };
      const testBed = bed({ state: { storedSessions: { sessions } } as Partial<RootState> });

      await testBed.dispatchHandled(setActiveSessionId(first.id));
      await testBed.dispatchHandled(setActiveSessionId(second.id));

      const active = (await db.select().from(workoutsSchema)).filter((x) => x.active);
      expect(active.map((x) => x.id)).toEqual([second.id]);
    });

    it('inserts the row itself, so it does not depend on the content write landing first', async () => {
      const session = Session.freeformSession(LocalDate.of(2026, 4, 10), undefined);
      const testBed = bed({ state: { storedSessions: { sessions: { [session.id]: session } } } as Partial<RootState> });

      await testBed.dispatchHandled(setActiveSessionId(session.id));

      const [row] = await db.select().from(workoutsSchema).where(eq(workoutsSchema.id, session.id));
      expect(row?.active).toBe(true);
    });

    it('clears the flag when the workout ends', async () => {
      const session = Session.freeformSession(LocalDate.of(2026, 4, 10), undefined);
      const testBed = bed({ state: { storedSessions: { sessions: { [session.id]: session } } } as Partial<RootState> });
      await testBed.dispatchHandled(setActiveSessionId(session.id));

      await testBed.dispatchHandled(setActiveSessionId(undefined));

      expect((await db.select().from(workoutsSchema)).filter((x) => x.active)).toHaveLength(0);
    });

    it('restored backups land inactive', async () => {
      const restored = Session.freeformSession(LocalDate.of(2026, 4, 10), undefined);
      const testBed = bed({});

      await testBed.dispatchHandled(upsertStoredSessions([restored]));

      const [row] = await db.select().from(workoutsSchema).where(eq(workoutsSchema.id, restored.id));
      expect(row?.active).toBe(false);
    });

    it('restoring a backup leaves a workout in progress on this device alone', async () => {
      const active = Session.freeformSession(LocalDate.of(2026, 4, 10), undefined);
      const testBed = bed({ state: { storedSessions: { sessions: { [active.id]: active } } } as Partial<RootState> });
      await testBed.dispatchHandled(setActiveSessionId(active.id));

      await testBed.dispatchHandled(upsertStoredSessions([active]));

      const [row] = await db.select().from(workoutsSchema).where(eq(workoutsSchema.id, active.id));
      expect(row?.active).toBe(true);
    });
  });

  it('persists restored exercises', async () => {
    const exercise = {
      name: 'Custom exercise',
      force: null,
      level: '',
      mechanic: null,
      equipment: null,
      muscles: [],
      instructions: '',
      category: '',
    };
    const testBed = bed({});

    await testBed.dispatchHandled(upsertExercises({ custom: exercise }));

    const [row] = await db.select().from(exercisesSchema).where(eq(exercisesSchema.id, 'custom'));
    expect(row?.payload).toEqual(exercise);
  });

  describe('setExercises', () => {
    const exercise = (name: string) => ({
      name,
      force: null,
      level: '',
      mechanic: null,
      equipment: null,
      muscles: [],
      instructions: '',
      category: '',
    });
    const hydrated = {
      storedSessions: { sessions: {}, activeSessionId: undefined, isHydrated: true },
    } as Partial<RootState>;

    it('replaces the stored exercises', async () => {
      await db.insert(exercisesSchema).values({ id: 'old', payload: exercise('Old') });

      await bed({ state: hydrated }).dispatchHandled(setExercises({ fresh: exercise('Fresh') }));

      expect((await db.select().from(exercisesSchema)).map((r) => r.id)).toEqual(['fresh']);
    });

    it('clears the table when given no exercises', async () => {
      await db.insert(exercisesSchema).values({ id: 'old', payload: exercise('Old') });

      await bed({ state: hydrated }).dispatchHandled(setExercises({}));

      expect(await db.select().from(exercisesSchema)).toHaveLength(0);
    });

    it('keeps the old exercises when writing the new ones fails', async () => {
      await db.insert(exercisesSchema).values({ id: 'old', payload: exercise('Old') });
      // A genuine SQLite failure partway through: the delete succeeds, then the insert aborts.
      // Typed as the synchronous expo driver; under Vitest `run()` returns a promise.
      await Promise.resolve(
        db.run(
          sql.raw(
            `CREATE TRIGGER reject_exercise BEFORE INSERT ON exercise WHEN NEW.id = 'bad' BEGIN SELECT RAISE(ABORT, 'rejected'); END`,
          ),
        ),
      );

      logger.error.mockClear();
      await bed({ state: hydrated }).dispatchHandled(setExercises({ good: exercise('Good'), bad: exercise('Bad') }));

      expect(logger.error).toHaveBeenCalled();
      expect((await db.select().from(exercisesSchema)).map((r) => r.id)).toEqual(['old']);
    });
  });

  describe('sessionFinished', () => {
    it('queues the session for the feed, clears the active pointer and marks stats dirty', async () => {
      const session = Session.freeformSession(LocalDate.of(2026, 4, 10), undefined);
      const testBed = bed({
        state: {
          storedSessions: { sessions: { [session.id]: session }, activeSessionId: session.id },
        } as Partial<RootState>,
      });

      await testBed.dispatchHandled(sessionFinished(session.id));

      expect(testBed.getDispatchedAction(addUnpublishedSessionId).payload).toBe(session.id);
      expect(testBed.getDispatchedAction(setStatsIsDirty).payload).toBe(true);
      expect(testBed.getDispatchedAction(setActiveSessionId).payload).toBeUndefined();
    });

    it('adds the stub exercises it logged to the exercise list, so they can be renamed', async () => {
      const placeholder = makeWeightedBlueprint({ name: 'New Exercise' });
      const known = makeWeightedBlueprint({ name: 'Squat', exerciseId: 'user-1' });
      const untouched = makeWeightedBlueprint({ name: 'Skipped' });
      const logged = (blueprint: typeof placeholder) =>
        new RecordedWeightedExercise(blueprint, [filledPotentialSet(10, tick())], undefined);
      const session = makeSession([placeholder, known, untouched])
        .withExercise(0, logged(placeholder))
        .withExercise(1, logged(known));
      const testBed = bed({
        state: {
          storedSessions: {
            sessions: { [session.id]: session },
            activeSessionId: session.id,
            savedExercises: { 'user-1': { ...stubDescriptor('Squat') } },
            builtInExercises: {},
          },
        } as unknown as Partial<RootState>,
      });

      await testBed.dispatchHandled(sessionFinished(session.id));

      expect(testBed.getDispatchedAction(upsertExercises).payload).toEqual({
        [placeholder.exerciseId]: stubDescriptor('New Exercise'),
      });
    });

    it('drops an RPE left on a set that was never logged, keeping logged ones', async () => {
      const blueprint = makeWeightedBlueprint();
      const exercise = new RecordedWeightedExercise(
        blueprint,
        [filledPotentialSet(10, tick()).with({ rpe: 8 }), emptyPotentialSet().with({ rpe: 9 })],
        undefined,
      );
      const session = makeSession([blueprint]).withExercise(0, exercise);
      const testBed = bed({
        state: {
          storedSessions: { sessions: { [session.id]: session }, activeSessionId: session.id },
        } as Partial<RootState>,
      });

      await testBed.dispatchHandled(sessionFinished(session.id));

      const { sessionId, update } = testBed.getDispatchedAction(updateStoredSession).payload;
      expect(sessionId).toBe(session.id);
      const cleaned = update(session).recordedExercises[0] as RecordedWeightedExercise;
      expect(cleaned.potentialSets.map((s) => s.rpe)).toEqual([8, undefined]);
    });

    it('leaves a session with no stray RPE untouched', async () => {
      const session = Session.freeformSession(LocalDate.of(2026, 4, 10), undefined);
      const testBed = bed({
        state: {
          storedSessions: { sessions: { [session.id]: session }, activeSessionId: session.id },
        } as Partial<RootState>,
      });

      await testBed.dispatchHandled(sessionFinished(session.id));

      testBed.expectNotDispatched(updateStoredSession);
    });

    it('leaves the active pointer alone when finishing some other session', async () => {
      const active = Session.freeformSession(LocalDate.of(2026, 4, 10), undefined);
      const edited = Session.freeformSession(LocalDate.of(2026, 3, 1), undefined);
      const testBed = bed({
        state: {
          storedSessions: {
            sessions: { [active.id]: active, [edited.id]: edited },
            activeSessionId: active.id,
          },
        } as Partial<RootState>,
      });

      await testBed.dispatchHandled(sessionFinished(edited.id));

      testBed.expectNotDispatched(setActiveSessionId);
    });

    it('exports to the health aggregator exactly once, not once per recorded set', async () => {
      const session = Session.freeformSession(LocalDate.of(2026, 4, 10), undefined);
      const exportWorkout = vi.fn();
      const testBed = createAddEffectTestBed({
        initialState: {
          settings: { isHydrated: true, exportToHealthAggregator: true },
          storedSessions: { sessions: { [session.id]: session }, activeSessionId: session.id },
        } as Partial<RootState>,
        services: {
          db,
          workoutRepository: new WorkoutRepository(db),
          logger,
          keyValueStore: makeKvStore(),
          healthExportService: { canExport: () => true, exportWorkout },
        },
      });
      applyStoredSessionsEffects(testBed.addEffect);

      await testBed.dispatchHandled(putStoredSession(session));
      await testBed.dispatchHandled(putStoredSession(session));
      expect(exportWorkout).not.toHaveBeenCalled();

      await testBed.dispatchHandled(sessionFinished(session.id));
      expect(exportWorkout).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleting a finished session and undoing it', () => {
    it('removes it from the health aggregator, then exports it again when it is put back and finished', async () => {
      const session = Session.freeformSession(LocalDate.of(2026, 4, 10), undefined);
      const calls: string[] = [];
      const healthExportService = {
        canExport: () => true,
        deleteWorkout: vi.fn(async (id: string) => {
          calls.push(`delete ${id}`);
        }),
        exportWorkout: vi.fn(async (workout: Session) => {
          calls.push(`export ${workout.id}`);
        }),
      };
      const testBed = createAddEffectTestBed({
        initialState: {
          settings: { isHydrated: true, exportToHealthAggregator: true },
          storedSessions: { sessions: { [session.id]: session }, activeSessionId: undefined },
        } as Partial<RootState>,
        services: {
          db,
          workoutRepository: new WorkoutRepository(db),
          logger,
          keyValueStore: makeKvStore(),
          healthExportService,
        },
      });
      applyStoredSessionsEffects(testBed.addEffect);

      await testBed.dispatchHandled(deleteStoredSession(session.id));
      expect(calls).toEqual([`delete ${session.id}`]);

      await testBed.dispatchHandled(putStoredSession(session));
      await testBed.dispatchHandled(sessionFinished(session.id));
      expect(calls).toEqual([`delete ${session.id}`, `export ${session.id}`]);
      expect(healthExportService.exportWorkout).toHaveBeenCalledWith(session);
    });
  });

  describe('hydration', () => {
    it('restores the active session from the table on a later launch', async () => {
      const session = Session.freeformSession(LocalDate.of(2026, 4, 10), undefined);
      await new WorkoutRepository(db).setActive(session);
      const testBed = bed({});

      await testBed.dispatchHandled(initializeStoredSessionsStateSlice());

      expect(Object.keys(testBed.getDispatchedAction(setStoredSessions).payload)).toEqual([session.id]);
      expect(testBed.getDispatchedAction(setActiveSessionId).payload).toBe(session.id);
    });

    it('does not claim an active session when none was in progress', async () => {
      await new WorkoutRepository(db).put(Session.freeformSession(LocalDate.of(2026, 4, 10), undefined));
      const testBed = bed({});

      await testBed.dispatchHandled(initializeStoredSessionsStateSlice());

      testBed.expectNotDispatched(setActiveSessionId);
    });
  });

  describe('updateStoredSession', () => {
    async function startedWorkout() {
      const workoutRepository = new WorkoutRepository(db);
      const put = vi.spyOn(workoutRepository, 'put');
      const harness = createEffectStore({ db, workoutRepository, logger: logger as never });
      applyStoredSessionsEffects(harness.addEffect);
      harness.store.dispatch(setSettingsIsHydrated(true));
      const blueprint = makeWeightedBlueprint();
      const session = makeSession([blueprint]);
      harness.store.dispatch(putStoredSession(session));
      await harness.settle();
      put.mockClear();
      return { harness, put, session };
    }

    it('writes the workout when a set is recorded', async () => {
      const { harness, put, session } = await startedWorkout();

      harness.store.dispatch(
        updateStoredSession({ sessionId: session.id, update: (s) => s.withCycledExerciseReps(0, 0, tick()) }),
      );
      await harness.settle();

      expect(put).toHaveBeenCalledTimes(1);
      const { workouts } = await new WorkoutRepository(db).loadAll();
      const stored = workouts[0]!.recordedExercises[0] as RecordedWeightedExercise;
      expect(stored.potentialSets[0]!.set).toBeDefined();
    });

    it('writes nothing when only the rest timer changes', async () => {
      const { harness, put, session } = await startedWorkout();

      harness.store.dispatch(
        updateStoredSession({
          sessionId: session.id,
          update: (s) => s.with({ restTimer: new RestTimer(tick(), Duration.ofSeconds(60)) }),
        }),
      );
      await harness.settle();

      expect(put).not.toHaveBeenCalled();
    });
  });
});

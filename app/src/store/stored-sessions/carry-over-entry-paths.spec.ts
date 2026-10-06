import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { Duration, LocalDate, OffsetDateTime, ZoneOffset } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import {
  CardioExerciseBlueprint,
  CardioExerciseSetBlueprint,
  ExerciseBlueprint,
  ProgressionRule,
  SessionBlueprint,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import {
  PotentialSet,
  RecordedCardioExercise,
  RecordedCardioExerciseSet,
  RecordedSet,
  RecordedWeightedExercise,
  Session,
} from '@/models/session-models';
import { Weight } from '@/models/weight';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { PickedExerciseRef } from '@/models/exercise-pick';
import { createEffectStore } from '@/utils/__test__/effect-store';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import {
  deleteStoredSession,
  initializeStoredSessionsStateSlice,
  putStoredSession,
  selectLatestExercises,
  setActiveSessionId,
  updateStoredSession,
} from '@/store/stored-sessions';
import { setIsHydrated as setSettingsIsHydrated } from '@/store/settings';
import { SessionService } from '@/services/session-service';
import { withAddedSet } from '@/models/session-models/set-entry';
import { carriedFrom, todaysTarget } from '@/models/session-models/todays-target';
import { repeatBlueprint } from '@/models/workout-detail';
import { createWorkoutExerciseChanges } from '@/store/stored-sessions/workout-exercise-changes';

/**
 * Every way an exercise enters a workout opens it on the numbers a routine would: the latest performance
 * of its lineage, carried over and progressed. Driven through the store, over real SQLite, as the app does.
 */
vi.stubEnv('TZ', 'UTC');

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  time: async (_: string, action: () => unknown) => action(),
};

const lunge = makeWeightedBlueprint({ name: 'Lunge', exerciseId: 'Lunge', sets: 3, progression: [] });

/** A finished workout of `exercises`, every set logged on `date` at 10:00. */
function pastWorkout(
  id: string,
  date: LocalDate,
  exercises: { blueprint: WeightedExerciseBlueprint; kg: number; reps: number[] }[],
): Session {
  const at = (exercise: number) => (set: number) =>
    OffsetDateTime.of(date.year(), date.monthValue(), date.dayOfMonth(), 10, exercise, set, 0, ZoneOffset.UTC);
  return new Session(
    id,
    new SessionBlueprint(
      'Workout',
      exercises.map((x) => x.blueprint),
      '',
    ),
    exercises.map((x, index) => makeRecordedExercise(x.blueprint, x.reps, new Weight(x.kg, 'kilograms'), at(index))),
    date,
    undefined,
    undefined,
  );
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
  harness.store.dispatch(setSettingsIsHydrated(true));
  harness.store.dispatch(initializeStoredSessionsStateSlice());
  await harness.settle();
  return { ...harness, workoutRepository, logger };
}

type App = Awaited<ReturnType<typeof startApp>>;

const serviceOf = (app: App) => new SessionService(app.workoutRepository, app.getState);
const changesOf = (app: App) =>
  createWorkoutExerciseChanges({
    store: { getState: app.getState, dispatch: app.store.dispatch },
    services: app,
  });

/** Starts a freeform workout, as the Home screen's empty workout does. */
async function startFreeform(app: App): Promise<string> {
  const session = Session.freeformSession(LocalDate.of(2026, 10, 4), undefined);
  app.store.dispatch(putStoredSession(session));
  app.store.dispatch(setActiveSessionId(session.id));
  await app.settle();
  return session.id;
}

/**
 * What `useAddExercise` dispatches when the picker hands back a pick. The app does not wait for it before
 * the next tap; the promise is for a test to wait on.
 */
function startAdding(
  app: App,
  sessionId: string,
  picked: PickedExerciseRef[],
  onAdded?: (firstIndex: number) => void,
): Promise<void> {
  return changesOf(app).add({ sessionId, picked, asSuperset: false, onAdded });
}

async function addThroughPicker(app: App, sessionId: string, picked: PickedExerciseRef[]) {
  await startAdding(app, sessionId, picked);
  await app.settle();
}

function setsOf(app: App, sessionId: string, index: number) {
  const exercise = app.getState().storedSessions.sessions[sessionId]!.recordedExercises[index];
  if (!(exercise instanceof RecordedWeightedExercise)) {
    throw new Error(`exercise ${index} is not weighted`);
  }
  return exercise.potentialSets.map((slot) => ({
    kg: slot.weight.value.toNumber(),
    unit: slot.weight.unit,
    reps: slot.target.min,
    logged: !!slot.set,
  }));
}

function weightedBlueprintOf(app: App, sessionId: string, index: number): WeightedExerciseBlueprint {
  const blueprint = app.getState().storedSessions.sessions[sessionId]?.recordedExercises[index]?.blueprint;
  if (!(blueprint instanceof WeightedExerciseBlueprint)) {
    throw new Error(`exercise ${index} is not weighted`);
  }
  return blueprint;
}

const opened = (kg: number, reps: number, count = 3) =>
  Array.from({ length: count }, () => ({ kg, unit: 'kilograms', reps, logged: false }));

function delayNextLatestRead(app: App) {
  let release = () => {};
  let markStarted = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const latestPerLineage = app.workoutRepository.latestPerLineage.bind(app.workoutRepository);
  vi.spyOn(app.workoutRepository, 'latestPerLineage').mockImplementationOnce(async (options) => {
    const result = await latestPerLineage(options);
    markStarted();
    await gate;
    return result;
  });
  return { started, release };
}

describe('adding an exercise through the picker (PM-41)', () => {
  it('calls onAdded synchronously after a cached add has mutated the workout', async () => {
    const app = await startApp([]);
    const sessionId = await startFreeform(app);
    const observed: [number, number][] = [];

    const adding = startAdding(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }], (firstIndex) => {
      observed.push([firstIndex, app.getState().storedSessions.sessions[sessionId]!.recordedExercises.length]);
    });

    expect(app.getState().storedSessions.sessions[sessionId]!.recordedExercises).toHaveLength(1);
    expect(observed).toEqual([[0, 1]]);
    await adding;
  });

  it('opens on the weight and reps last time carried, as a routine would', async () => {
    const app = await startApp([
      pastWorkout('sep-28', LocalDate.of(2026, 9, 28), [{ blueprint: lunge, kg: 45, reps: [10, 10, 10] }]),
    ]);
    const sessionId = await startFreeform(app);

    await addThroughPicker(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }]);

    expect(setsOf(app, sessionId, 0)).toEqual(opened(45, 10));
  });

  it('opens an exercise never done at 0', async () => {
    const app = await startApp([
      pastWorkout('sep-28', LocalDate.of(2026, 9, 28), [{ blueprint: lunge, kg: 45, reps: [10, 10, 10] }]),
    ]);
    const sessionId = await startFreeform(app);

    await addThroughPicker(app, sessionId, [{ id: 'Deadlift', name: 'Deadlift' }]);

    expect(setsOf(app, sessionId, 0)).toEqual(opened(0, 10));
  });

  it('opens a second place of an exercise on that place last time', async () => {
    const app = await startApp([
      pastWorkout('sep-28', LocalDate.of(2026, 9, 28), [
        { blueprint: lunge, kg: 45, reps: [10, 10, 10] },
        { blueprint: lunge, kg: 30, reps: [10, 10, 10] },
      ]),
    ]);
    const sessionId = await startFreeform(app);

    await addThroughPicker(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }]);
    await addThroughPicker(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }]);

    expect(setsOf(app, sessionId, 0)).toEqual(opened(45, 10));
    expect(setsOf(app, sessionId, 1)).toEqual(opened(30, 10));
  });

  it('opens a second place never done as one on the first place last time', async () => {
    const app = await startApp([
      pastWorkout('sep-28', LocalDate.of(2026, 9, 28), [{ blueprint: lunge, kg: 45, reps: [10, 10, 10] }]),
    ]);
    const sessionId = await startFreeform(app);

    await addThroughPicker(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }]);
    await addThroughPicker(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }]);

    expect(setsOf(app, sessionId, 1)).toEqual(opened(45, 10));
  });

  describe('when the workout has already logged it', () => {
    /** A freeform workout with Lunge added and a set of it logged at 60 kg: the cache's Lunge is now its own. */
    async function lungeLoggedToday() {
      const app = await startApp([
        pastWorkout('sep-28', LocalDate.of(2026, 9, 28), [{ blueprint: lunge, kg: 45, reps: [10, 10, 10] }]),
      ]);
      const sessionId = await startFreeform(app);
      await addThroughPicker(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }]);
      app.store.dispatch(
        updateStoredSession({
          sessionId,
          update: (s) => {
            const exercise = s.recordedExercises[0] as RecordedWeightedExercise;
            return s
              .withExercise(0, exercise.withWeight(0, new Weight(60, 'kilograms'), 'allSets'))
              .withCycledExerciseReps(0, 0, OffsetDateTime.of(2026, 10, 4, 9, 0, 0, 0, ZoneOffset.UTC));
          },
        }),
      );
      await app.settle();
      expect(app.getState().storedSessions.latestExerciseWorkoutIds[lunge.progressionKey()]).toBe(sessionId);
      return { app, sessionId };
    }

    it('opens a second Lunge on the last workout, not on today', async () => {
      const { app, sessionId } = await lungeLoggedToday();

      await addThroughPicker(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }]);

      expect(setsOf(app, sessionId, 1)).toEqual(opened(45, 10));
    });

    it('opens it on the last workout when removed and added straight back', async () => {
      const { app, sessionId } = await lungeLoggedToday();

      // Added again before the removal's write lands, while the cache still holds today's set.
      app.store.dispatch(updateStoredSession({ sessionId, update: (s) => s.withRemovedExercise(0) }));
      await addThroughPicker(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }]);

      expect(setsOf(app, sessionId, 0)).toEqual(opened(45, 10));
    });

    it('lands in the workout it was picked for when another starts during the read', async () => {
      const { app, sessionId } = await lungeLoggedToday();

      const adding = addThroughPicker(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }]);
      const next = Session.freeformSession(LocalDate.of(2026, 10, 4), undefined);
      app.store.dispatch(putStoredSession(next));
      app.store.dispatch(setActiveSessionId(next.id));
      await adding;

      expect(app.getState().storedSessions.sessions[next.id]!.recordedExercises).toHaveLength(0);
      expect(setsOf(app, sessionId, 1)).toEqual(opened(45, 10));
    });

    it('adds in tap order when the first add waits on the read and the next does not', async () => {
      const { app, sessionId } = await lungeLoggedToday();

      const adding = [
        startAdding(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }]),
        startAdding(app, sessionId, [{ id: 'Row', name: 'Row' }]),
      ];
      await Promise.all(adding);
      await app.settle();

      const session = app.getState().storedSessions.sessions[sessionId]!;
      expect(session.recordedExercises.map((x) => x.blueprint.name)).toEqual(['Lunge', 'Lunge', 'Row']);
      expect(setsOf(app, sessionId, 1)).toEqual(opened(45, 10));
    });

    it('does not add or call onAdded when the workout disappears during the read', async () => {
      const { app, sessionId } = await lungeLoggedToday();
      const delayed = delayNextLatestRead(app);
      const onAdded = vi.fn();

      const adding = startAdding(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }], onAdded);
      await delayed.started;
      app.store.dispatch(deleteStoredSession(sessionId));
      delayed.release();
      await adding;
      await app.settle();

      expect(app.getState().storedSessions.sessions[sessionId]).toBeUndefined();
      expect(onAdded).not.toHaveBeenCalled();
    });

    it("opens on today's numbers, and logs why, when the read fails", async () => {
      const { app, sessionId } = await lungeLoggedToday();
      const failure = new Error('database is locked');
      const failingRepository = { latestPerLineage: () => Promise.reject(failure) };
      logger.error.mockClear();
      const changes = createWorkoutExerciseChanges({
        store: { getState: app.getState, dispatch: app.store.dispatch },
        services: { workoutRepository: failingRepository, logger },
      });

      await changes.add({
        sessionId,
        picked: [{ id: 'Lunge', name: 'Lunge' }],
        asSuperset: false,
      });
      await app.settle();

      expect(setsOf(app, sessionId, 1)).toEqual(opened(60, 10));
      expect(logger.error).toHaveBeenCalledWith(
        `Couldn't read last time for ${lunge.progressionKey()}; opening on the cache`,
        failure,
      );
    });

    it('swaps in an exercise whose plan got a set added while it was read', async () => {
      const { app, sessionId } = await lungeLoggedToday();
      await addThroughPicker(app, sessionId, [{ id: 'Bench Press', name: 'Bench Press' }]);

      const swapping = startSwapping(app, sessionId, 1, { id: 'Lunge', name: 'Lunge' });
      // The live set table's Add set, tapped on the exercise before the swap lands.
      app.store.dispatch(
        updateStoredSession({
          sessionId,
          update: (s) => {
            const exercise = s.recordedExercises[1] as RecordedWeightedExercise;
            return s.withExercise(1, withAddedSet({ exercise, drafts: {} }, 'kilograms').exercise);
          },
        }),
      );
      await swapping;
      await app.settle();

      const session = app.getState().storedSessions.sessions[sessionId]!;
      expect(session.recordedExercises.map((x) => x.blueprint.name)).toEqual(['Lunge', 'Lunge']);
      expect(setsOf(app, sessionId, 1)).toEqual(opened(45, 10, 4));
    });

    it('does not apply a delayed swap after the movement at that place changes', async () => {
      const { app, sessionId } = await lungeLoggedToday();
      await addThroughPicker(app, sessionId, [{ id: 'Bench Press', name: 'Bench Press' }]);
      const delayed = delayNextLatestRead(app);

      const swapping = startSwapping(app, sessionId, 1, { id: 'Lunge', name: 'Lunge' });
      await delayed.started;
      app.store.dispatch(
        updateStoredSession({
          sessionId,
          update: (s) => s.withEditedExercise(1, bench.with({ name: 'Row', exerciseId: 'Row' }), false),
        }),
      );
      await app.settle();
      delayed.release();
      await swapping;
      await app.settle();

      expect(app.getState().storedSessions.sessions[sessionId]!.recordedExercises[1]!.blueprint.exerciseId).toBe('Row');
    });

    it('swaps in an exercise it already logged on the last workout', async () => {
      const { app, sessionId } = await lungeLoggedToday();
      await addThroughPicker(app, sessionId, [{ id: 'Bench Press', name: 'Bench Press' }]);

      await swapThroughPicker(app, sessionId, 1, { id: 'Lunge', name: 'Lunge' });

      expect(setsOf(app, sessionId, 1)).toEqual(opened(45, 10));
    });
  });
});

/**
 * What the live exercise card's Swap dispatches when the picker hands back an exercise. The app does not
 * wait for it; the promise is for a test to wait on.
 */
function startSwapping(app: App, sessionId: string, index: number, picked: PickedExerciseRef): Promise<void> {
  return changesOf(app).swap({ sessionId, index, picked });
}

async function swapThroughPicker(app: App, sessionId: string, index: number, picked: PickedExerciseRef) {
  await startSwapping(app, sessionId, index, picked);
  await app.settle();
}

function startEditing(app: App, sessionId: string, index: number, updated: ExerciseBlueprint): Promise<void> {
  return changesOf(app).edit({ sessionId, index, updated });
}

async function editThroughEditor(app: App, sessionId: string, index: number, updated: ExerciseBlueprint) {
  await startEditing(app, sessionId, index, updated);
  await app.settle();
}

const bench = makeWeightedBlueprint({ name: 'Bench Press', exerciseId: 'Bench Press', sets: 3, progression: [] });

async function delayedEditorMovementEdit() {
  const app = await startApp([
    pastWorkout('sep-28', LocalDate.of(2026, 9, 28), [{ blueprint: lunge, kg: 45, reps: [10, 10, 10] }]),
  ]);
  const sessionId = await startFreeform(app);
  await addThroughPicker(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }]);
  app.store.dispatch(
    updateStoredSession({
      sessionId,
      update: (s) => s.withCycledExerciseReps(0, 0, OffsetDateTime.of(2026, 10, 4, 9, 0, 0, 0, ZoneOffset.UTC)),
    }),
  );
  await app.settle();
  await addThroughPicker(app, sessionId, [{ id: 'Bench Press', name: 'Bench Press' }]);
  const edited = weightedBlueprintOf(app, sessionId, 1);
  const delayed = delayNextLatestRead(app);
  const editing = startEditing(app, sessionId, 1, edited.with({ name: 'Lunge', exerciseId: 'Lunge' }));
  await delayed.started;
  return { app, sessionId, delayed, editing };
}

describe('swapping an exercise (PM-41)', () => {
  it('opens the exercise swapped in on its own carried weight, as an add would', async () => {
    const app = await startApp([
      pastWorkout('sep-28', LocalDate.of(2026, 9, 28), [
        { blueprint: bench, kg: 80, reps: [10, 10, 10] },
        { blueprint: lunge, kg: 45, reps: [10, 10, 10] },
      ]),
    ]);
    const sessionId = await startFreeform(app);
    await addThroughPicker(app, sessionId, [{ id: 'Bench Press', name: 'Bench Press' }]);
    expect(setsOf(app, sessionId, 0)).toEqual(opened(80, 10));

    await swapThroughPicker(app, sessionId, 0, { id: 'Lunge', name: 'Lunge' });

    const session = app.getState().storedSessions.sessions[sessionId]!;
    expect(session.blueprint.exercises.map((x) => x.exerciseId)).toEqual(['Lunge']);
    expect(setsOf(app, sessionId, 0)).toEqual(opened(45, 10));
  });

  it('keeps the sets already logged and opens the rest on the carried weight', async () => {
    const app = await startApp([
      pastWorkout('sep-28', LocalDate.of(2026, 9, 28), [
        { blueprint: bench, kg: 80, reps: [10, 10, 10] },
        { blueprint: lunge, kg: 45, reps: [10, 10, 10] },
      ]),
    ]);
    const sessionId = await startFreeform(app);
    await addThroughPicker(app, sessionId, [{ id: 'Bench Press', name: 'Bench Press' }]);
    app.store.dispatch(
      updateStoredSession({
        sessionId,
        update: (s) => s.withCycledExerciseReps(0, 0, OffsetDateTime.of(2026, 10, 4, 9, 0, 0, 0, ZoneOffset.UTC)),
      }),
    );
    await app.settle();

    await swapThroughPicker(app, sessionId, 0, { id: 'Lunge', name: 'Lunge' });

    expect(setsOf(app, sessionId, 0)).toEqual([
      { kg: 80, unit: 'kilograms', reps: 10, logged: true },
      { kg: 45, unit: 'kilograms', reps: 10, logged: false },
      { kg: 45, unit: 'kilograms', reps: 10, logged: false },
    ]);
  });

  it("opens an exercise picked in the exercise editor as a swap does, and keeps today's numbers for other edits", async () => {
    const app = await startApp([
      pastWorkout('sep-28', LocalDate.of(2026, 9, 28), [
        { blueprint: bench, kg: 80, reps: [10, 10, 10] },
        { blueprint: lunge, kg: 45, reps: [10, 10, 10] },
      ]),
    ]);
    const sessionId = await startFreeform(app);
    await addThroughPicker(app, sessionId, [{ id: 'Bench Press', name: 'Bench Press' }]);
    const beforeSetEdit = weightedBlueprintOf(app, sessionId, 0);
    await editThroughEditor(app, sessionId, 0, beforeSetEdit.with({ sets: 4 }));
    expect(setsOf(app, sessionId, 0)).toEqual(opened(80, 10, 4));

    const beforeMovementEdit = weightedBlueprintOf(app, sessionId, 0);
    await editThroughEditor(app, sessionId, 0, beforeMovementEdit.with({ name: 'Lunge', exerciseId: 'Lunge' }));
    expect(setsOf(app, sessionId, 0)).toEqual(opened(45, 10, 4));
  });

  it('does not apply a delayed editor draft after that exercise blueprint changes', async () => {
    const { app, sessionId, delayed, editing } = await delayedEditorMovementEdit();
    app.store.dispatch(
      updateStoredSession({
        sessionId,
        update: (s) => s.withEditedExercise(1, bench.with({ sets: 4 }), false),
      }),
    );
    await app.settle();

    delayed.release();
    await editing;
    await app.settle();

    expect(app.getState().storedSessions.sessions[sessionId]!.recordedExercises[1]!.blueprint.exerciseId).toBe(
      'Bench Press',
    );
    expect(setsOf(app, sessionId, 1)).toEqual(opened(0, 10, 4));
  });

  it('does not apply a delayed editor draft after the exercise is removed', async () => {
    const { app, sessionId, delayed, editing } = await delayedEditorMovementEdit();
    app.store.dispatch(updateStoredSession({ sessionId, update: (s) => s.withRemovedExercise(1) }));
    await app.settle();

    delayed.release();
    await editing;
    await app.settle();

    expect(
      app.getState().storedSessions.sessions[sessionId]!.recordedExercises.map((x) => x.blueprint.exerciseId),
    ).toEqual(['Lunge']);
  });

  it('does not restore a workout closed during a delayed editor read', async () => {
    const { app, sessionId, delayed, editing } = await delayedEditorMovementEdit();
    app.store.dispatch(deleteStoredSession(sessionId));
    delayed.release();
    await editing;
    await app.settle();

    expect(app.getState().storedSessions.sessions[sessionId]).toBeUndefined();
  });

  it('edits the same movement without a read and retains its logged sets', async () => {
    const app = await startApp([]);
    const sessionId = await startFreeform(app);
    await addThroughPicker(app, sessionId, [{ id: 'Bench Press', name: 'Bench Press' }]);
    app.store.dispatch(
      updateStoredSession({
        sessionId,
        update: (s) => s.withCycledExerciseReps(0, 0, OffsetDateTime.of(2026, 10, 4, 9, 0, 0, 0, ZoneOffset.UTC)),
      }),
    );
    await app.settle();
    const latestPerLineage = vi.spyOn(app.workoutRepository, 'latestPerLineage');
    const current = weightedBlueprintOf(app, sessionId, 0);

    await editThroughEditor(app, sessionId, 0, current.with({ sets: 4 }));

    expect(latestPerLineage).not.toHaveBeenCalled();
    expect(setsOf(app, sessionId, 0)).toEqual([
      { kg: 0, unit: 'kilograms', reps: 10, logged: true },
      ...opened(0, 10, 3),
    ]);
  });

  it('carries incline and resistance into a cardio exercise swapped in', async () => {
    const machineSet = new CardioExerciseSetBlueprint(
      { type: 'time', value: Duration.ofMinutes(20) },
      true,
      false,
      true,
      true,
      false,
      false,
      undefined,
    );
    const treadmill = new CardioExerciseBlueprint('Treadmill', [machineSet], '', '', 'Treadmill');
    const bike = new CardioExerciseBlueprint('Bike', [machineSet], '', '', 'Bike');
    const lastBike = RecordedCardioExercise.empty(bike).with({
      sets: [
        RecordedCardioExerciseSet.empty(machineSet).with({
          completionDateTime: OffsetDateTime.of(2026, 9, 28, 10, 0, 0, 0, ZoneOffset.UTC),
          duration: Duration.ofMinutes(20),
          incline: BigNumber(3),
          resistance: BigNumber(7),
        }),
      ],
    });
    const cardio = (exercise: CardioExerciseBlueprint) => new SessionBlueprint('Cardio', [exercise], '');
    const app = await startApp([
      new Session('sep-28', cardio(bike), [lastBike], LocalDate.of(2026, 9, 28), undefined, undefined),
    ]);
    const live = new Session(
      'live',
      cardio(treadmill),
      [RecordedCardioExercise.empty(treadmill)],
      LocalDate.of(2026, 10, 4),
      undefined,
      undefined,
    );
    app.store.dispatch(putStoredSession(live));
    app.store.dispatch(setActiveSessionId(live.id));
    await app.settle();

    await swapThroughPicker(app, live.id, 0, { id: 'Bike', name: 'Bike' });

    const swapped = app.getState().storedSessions.sessions[live.id]!.recordedExercises[0] as RecordedCardioExercise;
    expect(swapped.blueprint.exerciseId).toBe('Bike');
    expect(
      swapped.sets.map((set) => [set.incline?.toNumber(), set.resistance?.toNumber(), !!set.completionDateTime]),
    ).toEqual([[3, 7, false]]);
  });
});

/** What the workout detail's Do again starts, for the past workout `id` read from the tables. */
async function doAgain(app: App, id: string): Promise<Session> {
  const past = await app.workoutRepository.get(id);
  return serviceOf(app).repeatSession(past!);
}

function weightsOf(session: Session) {
  return session.recordedExercises.map((exercise) =>
    exercise instanceof RecordedWeightedExercise
      ? exercise.potentialSets.map((slot) => `${slot.weight.value.toNumber()}x${slot.target.min}`)
      : [],
  );
}

const row = makeWeightedBlueprint({
  name: 'Row',
  exerciseId: 'Row',
  sets: 3,
  repsConfig: { type: 'fixed', reps: 8 },
  progression: [],
});

describe('Do again (PM-42)', () => {
  const benchFives = makeWeightedBlueprint({
    name: 'Bench Press',
    exerciseId: 'Bench Press',
    sets: 4,
    repsConfig: { type: 'fixed', reps: 5 },
    progression: [],
  });
  const benchEights = benchFives.with({ sets: 3, repsConfig: { type: 'fixed', reps: 8 } });

  it("opens each exercise on the latest weight, in the chosen workout's order, sets and reps", async () => {
    const app = await startApp([
      pastWorkout('sep-14', LocalDate.of(2026, 9, 14), [
        { blueprint: benchFives, kg: 80, reps: [5, 5, 5, 5] },
        { blueprint: row, kg: 60, reps: [8, 8, 8] },
      ]),
      pastWorkout('sep-25', LocalDate.of(2026, 9, 25), [{ blueprint: benchEights, kg: 82.5, reps: [8, 8, 8] }]),
    ]);

    const again = await doAgain(app, 'sep-14');

    expect(again.blueprint.exercises.map((x) => x.name)).toEqual(['Bench Press', 'Row']);
    expect(weightsOf(again)).toEqual([
      ['82.5x5', '82.5x5', '82.5x5', '82.5x5'],
      ['60x8', '60x8', '60x8'],
    ]);
    expect(again.isStarted).toBe(false);
  });

  it('keeps the rep targets that workout had, though they were changed for that day only', async () => {
    // Sep 14's plan said 3 × 5, but that day each set's target was turned down to 3.
    const day = (set: number) => OffsetDateTime.of(2026, 9, 14, 10, 0, set, 0, ZoneOffset.UTC);
    const threes = new RecordedWeightedExercise(
      benchFives.with({ sets: 3 }),
      [0, 1, 2].map((set) =>
        PotentialSet.of({
          weight: new Weight(90, 'kilograms'),
          target: { min: 3, max: 3 },
          set: RecordedSet.of({ repsCompleted: 3, completionDateTime: day(set) }),
        }),
      ),
      undefined,
    );
    const sep14 = new Session(
      'sep-14',
      new SessionBlueprint('Push', [threes.blueprint], ''),
      [threes],
      LocalDate.of(2026, 9, 14),
      undefined,
      undefined,
    );
    const app = await startApp([
      sep14,
      pastWorkout('sep-25', LocalDate.of(2026, 9, 25), [{ blueprint: benchFives, kg: 82.5, reps: [5, 5, 5, 5] }]),
    ]);

    expect(weightsOf(await doAgain(app, 'sep-14'))).toEqual([['82.5x3', '82.5x3', '82.5x3']]);
  });

  it('applies the progression the latest performance earned, as a routine would', async () => {
    const progressing = benchFives.with({ progression: [ProgressionRule.load(BigNumber(2.5))] });
    const app = await startApp([
      pastWorkout('sep-14', LocalDate.of(2026, 9, 14), [{ blueprint: progressing, kg: 80, reps: [5, 5, 5, 5] }]),
      pastWorkout('sep-25', LocalDate.of(2026, 9, 25), [{ blueprint: progressing, kg: 82.5, reps: [5, 5, 5, 5] }]),
      pastWorkout('sep-28', LocalDate.of(2026, 9, 28), [{ blueprint: row, kg: 60, reps: [8, 8, 8] }]),
    ]);

    expect(weightsOf(await doAgain(app, 'sep-14'))).toEqual([['85x5', '85x5', '85x5', '85x5']]);
  });
});

/**
 * What the live workout's Previous line and today's target read for exercise `index`: the latest
 * performance per lineage before the workout, as `PreviousPerformancesProvider` loads it, through what
 * `usePreviousPerformance` calls. A freeform workout has no routine.
 */
async function previousOf(app: App, sessionId: string, index: number) {
  const session = app.getState().storedSessions.sessions[sessionId]!;
  const latest = await app.workoutRepository.latestPerLineage({
    progressionKeys: [...new Set(session.recordedExercises.map((x) => x.progressionKey()))],
    excludeWorkoutId: sessionId,
  });
  const byLineage = Object.fromEntries(Object.entries(latest).map(([key, x]) => [key, x.exercise]));
  const exercise = session.recordedExercises[index] as RecordedWeightedExercise;
  const previous = carriedFrom(exercise, session.recordedExercises, [], byLineage);
  return { exercise, previous };
}

describe('every entry path opens what the routine path opens', () => {
  const heavy = makeWeightedBlueprint({
    name: 'Bench Press',
    exerciseId: 'Bench Press',
    sets: 3,
    repsConfig: { type: 'fixed', reps: 5 },
    warmupSets: [{ load: undefined, reps: 8 }],
  });
  const backOff = heavy.with({ sets: 2, repsConfig: { type: 'fixed', reps: 10 }, warmupSets: [] });
  const history = () => [
    pastWorkout('sep-14', LocalDate.of(2026, 9, 14), [
      { blueprint: heavy, kg: 80, reps: [5, 5, 5] },
      { blueprint: backOff, kg: 60, reps: [10, 10] },
      { blueprint: row, kg: 50, reps: [8, 8, 8] },
    ]),
    pastWorkout('sep-25', LocalDate.of(2026, 9, 25), [
      { blueprint: heavy, kg: 82.5, reps: [5, 5, 4] },
      { blueprint: backOff, kg: 62.5, reps: [10, 10] },
      { blueprint: row, kg: 55, reps: [8, 8, 8] },
    ]),
  ];

  it('Do again opens the same exercises as starting that workout as a routine', async () => {
    const app = await startApp(history());
    const past = (await app.workoutRepository.get('sep-14'))!;
    const latest = selectLatestExercises(app.getState());

    const again = serviceOf(app).repeatSession(past);
    const routine = serviceOf(app).hydrateSessionFromBlueprint(repeatBlueprint(past), latest);

    expect(weightsOf(again)).toEqual([
      ['85x5', '85x5', '85x5'],
      ['65x10', '65x10'],
      ['55x8', '55x8', '55x8'],
    ]);
    expect(again.recordedExercises).toHaveLength(routine.recordedExercises.length);
    again.recordedExercises.forEach((exercise, index) =>
      expect(exercise.equals(routine.recordedExercises[index])).toBe(true),
    );
  });

  it('adding through the picker opens the same exercises as a routine of the same picks', async () => {
    const app = await startApp(history());
    const sessionId = await startFreeform(app);
    const picks = [
      { id: 'Bench Press', name: 'Bench Press' },
      { id: 'Row', name: 'Row' },
    ];

    await addThroughPicker(app, sessionId, picks);
    await addThroughPicker(app, sessionId, [picks[0]!]);

    const added = app.getState().storedSessions.sessions[sessionId]!;
    const routine = serviceOf(app).hydrateSessionFromBlueprint(
      new SessionBlueprint('Picked', added.blueprint.exercises, ''),
      selectLatestExercises(app.getState()),
    );
    expect(weightsOf(added)).toEqual([
      ['82.5x10', '82.5x10', '82.5x10'],
      ['55x10', '55x10', '55x10'],
      ['62.5x10', '62.5x10', '62.5x10'],
    ]);
    added.recordedExercises.forEach((exercise, index) =>
      expect(exercise.equals(routine.recordedExercises[index])).toBe(true),
    );
  });

  it('shows as Previous the performance each added exercise opened from', async () => {
    const app = await startApp(history());
    const sessionId = await startFreeform(app);
    const picks = [
      { id: 'Bench Press', name: 'Bench Press' },
      { id: 'Row', name: 'Row' },
    ];
    await addThroughPicker(app, sessionId, picks);
    await addThroughPicker(app, sessionId, [picks[0]!]);

    const first = await previousOf(app, sessionId, 0);
    const second = await previousOf(app, sessionId, 2);

    expect(first.previous?.bestSet?.weight).toEqual(new Weight(82.5, 'kilograms'));
    expect(todaysTarget(first.exercise, first.previous, true)?.reason.kind).toBe('repsUp');
    expect(second.previous?.bestSet?.weight).toEqual(new Weight(62.5, 'kilograms'));
    expect(todaysTarget(second.exercise, second.previous, true)?.reason.kind).toBe('repeatAfterSuccess');
  });
});

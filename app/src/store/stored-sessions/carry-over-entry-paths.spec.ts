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
  SessionBlueprint,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import {
  RecordedCardioExercise,
  RecordedCardioExerciseSet,
  RecordedWeightedExercise,
  Session,
} from '@/models/session-models';
import { Weight } from '@/models/weight';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import {
  PickedExerciseRef,
  sessionWithExerciseSwapped,
  sessionWithPickAdded,
} from '@/components/presentation/workout-editor/exercise-picker';
import { createEffectStore } from '@/utils/__test__/effect-store';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import {
  initializeStoredSessionsStateSlice,
  putStoredSession,
  selectCarryOver,
  setActiveSessionId,
  updateStoredSession,
} from '@/store/stored-sessions';
import { setIsHydrated as setSettingsIsHydrated } from '@/store/settings';
import { repeatSession } from '@/models/workout-detail';

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
  return { ...harness, workoutRepository };
}

type App = Awaited<ReturnType<typeof startApp>>;

/** Starts a freeform workout, as the Home screen's empty workout does. */
async function startFreeform(app: App): Promise<string> {
  const session = Session.freeformSession(LocalDate.of(2026, 10, 4), undefined);
  app.store.dispatch(putStoredSession(session));
  app.store.dispatch(setActiveSessionId(session.id));
  await app.settle();
  return session.id;
}

/** What `useAddExercise` dispatches when the picker hands back a pick. */
async function addThroughPicker(app: App, sessionId: string, picked: PickedExerciseRef[]) {
  const carryOver = selectCarryOver(app.getState(), sessionId);
  app.store.dispatch(
    updateStoredSession({
      sessionId,
      update: (s) => sessionWithPickAdded(s, picked, false, carryOver),
    }),
  );
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

const opened = (kg: number, reps: number, count = 3) =>
  Array.from({ length: count }, () => ({ kg, unit: 'kilograms', reps, logged: false }));

describe('adding an exercise through the picker (PM-41)', () => {
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

  it('never carries from the workout it is added to', async () => {
    const app = await startApp([
      pastWorkout('sep-28', LocalDate.of(2026, 9, 28), [{ blueprint: lunge, kg: 45, reps: [10, 10, 10] }]),
    ]);
    const sessionId = await startFreeform(app);
    await addThroughPicker(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }]);
    const key = lunge.progressionKey();

    // A set of Lunge at 60 kg, logged today: the cache's Lunge is now this workout's.
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
    expect(app.getState().storedSessions.latestExerciseWorkoutIds[key]).toBe(sessionId);
    expect(selectCarryOver(app.getState(), sessionId).latest[key]).toBeUndefined();

    // The Lunge is removed, then added again: it opens on Sep 28, not on the set it replaced.
    app.store.dispatch(updateStoredSession({ sessionId, update: (s) => s.withRemovedExercise(0) }));
    await app.settle();
    await addThroughPicker(app, sessionId, [{ id: 'Lunge', name: 'Lunge' }]);

    expect(setsOf(app, sessionId, 0)).toEqual(opened(45, 10));
  });
});

/** What the live exercise card's Swap dispatches when the picker hands back an exercise. */
async function swapThroughPicker(app: App, sessionId: string, index: number, picked: PickedExerciseRef) {
  const carryOver = selectCarryOver(app.getState(), sessionId);
  app.store.dispatch(
    updateStoredSession({
      sessionId,
      update: (s) => sessionWithExerciseSwapped(s, index, picked, carryOver),
    }),
  );
  await app.settle();
}

const bench = makeWeightedBlueprint({ name: 'Bench Press', exerciseId: 'Bench Press', sets: 3, progression: [] });

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
  return repeatSession(past!, LocalDate.of(2026, 10, 4), 'again');
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
});

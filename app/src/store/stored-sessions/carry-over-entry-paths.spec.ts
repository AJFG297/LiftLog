import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { LocalDate, OffsetDateTime, ZoneOffset } from '@js-joda/core';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { Weight } from '@/models/weight';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { PickedExerciseRef, sessionWithPickAdded } from '@/components/presentation/workout-editor/exercise-picker';
import { createEffectStore } from '@/utils/__test__/effect-store';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import {
  initializeStoredSessionsStateSlice,
  putStoredSession,
  setActiveSessionId,
  updateStoredSession,
} from '@/store/stored-sessions';
import { setIsHydrated as setSettingsIsHydrated } from '@/store/settings';

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
  return harness;
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
  app.store.dispatch(
    updateStoredSession({
      sessionId,
      update: (s) => sessionWithPickAdded(s, picked, false, false),
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
});

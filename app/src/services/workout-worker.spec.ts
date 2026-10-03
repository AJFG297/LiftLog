import { beforeEach, describe, expect, it, vi } from 'vitest';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { LocalDate } from '@js-joda/core';
import { TolgeeInstance } from '@tolgee/react';
import { ProgramBlueprint, SessionBlueprint } from '@/models/blueprint-models';
import { makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Session } from '@/models/session-models';
import { WorkoutMessage } from '@/models/workout-worker-messages';
import { RootState } from '@/store';
import programReducer, { clearPendingPlanDiff, savePlan, setActivePlan } from '@/store/program';
import { settingsReducer } from '@/store/settings';
import { putStoredSession, setActiveSessionId, storedSessionsReducer } from '@/store/stored-sessions';
import { WorkoutWorker } from '@/services/workout-worker';

// The native module's event stream: the test plays the worker by emitting what the notification would.
const native = vi.hoisted(() => ({ listener: undefined as ((e: { jsonString: string }) => void) | undefined }));
vi.mock('~/modules/workout-worker/src/WorkoutWorkerModule', () => ({
  default: {
    addListener: (_: string, listener: (e: { jsonString: string }) => void) => {
      native.listener = listener;
    },
    broadcast: () => {},
  },
}));

const PLAN_ID = 'plan-a';
const squat = makeWeightedBlueprint({ name: 'Squat' });
const bench = makeWeightedBlueprint({ name: 'Bench' });
const routine = new SessionBlueprint('Test', [squat, bench], '');

function setUp(session: Session) {
  const store = configureStore({
    reducer: combineReducers({
      program: programReducer,
      settings: settingsReducer,
      storedSessions: storedSessionsReducer,
    }),
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    savePlan({
      programId: PLAN_ID,
      programBlueprint: new ProgramBlueprint('Plan A', [routine], LocalDate.of(2026, 8, 6)),
    }),
  );
  store.dispatch(setActivePlan({ activePlanId: PLAN_ID }));
  store.dispatch(putStoredSession(session));
  store.dispatch(setActiveSessionId(session.id));
  const offers: (() => boolean)[] = [];
  new WorkoutWorker(
    store.dispatch,
    store.getState as unknown as () => RootState,
    {} as TolgeeInstance,
    (stillPending) => offers.push(stillPending),
  );
  return { store, offers };
}

function tapNotificationFinish() {
  native.listener!({
    jsonString: JSON.stringify({ payload: { type: 'FinishWorkoutCommand' } } as Partial<WorkoutMessage>),
  });
}

describe('finishing from the workout notification', () => {
  beforeEach(() => {
    native.listener = undefined;
  });

  it('leaves the same pending plan diff as the in-app Finish when the workout changed', () => {
    const session = makeSession([squat, bench, makeWeightedBlueprint({ name: 'Deadlift' })]);
    const { store, offers } = setUp(session);

    tapNotificationFinish();

    const pending = store.getState().program.pendingPlanDiff;
    expect(pending).toMatchObject({ type: 'diff', programId: PLAN_ID, sessionIndex: 0 });
    expect(pending?.diff.originalSession).toBe(routine);
    expect(pending?.diff.newSession).toBe(session.blueprint);
    expect(pending?.diff.addedExercises.map((x) => [x.exercise.name, x.newIndex])).toEqual([['Deadlift', 2]]);
    expect(offers.map((stillPending) => stillPending())).toEqual([true]);
  });

  it('stops offering once the sheet has dealt with the diff', () => {
    const { store, offers } = setUp(makeSession([squat, bench, makeWeightedBlueprint({ name: 'Deadlift' })]));
    tapNotificationFinish();

    store.dispatch(clearPendingPlanDiff(store.getState().program.pendingPlanDiff!));

    expect(offers.map((stillPending) => stillPending())).toEqual([false]);
  });

  it('leaves no pending plan diff when the workout matches the routine', () => {
    const { store, offers } = setUp(makeSession([squat, bench]));

    tapNotificationFinish();

    expect(store.getState().program.pendingPlanDiff).toBeUndefined();
    expect(offers).toEqual([]);
  });
});

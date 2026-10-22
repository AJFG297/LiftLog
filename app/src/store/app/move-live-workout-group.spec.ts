import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import appReducer, { setLiveWorkoutDrafts, setLiveWorkoutFocus } from '@/store/app';
import { moveLiveWorkoutGroup } from './move-live-workout-group';
import { setActiveSession, storedSessionsReducer } from '@/store/stored-sessions';
import { makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { exerciseGroupsOf } from '@/models/session-models/exercise-groups';

function setup() {
  const session = makeSession([
    makeWeightedBlueprint({ name: 'Curl: cable' }),
    makeWeightedBlueprint({ name: 'Row', supersetWithNext: true }),
    makeWeightedBlueprint({ name: 'Fly' }),
    makeWeightedBlueprint({ name: 'Curl: cable' }),
  ]);
  const store = configureStore({
    reducer: { app: appReducer, storedSessions: storedSessionsReducer },
    middleware: (defaults) => defaults({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(setActiveSession(session));
  return { store, session };
}

describe('moveLiveWorkoutGroup', () => {
  it('moves the full superset and plan while focus and distinct same-name drafts follow their exercises', () => {
    const { store, session } = setup();
    store.dispatch(setLiveWorkoutFocus({ sessionId: session.id, exerciseIndex: 2 }));
    store.dispatch(
      setLiveWorkoutDrafts({
        sessionId: session.id,
        exerciseKey: '0:Curl: cable',
        drafts: { 'working:0': { reps: 7 } },
      }),
    );
    store.dispatch(
      setLiveWorkoutDrafts({
        sessionId: session.id,
        exerciseKey: '3:Curl: cable',
        drafts: { 'working:0': { reps: 11 } },
      }),
    );
    store.dispatch(moveLiveWorkoutGroup(session.id, 0, 2));
    const state = store.getState();
    const moved = state.storedSessions.sessions[session.id]!;
    expect(moved.recordedExercises.map((exercise) => exercise.blueprint.name)).toEqual([
      'Row',
      'Fly',
      'Curl: cable',
      'Curl: cable',
    ]);
    expect(moved.blueprint.exercises.map((exercise) => exercise.name)).toEqual([
      'Row',
      'Fly',
      'Curl: cable',
      'Curl: cable',
    ]);
    expect(exerciseGroupsOf(moved.recordedExercises).map((group) => group.indices)).toEqual([[0, 1], [2], [3]]);
    expect(state.app.liveWorkoutFocus).toEqual({ sessionId: session.id, exerciseIndex: 1 });
    expect(state.app.liveWorkoutDrafts?.exercises).toEqual({
      '2:Curl: cable': { 'working:0': { reps: 11 } },
      '3:Curl: cable': { 'working:0': { reps: 7 } },
    });
    store.dispatch(moveLiveWorkoutGroup(session.id, 2, 0));
    expect(store.getState().app.liveWorkoutDrafts?.exercises).toEqual({
      '0:Curl: cable': { 'working:0': { reps: 7 } },
      '3:Curl: cable': { 'working:0': { reps: 11 } },
    });
    expect(store.getState().app.liveWorkoutFocus?.exerciseIndex).toBe(2);
  });

  it('keeps the displayed fallback focused when a removed exercise left stale focus', () => {
    const { store, session } = setup();
    store.dispatch(setLiveWorkoutFocus({ sessionId: session.id, exerciseIndex: 9 }));
    store.dispatch(moveLiveWorkoutGroup(session.id, 0, 2));
    expect(store.getState().app.liveWorkoutFocus).toEqual({ sessionId: session.id, exerciseIndex: 3 });
  });

  it('leaves focus and drafts of another workout untouched', () => {
    const { store, session } = setup();
    store.dispatch(setLiveWorkoutFocus({ sessionId: 'other', exerciseIndex: 2 }));
    store.dispatch(
      setLiveWorkoutDrafts({ sessionId: 'other', exerciseKey: '0:Curl', drafts: { 'working:0': { reps: 9 } } }),
    );
    const previous = store.getState().app;
    store.dispatch(moveLiveWorkoutGroup(session.id, 0, 2));
    expect(store.getState().app).toEqual(previous);
  });

  it.each([
    [0, 0],
    [-1, 0],
    [0, 9],
    [0.5, 1],
  ])('does not write for a no-op or invalid move %s to %s', (from, to) => {
    const { store, session } = setup();
    const previous = store.getState();
    store.dispatch(moveLiveWorkoutGroup(session.id, from, to));
    expect(store.getState()).toBe(previous);
  });
});

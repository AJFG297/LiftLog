import { act, cleanup, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { type PropsWithChildren, useState } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLiveSetEntry } from './useLiveSetEntry';
import { makeRecordedExercise, makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { Weight } from '@/models/weight';
import appReducer from '@/store/app';
import { setScaleWarmupsWithWorkingWeight, settingsReducer } from '@/store/settings';
import { storedSessionsReducer } from '@/store/stored-sessions';

const mocks = vi.hoisted(() => ({
  setLogged: vi.fn(),
  selection: vi.fn(),
  withRestTimerAt: vi.fn((session: Session) => session),
}));

vi.mock('@/store', async () => ({ useAppSelector: (await import('react-redux')).useSelector }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@tolgee/react', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/presentation/foundation/haptics', () => ({
  haptics: { setLogged: mocks.setLogged, selection: mocks.selection },
}));
vi.mock('@/components/presentation/foundation/toast', () => ({ useToast: () => ({ show: () => {} }) }));
vi.mock('@/components/smart/recorded-exercise-view', () => ({
  withRestTimerAt: mocks.withRestTimerAt,
}));
vi.mock('@/components/presentation/foundation/number-pad', async () => ({
  ...(await import('@/components/presentation/foundation/number-pad/number-pad-buffer')),
  weightAccessoryFor: () => undefined,
}));

afterEach(() => {
  cleanup();
  mocks.setLogged.mockClear();
  mocks.selection.mockClear();
  mocks.withRestTimerAt.mockClear();
});

const first = { list: 'working', index: 0 } as const;
const second = { list: 'working', index: 1 } as const;

function openEntry(weight: number, sets: (number | undefined)[] = [undefined]) {
  const store = configureStore({
    reducer: { app: appReducer, settings: settingsReducer, storedSessions: storedSessionsReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const blueprint = makeWeightedBlueprint({
    progression: [],
    plannedSets: sets.map(() => ({ reps: { min: 5, max: 5 }, kind: 'working' as const })),
  });
  const initial = makeSession([blueprint]).withExercise(
    0,
    makeRecordedExercise(blueprint, sets, new Weight(weight, 'kilograms')),
  );
  function wrapper({ children }: PropsWithChildren) {
    return <Provider store={store}>{children}</Provider>;
  }
  return renderHook(
    () => {
      const [session, updateSession] = useState(initial);
      return { session, entry: useLiveSetEntry(session, updateSession, [0]) };
    },
    { wrapper },
  );
}

describe('clearing a reopened assisted load', () => {
  it.each([-5, -20].flatMap((weight) => ['hide', 'next', 'log'].map((exit) => ({ weight, exit }))))(
    'commits finite zero from $weight on $exit',
    ({ weight, exit }) => {
      const { result } = openEntry(weight);
      act(() => result.current.entry.open(0, first, 'weight'));
      for (let i = 0; i < String(Math.abs(weight)).length; i++) {
        act(() => result.current.entry.pad.onAction({ type: 'backspace' }));
      }
      if (exit === 'hide') {
        act(() => result.current.entry.pad.onHide());
      } else if (exit === 'next') {
        act(() => result.current.entry.pad.onPrimary());
      } else {
        act(() => result.current.entry.toggle(0, first));
      }
      const exercise = result.current.session.recordedExercises[0];
      expect(exercise).toBeInstanceOf(RecordedWeightedExercise);
      if (!(exercise instanceof RecordedWeightedExercise)) {
        throw new Error('Expected weighted exercise');
      }
      const slot = exercise.potentialSets[0];
      expect(slot?.weight.value.isFinite()).toBe(true);
      expect(slot?.weight.toJSON()).toEqual({ unit: 'kilograms', value: '0' });
      expect(!!slot?.set).toBe(exit === 'log');
      if (exit === 'next') {
        expect(result.current.entry.editing?.field).toBe('reps');
      } else {
        expect(result.current.entry.editing).toBeUndefined();
      }
    },
  );
});

describe('copying previous weight', () => {
  it('copies weight into the same row without logging, starting rest, or changing later sets', () => {
    const { result } = openEntry(87.5, [undefined, undefined]);
    act(() => result.current.entry.copyPreviousWeight(0, first, new Weight(85, 'kilograms')));

    const exercise = result.current.session.recordedExercises[0] as RecordedWeightedExercise;
    expect(exercise.potentialSets.map((s) => s.weight.value.toNumber())).toEqual([85, 87.5]);
    expect(exercise.potentialSets[0]!.set).toBeUndefined();
    expect(result.current.entry.editing).toBeUndefined();
    expect(mocks.withRestTimerAt).not.toHaveBeenCalled();
    expect(mocks.setLogged).not.toHaveBeenCalled();
    expect(mocks.selection).toHaveBeenCalledTimes(1);
  });

  it('drops an uncommitted weight buffer on the same row instead of moving following sets', () => {
    const { result } = openEntry(87.5, [undefined, undefined]);
    act(() => result.current.entry.open(0, first, 'weight'));
    act(() => result.current.entry.pad.onAction({ type: 'digit', digit: '9' }));
    act(() => result.current.entry.copyPreviousWeight(0, first, new Weight(82.5, 'kilograms')));

    const exercise = result.current.session.recordedExercises[0] as RecordedWeightedExercise;
    expect(exercise.potentialSets.map((s) => s.weight.value.toNumber())).toEqual([82.5, 87.5]);
    expect(result.current.entry.editing).toBeUndefined();
  });

  it('commits typed reps on the row before copying previous weight', () => {
    const { result } = openEntry(87.5, [undefined, undefined]);
    act(() => result.current.entry.open(0, first, 'reps'));
    act(() => result.current.entry.pad.onAction({ type: 'digit', digit: '7' }));
    act(() => result.current.entry.copyPreviousWeight(0, first, new Weight(80, 'kilograms')));

    const exercise = result.current.session.recordedExercises[0] as RecordedWeightedExercise;
    expect(exercise.potentialSets[0]!.weight.value.toNumber()).toBe(80);
    expect(exercise.potentialSets[0]!.set).toBeUndefined();
    expect(result.current.entry.stateFor(0)?.drafts['working:0']).toEqual({ reps: 7, weightTyped: true });
    expect(result.current.entry.editing).toBeUndefined();
  });

  it('does nothing for a completed set', () => {
    const { result } = openEntry(87.5, [5, undefined]);
    act(() => result.current.entry.copyPreviousWeight(0, first, new Weight(80, 'kilograms')));

    const exercise = result.current.session.recordedExercises[0] as RecordedWeightedExercise;
    expect(exercise.potentialSets[0]!.weight.value.toNumber()).toBe(87.5);
    expect(exercise.potentialSets[0]!.set?.repsCompleted).toBe(5);
    expect(mocks.selection).not.toHaveBeenCalled();

    // Still works on the next unlogged set.
    act(() => result.current.entry.copyPreviousWeight(0, second, new Weight(80, 'kilograms')));
    const updated = result.current.session.recordedExercises[0] as RecordedWeightedExercise;
    expect(updated.potentialSets[1]!.weight.value.toNumber()).toBe(80);
    expect(mocks.selection).toHaveBeenCalledTimes(1);
  });
});

describe('warm-up scaling preference during live set entry', () => {
  function openWithWarmup(scaleWarmupsWithWorkingWeight: boolean) {
    const store = configureStore({
      reducer: { app: appReducer, settings: settingsReducer, storedSessions: storedSessionsReducer },
      middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
    });
    if (scaleWarmupsWithWorkingWeight) {
      store.dispatch(setScaleWarmupsWithWorkingWeight(true));
    }
    const blueprint = makeWeightedBlueprint({
      progression: [],
      plannedSets: [{ reps: { min: 5, max: 5 }, kind: 'working' }],
      warmupSets: [{ reps: 5, load: { type: 'percent', percent: 50 } }],
    });
    const initial = makeSession([blueprint]).withExercise(
      0,
      makeRecordedExercise(blueprint, [undefined], new Weight(100, 'kilograms')).withWarmupsFromPlan('kilograms'),
    );
    function wrapper({ children }: PropsWithChildren) {
      return <Provider store={store}>{children}</Provider>;
    }
    return renderHook(
      () => {
        const [session, updateSession] = useState(initial);
        return { session, entry: useLiveSetEntry(session, updateSession, [0]) };
      },
      { wrapper },
    );
  }

  it.each([
    [false, 50],
    [true, 60],
  ])('with scaleWarmupsWithWorkingWeight=%s leaves warm-up at %d kg after typing 120 kg', (scale, expectedWarmup) => {
    const { result } = openWithWarmup(scale);
    act(() => result.current.entry.open(0, first, 'weight'));
    for (const digit of ['1', '2', '0'] as const) {
      act(() => result.current.entry.pad.onAction({ type: 'digit', digit }));
    }
    act(() => result.current.entry.pad.onHide());

    const exercise = result.current.session.recordedExercises[0] as RecordedWeightedExercise;
    expect(exercise.potentialSets[0]!.weight.value.toNumber()).toBe(120);
    expect(exercise.warmupSets[0]!.weight.value.toNumber()).toBe(expectedWarmup);
  });
});

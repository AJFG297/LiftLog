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
import { settingsReducer } from '@/store/settings';
import { storedSessionsReducer } from '@/store/stored-sessions';

vi.mock('@/store', async () => ({ useAppSelector: (await import('react-redux')).useSelector }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@tolgee/react', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/presentation/foundation/haptics', () => ({
  haptics: { setLogged: () => {} },
}));
vi.mock('@/components/presentation/foundation/toast', () => ({ useToast: () => ({ show: () => {} }) }));
vi.mock('@/components/smart/recorded-exercise-view', () => ({
  withRestTimerAt: (session: Session) => session,
}));
vi.mock('@/components/presentation/foundation/number-pad', async () => ({
  ...(await import('@/components/presentation/foundation/number-pad/number-pad-buffer')),
  weightAccessoryFor: () => undefined,
}));

afterEach(cleanup);

const first = { list: 'working', index: 0 } as const;

function openEntry(weight: number) {
  const store = configureStore({
    reducer: { app: appReducer, settings: settingsReducer, storedSessions: storedSessionsReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const blueprint = makeWeightedBlueprint({ progression: [] });
  const initial = makeSession([blueprint]).withExercise(
    0,
    makeRecordedExercise(blueprint, [undefined], new Weight(weight, 'kilograms')),
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

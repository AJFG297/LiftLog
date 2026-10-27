import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { LocalDate } from '@js-joda/core';
import { type PropsWithChildren, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoutineEditor } from './routine-editor';
import { type Digit, type NumberPadAction } from '@/components/presentation/foundation/number-pad/number-pad-buffer';
import { ProgramBlueprint, SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';
import programReducer, { setSavedPlans } from '@/store/program';
import { settingsReducer } from '@/store/settings';
import { storedSessionsReducer } from '@/store/stored-sessions';

vi.mock('react-native', () => ({
  Platform: { OS: 'android', select: ({ default: fallback }: { default: number }) => fallback },
  Alert: { alert: () => {} },
  Keyboard: { dismiss: () => {} },
  View: ({ children, testID }: PropsWithChildren<{ testID?: string }>) => <div data-testid={testID}>{children}</div>,
  TextInput: ({
    value,
    testID,
    onFocus,
  }: {
    value: string;
    testID?: string;
    onChangeText: (value: string) => void;
    onFocus?: () => void;
  }) => <input data-testid={testID} value={value} readOnly onFocus={onFocus} />,
  Pressable: ({
    children,
    testID,
    onPress,
    disabled,
    accessibilityLabel,
  }: {
    children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
    testID?: string;
    onPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
  }) => (
    <button data-testid={testID} aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>
      {typeof children === 'function' ? children({ pressed: false }) : children}
    </button>
  ),
}));
vi.mock('react-native-gesture-handler', () => ({
  ScrollView: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock('expo-router', () => ({
  useNavigation: () => ({ dispatch: () => {} }),
  useRouter: () => ({ back: () => {}, push: () => {} }),
}));
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: () => {} }));
vi.mock('expo-localization', () => ({ getLocales: () => [{ decimalSeparator: '.' }] }));
vi.mock('@tolgee/react', () => ({
  useTranslate: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${Object.values(values).join(' ')}` : key),
  }),
}));
vi.mock('@/store', async () => ({ useAppSelector: (await import('react-redux')).useSelector }));
vi.mock('@/hooks/useAppTheme', () => ({
  useAppTheme: () => ({ tokens: {} }),
  fontFamily: { text: 'sans-serif' },
  spacing: { 0.5: 2, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 10: 40, pageHorizontalMargin: 20 },
}));
vi.mock('@/hooks/useBackWhenGone', () => ({ useBackWhenGone: () => {} }));
vi.mock('@/hooks/useExerciseSearch', () => ({ useExercisePicker: () => () => {} }));
vi.mock('@/hooks/useGoToRoutines', () => ({ useGoToRoutines: () => () => {} }));
vi.mock('@/hooks/useOpenExerciseProgress', () => ({ useOpenExerciseProgress: () => () => {} }));
vi.mock('@/hooks/usePreferredWeightUnit', () => ({
  usePreferredWeightFormat: () => ({ unit: 'kilograms', unitLabel: 'kg', formatWeight: String }),
}));
vi.mock('@/components/smart/services-provider', () => ({
  useServices: () => ({
    sessionService: {
      hydrateSessionFromBlueprint: (routine: SessionBlueprint) => makeSession(routine.exercises),
    },
  }),
}));
vi.mock('@/components/smart/exercise-edit-rest-sheet', () => ({ getExerciseEditRestHref: () => '' }));
vi.mock('@/components/smart/routine-exercise-editor', () => ({ getRoutineExerciseEditorHref: () => '' }));
vi.mock('@/components/smart/routine-rest-edit', () => ({ openRoutineRestEdit: () => () => {} }));
vi.mock('@/components/presentation/foundation/toast', () => ({ useToast: () => () => {} }));
vi.mock('@/components/presentation/foundation/surface-text', () => ({
  SurfaceText: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));
vi.mock('@/components/presentation/foundation/ms-icon-source', () => ({ MsIconSrc: () => null }));
vi.mock('@/components/presentation/workout-editor/routine-progression-editor', async () => ({
  progressionTagOf: () => undefined,
  RoutineProgressionEditor: () => null,
}));
vi.mock('@/components/presentation/workout-editor/routine-rest-row', () => ({ RoutineRestRow: () => null }));
vi.mock('@/components/presentation/workout-editor/routine-start-options', () => ({ RoutineStartOptions: () => null }));
vi.mock('@/components/presentation/workout-editor/ask-ai-bar', () => ({
  ASK_AI_BAR_ENABLED: false,
  AskAiBar: () => null,
}));
vi.mock('@/components/presentation/foundation/number-pad', async () => ({
  ...(await import('@/components/presentation/foundation/number-pad/number-pad-buffer')),
  weightAccessoryFor: () => undefined,
  NumberPad: ({
    visible,
    onAction,
    onHide,
    onPrimary,
  }: {
    visible: boolean;
    onAction: (action: NumberPadAction) => void;
    onHide: () => void;
    onPrimary: () => void;
  }) =>
    visible ? (
      <div>
        {(['0', '1', '2', '8', '9'] satisfies Digit[]).map((digit) => (
          <button key={digit} onClick={() => onAction({ type: 'digit', digit })}>
            {digit}
          </button>
        ))}
        <button onClick={() => onAction({ type: 'backspace' })}>Backspace</button>
        <button onClick={onPrimary}>Next</button>
        <button onClick={onHide}>Hide</button>
      </div>
    ) : null,
}));

afterEach(cleanup);

function openEditor(exercise: WeightedExerciseBlueprint) {
  const store = configureStore({
    reducer: { program: programReducer, settings: settingsReducer, storedSessions: storedSessionsReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    setSavedPlans({
      test: new ProgramBlueprint(
        'Program',
        [new SessionBlueprint('Routine', [exercise], '')],
        LocalDate.of(2026, 1, 1),
      ),
    }),
  );
  const view = render(
    <Provider store={store}>
      <RoutineEditor programId="test" sessionIndex={0} isNew={false} />
    </Provider>,
  );
  fireEvent.click(within(view.getByTestId('routine-exercise-0')).getByRole('button'));
  const save = () => {
    fireEvent.click(view.getByTestId('routine-save'));
    const saved = store.getState().program.savedPrograms.test?.sessions[0]?.exercises[0];
    if (!(saved instanceof WeightedExerciseBlueprint)) {
      throw new Error('The saved routine must contain the weighted exercise');
    }
    return saved;
  };
  const clear = () => {
    for (let press = 0; press < 4; press += 1) {
      fireEvent.click(view.getByText('Backspace'));
    }
  };
  return { view, save, clear };
}

describe('routine planned reps on the number pad', () => {
  it('keeps cleared fixed reps blank until leaving, then saves at least one rep', () => {
    const editor = openEditor(
      makeWeightedBlueprint({ plannedSets: [{ kind: 'working', reps: { min: 10, max: 10 } }] }),
    );
    const cell = editor.view.getByTestId('routine-set-reps-working-0');
    fireEvent.click(cell);
    editor.clear();
    expect.soft(within(cell).queryByText(/\S/)).toBeNull();
    expect(editor.save().plannedSets[0]?.reps).toEqual({ min: 1, max: 1 });
  });

  it.each(['min', 'max'] as const)(
    'keeps a cleared range %s blank and saves ordered positive endpoints',
    (endpoint) => {
      const editor = openEditor(
        makeWeightedBlueprint({ plannedSets: [{ kind: 'working', reps: { min: 8, max: 12 } }] }),
      );
      const cell = editor.view.getByTestId('routine-set-reps-working-0');
      fireEvent.click(cell);
      if (endpoint === 'max') {
        fireEvent.click(editor.view.getByText('Next'));
      }
      editor.clear();
      expect.soft(within(cell).queryByText(endpoint === 'min' ? '-12' : '8-')).not.toBeNull();
      expect(editor.save().plannedSets[0]?.reps).toEqual(endpoint === 'min' ? { min: 1, max: 12 } : { min: 1, max: 1 });
    },
  );
});

describe('routine warm-ups on the number pad', () => {
  it('keeps cleared warm-up reps blank and saves at least one rep', () => {
    const editor = openEditor(makeWeightedBlueprint({ warmupSets: [{ load: undefined, reps: 10 }] }));
    const cell = editor.view.getByTestId('routine-set-reps-warmup-0');
    fireEvent.click(cell);
    editor.clear();
    expect.soft(within(cell).queryByText(/\S/)).toBeNull();
    expect(editor.save().warmupSets[0]?.reps).toBe(1);
  });

  it.each(['absolute', 'percent'] as const)('keeps a cleared %s load blank and saves its zero meaning', (type) => {
    const load = type === 'percent' ? { type, percent: 50 } : { type, weight: new Weight(20, 'kilograms') };
    const editor = openEditor(makeWeightedBlueprint({ warmupSets: [{ load, reps: 10 }] }));
    const cell = editor.view.getByRole('button', { name: /routine_editor.set_table.weight.label/ });
    fireEvent.click(cell);
    editor.clear();
    expect.soft(within(cell).queryByText(/\S/)).toBeNull();
    expect(editor.save().warmupSets[0]?.load).toEqual(type === 'percent' ? { type, percent: 0 } : undefined);
  });
});

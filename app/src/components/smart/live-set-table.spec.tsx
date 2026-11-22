import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { OffsetDateTime } from '@js-joda/core';
import { type PropsWithChildren, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/en.json';
import { LiveSetTable } from './live-set-table';
import { useLiveSetEntry } from '@/hooks/useLiveSetEntry';
import { makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { PotentialSet, RecordedSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import type { Resistance } from '@/models/blueprint-models';
import { Weight } from '@/models/weight';
import appReducer from '@/store/app';
import { settingsReducer } from '@/store/settings';
import { storedSessionsReducer } from '@/store/stored-sessions';
import type { View } from 'react-native';

const mocks = vi.hoisted(() => ({
  previousExercise: undefined as RecordedWeightedExercise | undefined,
  withRestTimerAt: vi.fn((session: Session) => session),
  setLogged: vi.fn(),
  selection: vi.fn(),
  previousMinHeights: [] as (number | undefined)[],
}));

function formatTemplate(key: string, params?: Record<string, string | number>): string {
  const template = (en as Record<string, string>)[key] ?? key;
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

vi.mock('react-native', () => ({
  View: ({ children, testID }: PropsWithChildren<{ testID?: string }>) => <div data-testid={testID}>{children}</div>,
  Pressable: ({
    children,
    testID,
    accessibilityRole,
    accessibilityLabel,
    onPress,
    style,
  }: PropsWithChildren<{
    testID?: string;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    onPress?: () => void;
    style?: Record<string, unknown> | ((state: { pressed: boolean }) => Record<string, unknown>);
  }>) => {
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style;
    if (testID === 'set-previous' && resolvedStyle && typeof resolvedStyle.minHeight === 'number') {
      mocks.previousMinHeights.push(resolvedStyle.minHeight);
    }
    return (
      <button
        type="button"
        data-testid={testID}
        role={accessibilityRole}
        aria-label={accessibilityLabel}
        onClick={onPress}
      >
        {children}
      </button>
    );
  },
}));
vi.mock('react-native-reanimated', () => ({
  default: { View: ({ children }: PropsWithChildren) => <div>{children}</div> },
  cancelAnimation: () => {},
  useAnimatedStyle: () => ({}),
  useReducedMotion: () => true,
  useSharedValue: () => ({ value: 1 }),
  withDelay: () => 0,
  withRepeat: () => 0,
  withSequence: () => 0,
  withTiming: () => 0,
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('expo-localization', () => ({ getLocales: () => [{ decimalSeparator: '.' }] }));
vi.mock('@tolgee/react', () => ({ useTranslate: () => ({ t: formatTemplate }) }));
vi.mock('@/store', async () => ({ useAppSelector: (await import('react-redux')).useSelector }));
vi.mock('@/hooks/useAppTheme', () => ({
  useAppTheme: () => ({ tokens: {} }),
  font: { 'text-sm': {}, 'text-lg': {}, 'text-2xs': {} },
  spacing: { 0.5: 2, 1: 4, 2: 8, 3: 12, 4: 16 },
}));
vi.mock('@/hooks/useTodaysTarget', () => ({
  usePreviousPerformance: () => () => ({
    previous: mocks.previousExercise,
    candidates: mocks.previousExercise ? [mocks.previousExercise] : [],
  }),
}));
vi.mock('@/components/presentation/foundation/surface-text', () => ({
  SurfaceText: ({ children, testID }: PropsWithChildren<{ testID?: string }>) => (
    <span data-testid={testID}>{children}</span>
  ),
}));
vi.mock('@/components/presentation/foundation/ms-icon-source', () => ({ MsIconSrc: () => null }));
vi.mock('@/components/presentation/foundation/set-badge', () => ({
  SetBadge: ({ kind, number }: { kind: string; number?: number }) => <span>{number ?? kind}</span>,
}));
vi.mock('@/components/presentation/foundation/swipe-to-delete', () => ({
  SwipeToDelete: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('@/components/presentation/foundation/haptics', () => ({
  haptics: { setLogged: mocks.setLogged, selection: mocks.selection },
}));
vi.mock('@/components/presentation/foundation/toast', () => ({ useToast: () => ({ show: () => {} }) }));
vi.mock('@/components/presentation/workout/exercise-notes-display', () => ({ default: () => null }));
vi.mock('@/components/smart/recorded-exercise-view', () => ({
  withRestTimerAt: mocks.withRestTimerAt,
}));
vi.mock('@/components/presentation/foundation/number-pad', async () => ({
  ...(await import('@/components/presentation/foundation/number-pad/number-pad-buffer')),
  weightAccessoryFor: () => undefined,
}));

afterEach(() => {
  cleanup();
  mocks.previousExercise = undefined;
  mocks.withRestTimerAt.mockClear();
  mocks.setLogged.mockClear();
  mocks.selection.mockClear();
  mocks.previousMinHeights.length = 0;
});

const loggedAt = OffsetDateTime.parse('2026-10-01T10:00:00Z');
const kg = (value: number) => new Weight(value, 'kilograms');

function loggedSlot(weight: Weight, reps: number, kind: PotentialSet['kind'] = 'working') {
  return PotentialSet.of({
    weight,
    target: { min: reps, max: reps },
    kind,
    set: RecordedSet.of({ repsCompleted: reps, completionDateTime: loggedAt }),
  });
}

function unloggedSlot(weight: Weight, reps: number, kind: PotentialSet['kind'] = 'working') {
  return PotentialSet.of({
    weight,
    target: { min: reps, max: reps },
    kind,
  });
}

function renderTable(options: {
  resistance?: Resistance;
  todaySets: PotentialSet[];
  todayWarmups?: PotentialSet[];
  previousSets?: PotentialSet[];
  previousWarmups?: PotentialSet[];
}) {
  const blueprint = makeWeightedBlueprint({
    name: 'Bench Press',
    resistance: options.resistance ?? 'external',
    progression: [],
    plannedSets: options.todaySets.map((s) => ({
      reps: s.target,
      kind: s.kind === 'warmup' ? 'working' : s.kind,
    })),
    warmupSets: (options.todayWarmups ?? []).map((s) => ({
      reps: s.target.max,
      load: { type: 'absolute', weight: s.weight },
    })),
  });
  const today = new RecordedWeightedExercise(blueprint, options.todaySets, undefined, options.todayWarmups ?? []);
  mocks.previousExercise =
    options.previousSets || options.previousWarmups
      ? new RecordedWeightedExercise(blueprint, options.previousSets ?? [], undefined, options.previousWarmups ?? [])
      : undefined;

  const initial = makeSession([blueprint]).withExercise(0, today);
  const store = configureStore({
    reducer: {
      app: appReducer,
      settings: settingsReducer,
      storedSessions: storedSessionsReducer,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  let latestSession = initial;

  function Harness() {
    const [session, setSession] = useState(initial);
    const updateSession = (update: (current: Session) => Session) => {
      setSession((current) => {
        const next = update(current);
        latestSession = next;
        return next;
      });
    };
    const entry = useLiveSetEntry(session, updateSession, [0]);
    const rowRef = useRef<View>(null);
    return <LiveSetTable session={session} exerciseIndex={0} entry={entry} toStartNext editingRowRef={rowRef} />;
  }

  const view = render(
    <Provider store={store}>
      <Harness />
    </Provider>,
  );

  return {
    ...view,
    getExercise: () => latestSession.recordedExercises[0] as RecordedWeightedExercise,
  };
}

describe('LiveSetTable previous weight shortcut', () => {
  it('tapping Previous copies weight into the same unlogged row with an accessible 44pt button', () => {
    const { getAllByTestId, getExercise } = renderTable({
      todaySets: [unloggedSlot(kg(87.5), 5), unloggedSlot(kg(87.5), 5)],
      previousSets: [loggedSlot(kg(85), 5), loggedSlot(kg(82.5), 6)],
    });

    const rows = getAllByTestId('set-row');
    const firstPrevious = within(rows[0]!).getByRole('button', {
      name: 'Previous 85 × 5, copy 85 kg to Set 1',
    });
    expect(mocks.previousMinHeights[0]).toBe(44);

    fireEvent.click(firstPrevious);

    const updatedRows = getAllByTestId('set-row');
    expect(within(updatedRows[0]!).getByRole('button', { name: 'Weight for Set 1: 85 kg' })).toBeTruthy();
    expect(within(updatedRows[0]!).getByRole('button', { name: "Reps for Set 1: 5, today's target" })).toBeTruthy();
    expect(
      within(updatedRows[1]!).getByRole('button', { name: "Weight for Set 2: 87.5 kg, today's target" }),
    ).toBeTruthy();
    expect(getExercise().potentialSets[0]!.weight).toEqual(kg(85));
    expect(getExercise().potentialSets[1]!.weight).toEqual(kg(87.5));
    expect(getExercise().potentialSets[0]!.set).toBeUndefined();
    expect(mocks.withRestTimerAt).not.toHaveBeenCalled();
    expect(mocks.setLogged).not.toHaveBeenCalled();
    expect(mocks.selection).toHaveBeenCalledTimes(1);
  });

  it('supports real zero on external and bodyweight rows and cross-unit conversion', () => {
    const { getAllByTestId, getExercise } = renderTable({
      resistance: 'bodyweight',
      todaySets: [unloggedSlot(kg(10), 8), unloggedSlot(kg(10), 8)],
      previousSets: [loggedSlot(kg(0), 12), loggedSlot(new Weight(25, 'pounds'), 10)],
    });

    const rows = getAllByTestId('set-row');
    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Previous BW × 12, copy BW to Set 1' }));
    fireEvent.click(
      within(rows[1]!).getByRole('button', { name: 'Previous BW +25 lbs × 10, copy BW +11.34 kg to Set 2' }),
    );

    expect(getExercise().potentialSets[0]!.weight).toEqual(kg(0));
    expect(getExercise().potentialSets[1]!.weight).toEqual(kg(11.34));
  });

  it('does not render an interactive button for missing previous, completed sets, or resistance-none rows', () => {
    const { getAllByTestId } = renderTable({
      todaySets: [loggedSlot(kg(87.5), 5), unloggedSlot(kg(87.5), 5)],
      previousSets: [loggedSlot(kg(85), 5)],
    });

    const rows = getAllByTestId('set-row');
    // Completed row keeps plain non-interactive text.
    expect(within(rows[0]!).getByText('85 × 5')).toBeTruthy();
    expect(within(rows[0]!).queryByRole('button', { name: /Previous/ })).toBeNull();
    // Row past previous set count shows "-" as plain text.
    expect(within(rows[1]!).getByText('-')).toBeTruthy();
    expect(within(rows[1]!).queryByRole('button', { name: /Previous/ })).toBeNull();

    cleanup();

    const noLoad = renderTable({
      resistance: 'none',
      todaySets: [unloggedSlot(Weight.NIL, 15)],
      previousSets: [loggedSlot(Weight.NIL, 12)],
    });
    const noLoadRow = noLoad.getAllByTestId('set-row')[0]!;
    expect(within(noLoadRow).getByText('12')).toBeTruthy();
    expect(within(noLoadRow).queryByRole('button', { name: /Previous/ })).toBeNull();
  });

  it('copies previous warm-up weight into the warm-up row only', () => {
    const { getAllByTestId, getExercise } = renderTable({
      todayWarmups: [unloggedSlot(kg(60), 8, 'warmup')],
      todaySets: [unloggedSlot(kg(87.5), 5)],
      previousWarmups: [loggedSlot(kg(50), 10, 'warmup')],
      previousSets: [loggedSlot(kg(85), 5)],
    });

    const rows = getAllByTestId('set-row');
    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Previous 50 × 10, copy 50 kg to Warm-up set' }));

    expect(getExercise().warmupSets[0]!.weight).toEqual(kg(50));
    expect(getExercise().warmupSets[0]!.set).toBeUndefined();
    expect(getExercise().potentialSets[0]!.weight).toEqual(kg(87.5));
  });
});

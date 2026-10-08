import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { type PropsWithChildren, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTargetsPad, WeightedTargetsEditor, WeightedTargetsPad } from './weighted-targets-editor';
import { type TargetsMode } from './exercise-targets';
import { type ExerciseBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';

type Accessible = PropsWithChildren<{
  testID?: string;
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean };
}>;

vi.mock('react-native', () => ({
  View: ({ children, testID }: Accessible) => <div data-testid={testID}>{children}</div>,
  Pressable: ({
    children,
    testID,
    accessibilityLabel,
    accessibilityState,
    onPress,
  }: Accessible & { onPress: () => void }) => (
    <button
      data-testid={testID}
      aria-label={accessibilityLabel}
      aria-pressed={accessibilityState?.selected}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  Keyboard: { dismiss: () => {} },
}));
vi.mock('@tolgee/react', () => ({
  useTranslate: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      key === 'exercise_editor.pad.bottom.accessibility_label'
        ? `Bottom of range, ${String(params?.reps)}`
        : key === 'exercise_editor.pad.top.accessibility_label'
          ? `Top of range, ${String(params?.reps)}`
          : key,
  }),
}));
vi.mock('@/hooks/useAppTheme', () => ({
  useAppTheme: () => ({ tokens: {} }),
  spacing: { 0.5: 2, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, pageHorizontalMargin: 20 },
}));
vi.mock('@/components/presentation/foundation/surface-text', () => ({
  SurfaceText: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));
vi.mock('@/components/presentation/foundation/ms-icon-source', () => ({ MsIconSrc: () => null }));
vi.mock('@/components/presentation/workout-editor/targets-number-pad', () => ({
  TargetsNumberPad: ({ label, onDigit }: { label: string; onDigit: (digit: number) => void }) => (
    <div>
      <div data-testid="pad-label">{label}</div>
      <button onClick={() => onDigit(6)}>pad 6</button>
    </div>
  ),
}));

afterEach(cleanup);

function openEditor(initial: WeightedExerciseBlueprint, mode: TargetsMode) {
  let draft: ExerciseBlueprint = initial;
  function Harness() {
    const [exercise, setExercise] = useState<ExerciseBlueprint>(initial);
    const targets = useTargetsPad(exercise, (fn) => {
      draft = fn(draft);
      setExercise(draft);
    });
    const weighted = exercise as WeightedExerciseBlueprint;
    return (
      <>
        <WeightedTargetsEditor
          exercise={weighted}
          mode={mode}
          onModeChange={() => {}}
          targets={targets}
          onAddSet={() => {}}
          onRemoveSet={() => {}}
        />
        <WeightedTargetsPad exercise={weighted} targets={targets} />
      </>
    );
  }
  const view = render(<Harness />);
  return { view, reps: () => (draft as WeightedExerciseBlueprint).repsTargetForSet(0) };
}

/** The pad's heading, which names the field it is typing into. */
const padOn = (view: ReturnType<typeof render>, label: string) =>
  within(view.getByTestId('pad-label')).queryByText(label) !== null;

describe('Reps tile in Range mode', () => {
  const range = () => makeWeightedBlueprint({ sets: 3, repsConfig: { type: 'range', min: 8, max: 12 } });

  it('opens the pad on the end that was tapped, and switches ends while open', () => {
    const editor = openEditor(range(), 'range');
    const { view } = editor;

    fireEvent.click(view.getByLabelText('Top of range, 12'));
    expect(padOn(view, 'exercise_editor.pad.top.label')).toBe(true);
    view.getByRole('button', { name: 'Top of range, 12', pressed: true });

    fireEvent.click(view.getByLabelText('Bottom of range, 8'));
    expect(padOn(view, 'exercise_editor.pad.bottom.label')).toBe(true);
    view.getByRole('button', { name: 'Bottom of range, 8', pressed: true });

    fireEvent.click(view.getByText('pad 6'));
    expect(editor.reps()).toEqual({ min: 6, max: 12 });
  });

  it('keeps one Reps target in Fixed mode', () => {
    const { view } = openEditor(makeWeightedBlueprint({ sets: 3, repsConfig: { type: 'fixed', reps: 10 } }), 'fixed');
    expect(view.queryByLabelText(/of range/)).toBeNull();
    fireEvent.click(view.getByTestId('exercise-reps'));
    expect(padOn(view, 'exercise_editor.targets.reps.label')).toBe(true);
  });
});

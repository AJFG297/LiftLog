import { act, cleanup, fireEvent, render } from '@testing-library/react';
import BigNumber from 'bignumber.js';
import { type PropsWithChildren, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WarmupsEditor, type WarmupsEditorProps } from './warmups-editor';
import { type NumberPadAction } from '@/components/presentation/foundation/number-pad/number-pad-buffer';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';

const back = vi.hoisted(() => {
  const listeners: (() => boolean)[] = [];
  return {
    listeners,
    /** A hardware back, as React Native runs it: newest listener first. True when something consumed it. */
    press: () => [...listeners].reverse().some((listener) => listener()),
  };
});

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  BackHandler: {
    addEventListener: (_event: string, listener: () => boolean) => {
      back.listeners.push(listener);
      return { remove: () => back.listeners.splice(back.listeners.indexOf(listener), 1) };
    },
  },
  View: ({ children, testID }: PropsWithChildren<{ testID?: string }>) => <div data-testid={testID}>{children}</div>,
  ScrollView: ({ children }: PropsWithChildren) => <div>{children}</div>,
  Pressable: ({ children, testID, onPress }: PropsWithChildren<{ testID?: string; onPress: () => void }>) => (
    <button data-testid={testID} onClick={onPress}>
      {children}
    </button>
  ),
  StyleSheet: { hairlineWidth: 1 },
}));
vi.mock('expo-router/react-navigation', () => ({
  useNavigation: () => ({ isFocused: () => true, dispatch: () => {} }),
  usePreventRemove: () => {},
}));
vi.mock('@tolgee/react', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
vi.mock('expo-localization', () => ({ getLocales: () => [{ decimalSeparator: '.' }] }));
vi.mock('@/hooks/useAppTheme', () => ({
  useAppTheme: () => ({ tokens: {} }),
  spacing: { 0.5: 2, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, pageHorizontalMargin: 20 },
}));
vi.mock('@/components/presentation/foundation/surface-text', () => ({
  SurfaceText: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));
vi.mock('@/components/presentation/foundation/header-pill-button', () => ({
  HeaderPillButton: ({ testID, label, onPress }: { testID: string; label: string; onPress: () => void }) => (
    <button data-testid={testID} onClick={onPress}>
      {label}
    </button>
  ),
}));
vi.mock('@/components/presentation/foundation/chip', () => ({ Chip: () => null }));
vi.mock('@/components/presentation/foundation/segmented-control', () => ({ SegmentedControl: () => null }));
vi.mock('@/components/presentation/foundation/ms-icon-source', () => ({ MsIconSrc: () => null }));
vi.mock('@/components/presentation/foundation/haptics', () => ({ haptics: { selection: () => {} } }));
vi.mock('@/components/presentation/foundation/number-pad', async () => ({
  ...(await import('@/components/presentation/foundation/number-pad/number-pad-buffer')),
  NumberPad: ({ visible, onAction }: { visible: boolean; onAction: (action: NumberPadAction) => void }) =>
    visible ? (
      <>
        <button onClick={() => onAction({ type: 'digit', digit: '8' })}>8</button>
        <button onClick={() => onAction({ type: 'backspace' })}>Backspace</button>
      </>
    ) : null,
}));

afterEach(cleanup);

function openEditor(initial: WarmupsEditorProps['exercise']) {
  let draft = initial;
  let saved = initial;
  function Harness() {
    const [exercise, setExercise] = useState(initial);
    const [open, setOpen] = useState(true);
    return open ? (
      <WarmupsEditor
        exercise={exercise}
        update={(fn) => {
          draft = fn(draft);
          setExercise(draft);
        }}
        workingWeight={new Weight(100, 'kilograms')}
        bar={new Weight(20, 'kilograms')}
        preferredUnit="kilograms"
        stepFor={() => new BigNumber(2.5)}
        scopeNote="Applies to today"
        bottomInset={0}
        onDone={() => {
          saved = draft;
          setOpen(false);
        }}
      />
    ) : null;
  }
  const view = render(<Harness />);
  return { view, draft: () => draft, saved: () => saved };
}

describe('warm-up sheet dismissal', () => {
  it.each(['done', 'unmount'] as const)('keeps typed reps on %s without leaving the field', (dismiss) => {
    const editor = openEditor(
      makeWeightedBlueprint({ warmupSets: [{ load: { type: 'percent', percent: 50 }, reps: 10 }] }),
    );
    fireEvent.click(editor.view.getByTestId('warmups-reps-0'));
    fireEvent.click(editor.view.getByText('8'));
    if (dismiss === 'done') {
      fireEvent.click(editor.view.getByTestId('warmups-done'));
      expect(editor.saved().warmupSets[0]?.reps).toBe(8);
    } else {
      editor.view.unmount();
    }
    expect(editor.draft().warmupSets[0]?.reps).toBe(8);
  });

  it.each(['done', 'unmount'] as const)('keeps typed load on %s without leaving the field', (dismiss) => {
    const editor = openEditor(
      makeWeightedBlueprint({
        warmupSets: [{ load: { type: 'absolute', weight: new Weight(20, 'kilograms') }, reps: 10 }],
      }),
    );
    fireEvent.click(editor.view.getByTestId('warmups-load-0'));
    fireEvent.click(editor.view.getByText('8'));
    if (dismiss === 'done') {
      fireEvent.click(editor.view.getByTestId('warmups-done'));
      expect(editor.saved().warmupSets[0]?.load).toEqual({ type: 'absolute', weight: new Weight(8, 'kilograms') });
    } else {
      editor.view.unmount();
    }
    expect(editor.draft().warmupSets[0]?.load).toEqual({ type: 'absolute', weight: new Weight(8, 'kilograms') });
  });

  it('restores the displayed opening value when the typed buffer is erased', () => {
    const editor = openEditor(makeWeightedBlueprint({ warmupSets: [{ load: undefined, reps: 10 }] }));
    fireEvent.click(editor.view.getByTestId('warmups-reps-0'));
    fireEvent.click(editor.view.getByText('8'));
    expect(editor.draft().warmupSets[0]?.reps).toBe(8);
    fireEvent.click(editor.view.getByText('Backspace'));
    fireEvent.click(editor.view.getByTestId('warmups-done'));
    expect(editor.saved().warmupSets[0]?.reps).toBe(10);
  });

  it('clears a typed load when it had no opening weight', () => {
    const editor = openEditor(makeWeightedBlueprint({ warmupSets: [{ load: undefined, reps: 10 }] }));
    fireEvent.click(editor.view.getByTestId('warmups-load-0'));
    fireEvent.click(editor.view.getByText('8'));
    expect(editor.draft().warmupSets[0]?.load).toEqual({ type: 'absolute', weight: new Weight(8, 'kilograms') });
    fireEvent.click(editor.view.getByText('Backspace'));
    fireEvent.click(editor.view.getByTestId('warmups-done'));
    expect(editor.saved().warmupSets).toEqual([{ load: undefined, reps: 10 }]);
  });
});

describe('warm-up sheet back', () => {
  it('closes the number pad first and leaves the sheet open', () => {
    const editor = openEditor(
      makeWeightedBlueprint({ warmupSets: [{ load: { type: 'percent', percent: 50 }, reps: 10 }] }),
    );
    fireEvent.click(editor.view.getByTestId('warmups-reps-0'));
    fireEvent.click(editor.view.getByText('8'));

    let consumed = false;
    act(() => {
      consumed = back.press();
    });
    expect(consumed).toBe(true);
    expect(editor.view.queryByText('Backspace')).toBeNull();
    expect(editor.view.getByTestId('warmups-done')).toBeTruthy();
    expect(editor.draft().warmupSets[0]?.reps).toBe(8);

    // With the pad gone, the next back is the navigator's, which closes the sheet.
    expect(back.press()).toBe(false);
  });
});

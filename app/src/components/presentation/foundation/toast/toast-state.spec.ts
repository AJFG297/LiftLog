import { describe, expect, it } from 'vitest';
import {
  hiddenToast,
  toastReducer,
  toastTimeoutMs,
  type ToastEvent,
  type ToastState,
} from '@/components/presentation/foundation/toast/toast-state';

const saved = { id: 1, message: 'Workout saved' };
const removed = { id: 2, message: 'Set removed' };

function run(events: ToastEvent[], from: ToastState = hiddenToast): ToastState {
  return events.reduce(toastReducer, from);
}

describe('toastReducer', () => {
  it('shows, leaves when dismissed, and hides once the exit animation ends', () => {
    expect(run([{ type: 'show', toast: saved }])).toEqual({ phase: 'shown', toast: saved });
    expect(
      run([
        { type: 'show', toast: saved },
        { type: 'dismiss', id: 1 },
      ]),
    ).toEqual({
      phase: 'leaving',
      toast: saved,
    });
    expect(
      run([
        { type: 'show', toast: saved },
        { type: 'dismiss', id: 1 },
        { type: 'exited', id: 1 },
      ]),
    ).toEqual({ phase: 'hidden' });
  });

  it('replaces the showing toast with a new one', () => {
    expect(
      run([
        { type: 'show', toast: saved },
        { type: 'show', toast: removed },
      ]),
    ).toEqual({
      phase: 'shown',
      toast: removed,
    });
  });

  it('brings a new toast straight back while the old one is leaving', () => {
    expect(
      run([
        { type: 'show', toast: saved },
        { type: 'dismiss', id: 1 },
        { type: 'show', toast: removed },
      ]),
    ).toEqual({ phase: 'shown', toast: removed });
  });

  it("ignores the replaced toast's timer and exit animation", () => {
    expect(
      run([
        { type: 'show', toast: saved },
        { type: 'show', toast: removed },
        { type: 'dismiss', id: 1 },
      ]),
    ).toEqual({ phase: 'shown', toast: removed });

    expect(
      run([
        { type: 'show', toast: saved },
        { type: 'dismiss', id: 1 },
        { type: 'show', toast: removed },
        { type: 'exited', id: 1 },
      ]),
    ).toEqual({ phase: 'shown', toast: removed });
  });

  it('does not hide a toast that was never dismissed', () => {
    expect(
      run([
        { type: 'show', toast: saved },
        { type: 'exited', id: 1 },
      ]),
    ).toEqual({
      phase: 'shown',
      toast: saved,
    });
  });
});

describe('toastTimeoutMs', () => {
  const undo = { message: 'Set removed', action: { label: 'Undo', onPress: () => {} } };
  const plain = { message: 'Workout saved' };

  it('times every toast out after five seconds without a screen reader', () => {
    expect(toastTimeoutMs(plain, false)).toBe(5000);
    expect(toastTimeoutMs(undo, false)).toBe(5000);
  });

  it('keeps an actionable toast up for a screen reader, and times out one without an action', () => {
    expect(toastTimeoutMs(undo, true)).toBeUndefined();
    expect(toastTimeoutMs(plain, true)).toBe(5000);
  });
});

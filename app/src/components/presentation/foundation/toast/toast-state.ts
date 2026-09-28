export interface ToastContent {
  message: string;
  /** One action, typically Undo. Pressing it also dismisses the toast. */
  action?: { label: string; onPress: () => void };
}

export interface Toast extends ToastContent {
  id: number;
}

/**
 * One toast at a time. `leaving` is the exit animation: the toast is still drawn but on its way out, and
 * only the matching `exited` removes it.
 */
export type ToastState = { phase: 'hidden' } | { phase: 'shown'; toast: Toast } | { phase: 'leaving'; toast: Toast };

export type ToastEvent =
  | { type: 'show'; toast: Toast }
  /** The timer ran out or the action was pressed. */
  | { type: 'dismiss'; id: number }
  | { type: 'exited'; id: number };

export const hiddenToast: ToastState = { phase: 'hidden' };

/**
 * A new toast replaces whatever is showing or leaving. `dismiss` and `exited` name the toast they're for, so
 * a timer or animation left over from a replaced toast can't dismiss its successor.
 */
export function toastReducer(state: ToastState, event: ToastEvent): ToastState {
  switch (event.type) {
    case 'show':
      return { phase: 'shown', toast: event.toast };
    case 'dismiss':
      return state.phase === 'shown' && state.toast.id === event.id ? { phase: 'leaving', toast: state.toast } : state;
    case 'exited':
      return state.phase === 'leaving' && state.toast.id === event.id ? hiddenToast : state;
  }
}

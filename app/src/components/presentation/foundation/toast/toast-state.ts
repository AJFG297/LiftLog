export interface ToastContent {
  message: string;
  /** One action, typically Undo. Pressing it also dismisses the toast. */
  action?: { label: string; onPress: () => void };
}

export const TOAST_VISIBLE_MS = 5000;

/**
 * How long a toast stays up on its own, or `undefined` for until its action is pressed or a new toast
 * replaces it. A screen-reader user can take longer than any timer to reach the action, so an actionable
 * toast waits for them; they can still dismiss it with the Dismiss action or the escape gesture.
 */
export function toastTimeoutMs(toast: ToastContent, screenReaderEnabled: boolean): number | undefined {
  return screenReaderEnabled && toast.action ? undefined : TOAST_VISIBLE_MS;
}

/** Past this share of the toast's width, letting go dismisses it. */
export const SWIPE_DISMISS_FRACTION = 0.35;
/** A fling at least this fast (px/s) dismisses from a shorter drag. */
export const SWIPE_DISMISS_VELOCITY = 800;
/** The shortest drag a fling can dismiss from, so a twitch of the finger can't. */
export const SWIPE_FLING_MIN_PX = 24;

/**
 * Whether letting go of a horizontal swipe dismisses the toast. Either direction counts. A worklet because the
 * pan gesture's `onEnd` runs on the UI thread, which can't call a plain function.
 */
export function swipeDismisses(translationX: number, velocityX: number, width: number): boolean {
  'worklet';
  const dragged = Math.abs(translationX);
  if (dragged > width * SWIPE_DISMISS_FRACTION) return true;
  return dragged > SWIPE_FLING_MIN_PX && Math.abs(velocityX) > SWIPE_DISMISS_VELOCITY && velocityX * translationX > 0;
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
  /** The timer ran out, the action was pressed, or a screen-reader user dismissed it. */
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

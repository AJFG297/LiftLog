import type { LiveWorkoutFocus } from '@/store/app';

/**
 * The page the live workout shows isn't part of the stored workout, so a relaunch would reopen it on the
 * next set's page instead of the one left open. It is kept in its own key beside the workout (docs/Storage.md,
 * direct `keyValueStore` use). Builds that don't know the key ignore it.
 */
export const LIVE_WORKOUT_FOCUS_KEY = 'LiveWorkoutFocus';

interface StoredLiveWorkoutFocusV1 {
  version: 1;
  sessionId: string;
  exerciseIndex: number;
}

export function encodeLiveWorkoutFocus(focus: LiveWorkoutFocus): string {
  const stored: StoredLiveWorkoutFocusV1 = { version: 1, ...focus };
  return JSON.stringify(stored);
}

/** The stored focus if it belongs to `sessionId`. Anything unreadable counts as none. */
export function decodeLiveWorkoutFocus(raw: string | undefined, sessionId: string): LiveWorkoutFocus | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const stored = JSON.parse(raw) as Partial<StoredLiveWorkoutFocusV1>;
    if (
      stored.version !== 1 ||
      stored.sessionId !== sessionId ||
      !Number.isInteger(stored.exerciseIndex) ||
      stored.exerciseIndex! < 0
    ) {
      return undefined;
    }
    return { sessionId, exerciseIndex: stored.exerciseIndex! };
  } catch {
    return undefined;
  }
}

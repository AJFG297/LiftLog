import { RestTimer } from '@/models/session-models/rest-timer';
import { Duration, OffsetDateTime } from '@js-joda/core';

/**
 * The rest timer isn't part of a stored workout, so a relaunch would lose it. It is kept beside the
 * workout in its own key instead (docs/Storage.md, direct `keyValueStore` use). Builds that don't know
 * the key ignore it.
 */
export const ACTIVE_REST_TIMER_KEY = 'ActiveRestTimer';

interface StoredRestTimerV1 {
  version: 1;
  sessionId: string;
  startedAt: string;
  lengthMs?: number;
}

export function encodeRestTimer(sessionId: string, timer: RestTimer): string {
  const stored: StoredRestTimerV1 = {
    version: 1,
    sessionId,
    startedAt: timer.startedAt.toString(),
    ...(timer.length ? { lengthMs: timer.length.toMillis() } : {}),
  };
  return JSON.stringify(stored);
}

/** The stored timer if it belongs to `sessionId`. Anything unreadable counts as no timer. */
export function decodeRestTimer(raw: string | undefined, sessionId: string): RestTimer | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const stored = JSON.parse(raw) as Partial<StoredRestTimerV1>;
    if (stored.version !== 1 || stored.sessionId !== sessionId || typeof stored.startedAt !== 'string') {
      return undefined;
    }
    const length =
      typeof stored.lengthMs === 'number' && stored.lengthMs > 0 ? Duration.ofMillis(stored.lengthMs) : undefined;
    return new RestTimer(OffsetDateTime.parse(stored.startedAt), length);
  } catch {
    return undefined;
  }
}

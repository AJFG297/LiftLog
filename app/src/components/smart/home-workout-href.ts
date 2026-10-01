import { Href } from 'expo-router';

/** Where a history card on Home goes: the past workout's detail screen. */
export function homeWorkoutHref(sessionId: string): Href {
  return `/workout-detail?sessionId=${encodeURIComponent(sessionId)}`;
}

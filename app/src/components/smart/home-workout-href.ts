import { Href } from 'expo-router';

/**
 * Where a history card on Home goes. It's the workout editor for now; the workout detail screen (PM-25)
 * takes its place here.
 */
export function homeWorkoutHref(sessionId: string): Href {
  return `/history/edit?sessionId=${encodeURIComponent(sessionId)}`;
}

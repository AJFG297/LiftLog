import { LocalDate } from '@js-joda/core';
import { useWorkoutQuery } from '@/hooks/useWorkoutQuery';
import { WorkoutRepository } from '@/services/workout-repository';
import { buildProgressHistory, ProgressHistory } from '@/store/stats/progress-history';

/**
 * The whole finished history as the Progress screens read it, from the workout tables, and kept current
 * after each write. Undefined while loading. It rebuilds every workout, so call it once per screen and hand
 * the result down.
 */
export function useProgressHistory(): ProgressHistory | undefined {
  return useWorkoutQuery(loadProgressHistory, []);
}

export async function loadProgressHistory(repository: WorkoutRepository): Promise<ProgressHistory> {
  const earliest = await repository.earliestDate();
  if (!earliest) {
    return buildProgressHistory([]);
  }
  // Latest first from the repository; the walk needs the order the workouts happened in.
  const sessions = await repository.finishedBetween(earliest, LocalDate.now());
  return buildProgressHistory(sessions.reverse());
}

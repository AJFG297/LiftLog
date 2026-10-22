import { LocalDate } from '@js-joda/core';
import { useWorkoutQuery } from '@/hooks/useWorkoutQuery';
import { WorkoutRepository } from '@/services/workout-repository';
import type { ProgressHistory } from '@/store/stats/progress-history';
import { progressHistoryCacheFor } from '@/services/progress-history-cache';
import { useToday } from '@/hooks/useToday';

/** Finished history shared by all Progress routes, refreshed after relevant committed writes. */
export function useProgressHistory(): ProgressHistory | undefined {
  const today = useToday();
  return useWorkoutQuery((repository) => loadProgressHistory(repository, today), [today.toString()]);
}

export function loadProgressHistory(repository: WorkoutRepository, today = LocalDate.now()): Promise<ProgressHistory> {
  return progressHistoryCacheFor(repository).read(today);
}

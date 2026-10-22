import { LocalDate } from '@js-joda/core';
import { WorkoutRepository } from '@/services/workout-repository';
import { buildProgressHistory, ProgressHistory } from '@/store/stats/progress-history';

const caches = new WeakMap<WorkoutRepository, ProgressHistoryCache>();

/** One lazy cache per database/repository lifetime, shared across route mounts. */
export function progressHistoryCacheFor(repository: WorkoutRepository): ProgressHistoryCache {
  let cache = caches.get(repository);
  if (!cache) {
    cache = new ProgressHistoryCache(repository);
    caches.set(repository, cache);
  }
  return cache;
}

export class ProgressHistoryCache {
  private generation = 0;
  private day: LocalDate | undefined;
  private value: ProgressHistory | undefined;
  private pending: Promise<ProgressHistory> | undefined;

  constructor(private readonly repository: WorkoutRepository) {
    repository.subscribeFinishedHistory(() => this.invalidate());
  }

  read(today = LocalDate.now()): Promise<ProgressHistory> {
    if (!this.day?.equals(today)) {
      this.day = today;
      this.invalidate();
    }
    if (this.value) return Promise.resolve(this.value);
    // Keep callers on the same promise even if a write interrupts its read. The loop below retries
    // against the newest generation before any caller can receive an obsolete result.
    return (this.pending ??= this.load().finally(() => {
      this.pending = undefined;
    }));
  }

  private invalidate(): void {
    this.generation++;
    this.value = undefined;
  }

  private async load(): Promise<ProgressHistory> {
    for (;;) {
      const generation = this.generation;
      const today = this.day!;
      const earliest = await this.repository.earliestDate();
      const sessions = earliest ? await this.repository.finishedBetween(earliest, today) : [];
      if (generation !== this.generation) continue;
      const value = buildProgressHistory(sessions.reverse());
      this.value = value;
      return value;
    }
  }
}

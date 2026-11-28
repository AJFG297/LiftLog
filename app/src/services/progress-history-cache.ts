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

interface CachedEntry {
  readonly day: string;
  readonly value: ProgressHistory;
}

interface InFlightEntry {
  readonly day: string;
  readonly token: object;
  readonly promise: Promise<ProgressHistory>;
}

class ProgressHistoryCache {
  private generation = 0;
  private cached: CachedEntry | undefined;
  private inFlight: InFlightEntry | undefined;

  constructor(private readonly repository: WorkoutRepository) {
    repository.subscribeFinishedHistory(() => this.invalidate());
  }

  read(today = LocalDate.now()): Promise<ProgressHistory> {
    const day = today.toString();
    if (this.cached?.day === day) return Promise.resolve(this.cached.value);
    if (this.inFlight?.day === day) return this.inFlight.promise;

    this.cached = undefined;
    const token = {};
    let settled = false;
    const promise = this.load(today, day, token, () => {
      settled = true;
    });
    if (!settled) {
      this.inFlight = { day, token, promise };
    }
    return promise;
  }

  private invalidate(): void {
    this.generation++;
    this.cached = undefined;
  }

  private async load(today: LocalDate, day: string, token: object, onSettled: () => void): Promise<ProgressHistory> {
    try {
      for (;;) {
        const generation = this.generation;
        const earliest = await this.repository.earliestDate();
        const sessions = earliest ? await this.repository.finishedBetween(earliest, today) : [];
        if (generation !== this.generation) continue;
        const value = buildProgressHistory(sessions.reverse());
        if (this.inFlight?.token === token) {
          this.cached = { day, value };
        }
        return value;
      }
    } finally {
      // Run inside load() so the in-flight slot clears synchronously before callers observe settlement.
      onSettled();
      if (this.inFlight?.token === token) {
        this.inFlight = undefined;
      }
    }
  }
}

export type { ProgressHistoryCache };

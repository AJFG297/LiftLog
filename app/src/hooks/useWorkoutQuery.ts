import { useServices } from '@/components/smart/services-provider';
import { WorkoutRepository, WorkoutWrite } from '@/services/workout-repository';
import { useIsFocused } from 'expo-router';
import { DependencyList, useEffect, useRef, useState } from 'react';

export interface WorkoutQueryOptions {
  /**
   * Writes that can't change the answer, which the query then doesn't re-run for: a query that leaves the
   * workout in progress out need not run again on every set logged in it.
   */
  ignoreWrite?: (write: WorkoutWrite) => boolean;
  /**
   * Keep the last answer on screen while a query for new `deps` is in flight, for inputs that only extend
   * the answer, like a list loading its next page.
   */
  keepPrevious?: boolean;
}

/**
 * Reads from the workout tables and keeps the result current: `query` runs on mount, again whenever `deps`
 * change, and again after any workout write lands (`WorkoutRepository.subscribe`). Returns `undefined`
 * until the first answer, and again while a query for new `deps` is in flight, so a screen never shows
 * last month's list under this month's title; a refresh after a write keeps the old value on screen until
 * the new one arrives.
 *
 * Writes while the screen is offscreen are only counted; it re-queries once it is focused again, and not
 * at all if nothing was written meanwhile. That is what lets Home and History sit under the workout
 * screen while sets are logged, as `useAppSelectorWhenFocused` did for the selectors this replaces.
 *
 * `deps` are compared like `useEffect`'s, so pass primitives (`yearMonth.toString()`), not js-joda values.
 */
export function useWorkoutQuery<T>(
  query: (repository: WorkoutRepository) => Promise<T>,
  deps: DependencyList,
  { ignoreWrite, keepPrevious = false }: WorkoutQueryOptions = {},
): T | undefined {
  const { workoutRepository } = useServices();
  const isFocused = useIsFocused();
  const [result, setResult] = useState<{ value: T } | undefined>(undefined);
  // Bumped by every write; the effect below compares it with the generation it last answered.
  const [generation, setGeneration] = useState(0);
  const lastRun = useRef<{ deps: DependencyList; generation: number } | undefined>(undefined);
  const latestQuery = useRef(query);
  latestQuery.current = query;
  const latestIgnoreWrite = useRef(ignoreWrite);
  latestIgnoreWrite.current = ignoreWrite;

  // Subscribed before the first query runs (effects run in order), so a write can't slip between them.
  useEffect(() => {
    return workoutRepository.subscribe((write) => {
      if (!latestIgnoreWrite.current?.(write)) {
        setGeneration((n) => n + 1);
      }
    });
  }, [workoutRepository]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    const depsChanged = !lastRun.current || !sameDeps(lastRun.current.deps, deps);
    const written = lastRun.current !== undefined && lastRun.current.generation !== generation;
    if (!depsChanged && !written) {
      return;
    }
    lastRun.current = { deps, generation };
    if (depsChanged && !keepPrevious) {
      setResult(undefined);
    }
    let settled = false;
    let cancelled = false;
    void latestQuery
      .current(workoutRepository)
      .then((value) => {
        settled = true;
        if (!cancelled) {
          setResult({ value });
        }
      })
      .catch(() => {
        // Left to the next refresh; a failed read shows as "loading", never as stale data.
      });
    return () => {
      cancelled = true;
      // Interrupted (the screen left, or another write landed) before it answered: run again next time.
      if (!settled) {
        lastRun.current = undefined;
      }
    };
    // `deps` are the caller's; the rest is what the body reads.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [workoutRepository, isFocused, generation, keepPrevious, ...deps]);

  return result?.value;
}

function sameDeps(a: DependencyList, b: DependencyList): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

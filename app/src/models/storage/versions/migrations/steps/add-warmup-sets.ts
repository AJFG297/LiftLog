import type { OffsetDateTimeJSON } from '@/models/storage/versions/libs';
import type { WeightJSON } from '@/models/storage/versions/libs/weight';

type WarmupLoad = { type: 'percent'; percent: number } | { type: 'absolute'; weight: WeightJSON };

interface PlannedWarmupSet {
  load?: WarmupLoad | undefined;
  reps: number;
}

interface PotentialSet {
  target: { reps: { min: number; max: number } };
  set?: { repsCompleted: number; completionDateTime: OffsetDateTimeJSON } | undefined;
  weight: WeightJSON;
  rpe?: number | undefined;
}

/** Gives a weighted exercise blueprint an empty warm-up plan: nothing before now planned any. */
export function addPlannedWarmupSets<T extends object>(ex: T) {
  return { ...ex, warmupSets: [] as PlannedWarmupSet[] };
}

/**
 * Gives a recorded weighted exercise no warm-up slots, and its blueprint no planned warm-ups. Every
 * set logged before warm-ups existed was a working set, so none of them move.
 */
export function addWarmupSlots<T extends { blueprint: object }>(ex: T) {
  return { ...ex, blueprint: addPlannedWarmupSets(ex.blueprint), warmupSets: [] as PotentialSet[] };
}

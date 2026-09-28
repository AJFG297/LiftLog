type PlannedSetKind = 'working' | 'drop' | 'myo' | 'failure';
type SlotKind = PlannedSetKind | 'warmup';

interface PlannedSet {
  reps: { min: number; max: number };
}

interface Slot {
  target: { reps: { min: number; max: number } };
}

type WithPlannedSetKinds<T extends { plannedSets: PlannedSet[] }> = Omit<T, 'plannedSets'> & {
  plannedSets: (T['plannedSets'][number] & { kind: PlannedSetKind })[];
};

/** Every set planned before set kinds existed was a working set. */
export function addPlannedSetKinds<T extends { plannedSets: PlannedSet[] }>(ex: T): WithPlannedSetKinds<T> {
  return { ...ex, plannedSets: ex.plannedSets.map((s) => ({ ...s, kind: 'working' })) };
}

/**
 * Each list already said what its sets were: the working list held working sets and the warm-up list
 * warm-ups, so the kinds follow the lists and nothing moves.
 */
export function addSlotKinds<
  T extends { blueprint: { plannedSets: PlannedSet[] }; potentialSets: Slot[]; warmupSets: Slot[] },
>(
  ex: T,
): Omit<T, 'blueprint' | 'potentialSets' | 'warmupSets'> & {
  blueprint: WithPlannedSetKinds<T['blueprint']>;
  potentialSets: (T['potentialSets'][number] & { kind: SlotKind })[];
  warmupSets: (T['warmupSets'][number] & { kind: SlotKind })[];
} {
  return {
    ...ex,
    blueprint: addPlannedSetKinds(ex.blueprint),
    potentialSets: ex.potentialSets.map((s) => ({ ...s, kind: 'working' })),
    warmupSets: ex.warmupSets.map((s) => ({ ...s, kind: 'warmup' })),
  };
}

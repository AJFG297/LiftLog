import {
  nextWarmupSet,
  PlannedWarmupSet,
  RepsTarget,
  WarmupLoad,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import type { SetKind, SetList } from '@/models/session-models/set-kind';

/** Where a set sits in a planned exercise: warm-ups and the working list are separate lists. */
export interface RoutineSetPosition {
  list: SetList;
  index: number;
}

/** One row of the routine editor's set table, warm-ups first, as the workout shows them. */
export interface RoutineSetRow {
  position: RoutineSetPosition;
  kind: SetKind;
  reps: RepsTarget;
  /** A warm-up's planned load. Undefined on a working-list set, whose weight carries over instead. */
  warmupLoad: WarmupLoad | undefined;
}

export function routineSetRowsOf(exercise: WeightedExerciseBlueprint): RoutineSetRow[] {
  return [
    ...exercise.warmupSets.map(
      (warmup, index): RoutineSetRow => ({
        position: { list: 'warmup', index },
        kind: 'warmup',
        reps: { min: warmup.reps, max: warmup.reps },
        warmupLoad: warmup.load,
      }),
    ),
    ...exercise.plannedSets.map(
      (planned, index): RoutineSetRow => ({
        position: { list: 'working', index },
        kind: planned.kind,
        reps: { ...planned.reps },
        warmupLoad: undefined,
      }),
    ),
  ];
}

/** An exercise keeps at least one working set, so the last one can be neither removed nor made a warm-up. */
function isLastWorkingSet(exercise: WeightedExerciseBlueprint, position: RoutineSetPosition): boolean {
  return position.list === 'working' && exercise.plannedSets.length <= 1;
}

export function canChangeRoutineSetKind(
  exercise: WeightedExerciseBlueprint,
  position: RoutineSetPosition,
  kind: SetKind,
): boolean {
  return !(kind === 'warmup' && isLastWorkingSet(exercise, position));
}

/**
 * The exercise with the set at `position` planned as `kind`. As in the live workout, a set that becomes a
 * warm-up moves to the end of the warm-ups, and a warm-up that stops being one becomes the first working
 * set, keeping its reps.
 */
export function withRoutineSetKind(
  exercise: WeightedExerciseBlueprint,
  position: RoutineSetPosition,
  kind: SetKind,
): WeightedExerciseBlueprint {
  if (!canChangeRoutineSetKind(exercise, position, kind)) {
    return exercise;
  }
  if (position.list === 'working') {
    const planned = exercise.plannedSets[position.index];
    if (!planned || planned.kind === kind) {
      return exercise;
    }
    if (kind !== 'warmup') {
      return exercise.with({ plannedSets: exercise.plannedSets.with(position.index, { ...planned, kind }) });
    }
    const warmup: PlannedWarmupSet = {
      ...nextWarmupSet(exercise.resistance, exercise.warmupSets),
      reps: planned.reps.max,
    };
    return exercise.with({
      plannedSets: exercise.plannedSets.filter((_, index) => index !== position.index),
      warmupSets: [...exercise.warmupSets, warmup],
    });
  }
  const warmup = exercise.warmupSets[position.index];
  if (!warmup || kind === 'warmup') {
    return exercise;
  }
  return exercise.with({
    warmupSets: exercise.warmupSets.filter((_, index) => index !== position.index),
    plannedSets: [{ reps: { min: warmup.reps, max: warmup.reps }, kind }, ...exercise.plannedSets],
  });
}

export function canRemoveRoutineSet(exercise: WeightedExerciseBlueprint, position: RoutineSetPosition): boolean {
  const list = position.list === 'warmup' ? exercise.warmupSets : exercise.plannedSets;
  return position.index >= 0 && position.index < list.length && !isLastWorkingSet(exercise, position);
}

export function withRoutineSetRemoved(
  exercise: WeightedExerciseBlueprint,
  position: RoutineSetPosition,
): WeightedExerciseBlueprint {
  if (!canRemoveRoutineSet(exercise, position)) {
    return exercise;
  }
  return position.list === 'warmup'
    ? exercise.with({ warmupSets: exercise.warmupSets.filter((_, index) => index !== position.index) })
    : exercise.with({ plannedSets: exercise.plannedSets.filter((_, index) => index !== position.index) });
}

/** "Add set": one more working set, on the last working set's reps. */
export function withRoutineSetAdded(exercise: WeightedExerciseBlueprint): WeightedExerciseBlueprint {
  return exercise.withSets(exercise.plannedSets.length + 1);
}

/**
 * The set at `position` with a new rep target. A warm-up plans a single number, so it takes the top of the
 * band.
 */
export function withRoutineSetReps(
  exercise: WeightedExerciseBlueprint,
  position: RoutineSetPosition,
  reps: RepsTarget,
): WeightedExerciseBlueprint {
  const min = Math.max(1, Math.min(reps.min, reps.max));
  const max = Math.max(1, reps.max, reps.min);
  if (position.list === 'warmup') {
    const warmup = exercise.warmupSets[position.index];
    return warmup
      ? exercise.with({ warmupSets: exercise.warmupSets.with(position.index, { ...warmup, reps: max }) })
      : exercise;
  }
  const planned = exercise.plannedSets[position.index];
  return planned
    ? exercise.with({ plannedSets: exercise.plannedSets.with(position.index, { ...planned, reps: { min, max } }) })
    : exercise;
}

export function withWarmupLoad(
  exercise: WeightedExerciseBlueprint,
  warmupIndex: number,
  load: WarmupLoad | undefined,
): WeightedExerciseBlueprint {
  const warmup = exercise.warmupSets[warmupIndex];
  return warmup ? exercise.with({ warmupSets: exercise.warmupSets.with(warmupIndex, { ...warmup, load }) }) : exercise;
}

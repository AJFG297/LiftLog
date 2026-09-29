import { RepsTarget } from '@/models/blueprint-models';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import { setLabels } from '@/models/session-models/set-kind';
import { Weight } from '@/models/weight';

/** "5 × 5": how many sets the progression check read last time, and the reps when they were all alike. */
export interface LastTime {
  sets: number;
  reps: number;
}

/** Why today's numbers are what they are, compared with the performance they were carried from. */
export type TargetReason =
  | { kind: 'firstTime' }
  | { kind: 'weightUp'; by: Weight; lastTime: LastTime | undefined }
  | { kind: 'weightDown'; by: Weight }
  | { kind: 'repsUp'; by: number; lastTime: LastTime | undefined }
  | { kind: 'repeatAfterSuccess'; lastTime: LastTime | undefined }
  /** `reps` is undefined when the set was never logged. */
  | { kind: 'repeatAfterMiss'; setLabel: string; reps: number | undefined; target: number };

export interface TodaysTarget {
  /**
   * Undefined for a movement that tracks no load, or an empty bar that has not been loaded yet. For a
   * bodyweight movement it is the added load, and nothing added still reads as bodyweight.
   */
  weight: Weight | undefined;
  reps: RepsTarget;
  reason: TargetReason;
}

/**
 * The top set's numbers for today, and why. Progression runs once, at session start, and keeps no record
 * of what it did, so the reason is read back from the difference with `previous`, the performance today
 * carried on from (see {@link RecordedWeightedExercise.previousPerformanceIn}).
 */
export function todaysTarget(
  exercise: RecordedWeightedExercise,
  previous: RecordedWeightedExercise | undefined,
): TodaysTarget | undefined {
  const index = topSetIndex(exercise);
  const slot = exercise.potentialSets[index];
  if (!slot) {
    return undefined;
  }
  return {
    weight: showsWeight(exercise, slot.weight) ? slot.weight : undefined,
    reps: exercise.repsTargetForSet(index),
    reason: reasonFor(exercise, index, previous),
  };
}

function showsWeight(exercise: RecordedWeightedExercise, weight: Weight): boolean {
  if (!exercise.tracksResistance) {
    return false;
  }
  return exercise.blueprint.resistance === 'bodyweight' || !weight.value.isZero();
}

/** The heaviest set the progression check reads, the first on a tie; any set if none is read. */
function topSetIndex(exercise: RecordedWeightedExercise): number {
  const counted = exercise.workingIndicesCountingTowards('countsTowardsProgression');
  const candidates = counted.length ? counted : exercise.potentialSets.map((_, index) => index);
  return candidates.reduce(
    (top, index) =>
      exercise.potentialSets[index]!.weight.isGreaterThan(exercise.potentialSets[top]!.weight) ? index : top,
    candidates[0] ?? 0,
  );
}

function reasonFor(
  exercise: RecordedWeightedExercise,
  index: number,
  previous: RecordedWeightedExercise | undefined,
): TargetReason {
  const before = previous?.potentialSets[index];
  if (!previous || !before) {
    return { kind: 'firstTime' };
  }
  const now = exercise.potentialSets[index]!;
  const lastTime = previous.isSuccessForProgressiveOverload ? lastTimeOf(previous) : undefined;

  // Weights in different units are converted, not compared: 100 kg carried as 220.46 lb is not a change.
  if (exercise.tracksResistance && now.weight.unit === before.weight.unit && !now.weight.equals(before.weight)) {
    const by = now.weight.minus(before.weight);
    return by.value.isPositive() ? { kind: 'weightUp', by, lastTime } : { kind: 'weightDown', by: by.abs() };
  }
  const repsBy = exercise.repsTargetForSet(index).max - previous.repsTargetForSet(index).max;
  if (repsBy > 0) {
    return { kind: 'repsUp', by: repsBy, lastTime };
  }
  if (previous.isSuccessForProgressiveOverload) {
    return { kind: 'repeatAfterSuccess', lastTime };
  }
  return missedSetOf(previous);
}

function lastTimeOf(previous: RecordedWeightedExercise): LastTime | undefined {
  const reps = previous
    .setsCountingTowards('countsTowardsProgression')
    .map((slot) => slot.set?.repsCompleted)
    .filter((value) => value !== undefined);
  const first = reps[0];
  return first !== undefined && reps.every((value) => value === first) ? { sets: reps.length, reps: first } : undefined;
}

function missedSetOf(previous: RecordedWeightedExercise): TargetReason {
  const labels = setLabels(previous.potentialSets.map((slot) => slot.kind));
  const missed = previous.workingIndicesCountingTowards('countsTowardsProgression').find((index) => {
    const reps = previous.potentialSets[index]!.set?.repsCompleted;
    return reps === undefined || reps < previous.repsTargetForSet(index).max;
  });
  if (missed === undefined) {
    return { kind: 'repeatAfterSuccess', lastTime: undefined };
  }
  return {
    kind: 'repeatAfterMiss',
    setLabel: labels[missed]!,
    reps: previous.potentialSets[missed]!.set?.repsCompleted,
    target: previous.repsTargetForSet(missed).max,
  };
}

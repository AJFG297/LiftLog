import { MovementKey, RepsTarget } from '@/models/blueprint-models';
import { RecordedCardioExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import { setKindHas } from '@/models/session-models/set-kind';
import { Weight } from '@/models/weight';

/** How many earlier workouts of the same routine make up its usual length. */
const USUAL_DURATION_SAMPLE = 5;

export type DurationComparison = { type: 'none' } | { type: 'same' } | { type: 'longer' | 'shorter'; minutes: number };

/**
 * How long this workout took against the usual for its routine: the median length of the last five
 * earlier workouts with the same name. Whole minutes on both sides, so a few seconds either way reads
 * as the same.
 */
export function durationVsUsual(session: Session, history: readonly Session[]): DurationComparison {
  const current = minutesOf(session);
  const start = session.startTime;
  if (current === undefined || !start) {
    return { type: 'none' };
  }
  const earlier = history
    .filter((s) => s.id !== session.id && s.blueprint.name === session.blueprint.name)
    .filter((s) => s.endTime?.isBefore(start) && minutesOf(s) !== undefined)
    .sort((a, b) => b.endTime!.compareTo(a.endTime!))
    .slice(0, USUAL_DURATION_SAMPLE)
    .map((s) => minutesOf(s)!);
  if (earlier.length === 0) {
    return { type: 'none' };
  }
  const delta = current - Math.round(median(earlier));
  if (delta === 0) {
    return { type: 'same' };
  }
  return { type: delta > 0 ? 'longer' : 'shorter', minutes: Math.abs(delta) };
}

/** A workout's length in whole minutes, rounded. */
export function minutesOf(session: Session): number | undefined {
  const duration = session.duration;
  return duration ? Math.round(duration.seconds() / 60) : undefined;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export type VolumeComparison = { type: 'none' } | { type: 'same' } | { type: 'up' | 'down'; percent: number };

/**
 * Volume against the last workout of the same routine, as a percentage to one decimal place. `none` when
 * there was no last time, or it moved no weight to compare with.
 */
export function volumeVsLast(session: Session, previous: Session | undefined): VolumeComparison {
  const before = previous ? kilograms(previous.totalWeightLifted) : 0;
  if (before <= 0) {
    return { type: 'none' };
  }
  const percent = Math.round(((kilograms(session.totalWeightLifted) - before) / before) * 1000) / 10;
  if (percent === 0) {
    return { type: 'same' };
  }
  return { type: percent > 0 ? 'up' : 'down', percent: Math.abs(percent) };
}

function kilograms(weight: Weight): number {
  return weight.convertTo('kilograms').value.toNumber();
}

export interface SetCounts {
  /** Every logged set that is not a warm-up, drop and myo sets included, plus logged cardio sets. */
  working: number;
  warmup: number;
}

export function setCounts(session: Session): SetCounts {
  let working = 0;
  let warmup = 0;
  for (const exercise of session.recordedExercises) {
    if (exercise instanceof RecordedWeightedExercise) {
      working += exercise.potentialSets.filter((s) => s.set).length;
      warmup += exercise.warmupSets.filter((s) => s.set).length;
    } else if (exercise instanceof RecordedCardioExercise) {
      working += exercise.sets.filter((s) => s.completionDateTime).length;
    }
  }
  return { working, warmup };
}

/** The heaviest logged set of an exercise, and its reps. The weight is what was entered, before any bodyweight. */
export interface BestSet {
  weight: Weight;
  reps: number;
}

export type BestSetChange =
  | { type: 'new' }
  | { type: 'same' }
  | { type: 'weight'; delta: Weight }
  | { type: 'reps'; delta: number };

export interface BestSetComparison {
  key: MovementKey;
  name: string;
  best: BestSet;
  /** False for a movement with no load, where only reps are compared. */
  tracksWeight: boolean;
  change: BestSetChange;
}

/**
 * Each exercise's best set against its best set last time, weight first and then reps. An exercise
 * that wasn't in the last workout of the routine is `new`.
 */
export function bestSetComparisons(session: Session, previous: Session | undefined): BestSetComparison[] {
  const before = previous ? bestSets(previous) : new Map<MovementKey, ExerciseBest>();
  return Array.from(bestSets(session), ([key, { name, best, tracksWeight }]) => ({
    key,
    name,
    best,
    tracksWeight,
    change: changeBetween(best, before.get(key)?.best, tracksWeight),
  }));
}

function changeBetween(best: BestSet, previous: BestSet | undefined, tracksWeight: boolean): BestSetChange {
  if (!previous) {
    return { type: 'new' };
  }
  const delta = best.weight.minus(previous.weight);
  if (tracksWeight && !delta.value.isZero()) {
    return { type: 'weight', delta };
  }
  const reps = best.reps - previous.reps;
  return reps === 0 ? { type: 'same' } : { type: 'reps', delta: reps };
}

interface ExerciseBest {
  name: string;
  best: BestSet;
  tracksWeight: boolean;
}

function bestSets(session: Session): Map<MovementKey, ExerciseBest> {
  const best = new Map<MovementKey, ExerciseBest>();
  for (const exercise of session.recordedExercises) {
    if (!(exercise instanceof RecordedWeightedExercise) || !exercise.isStarted) {
      continue;
    }
    const key = exercise.movementKey();
    const current = best.get(key);
    let top = current?.best;
    for (const slot of exercise.potentialSets) {
      if (!slot.set) {
        continue;
      }
      const candidate = { weight: slot.weight, reps: slot.set.repsCompleted };
      if (!top || isBetter(candidate, top, exercise.tracksResistance)) {
        top = candidate;
      }
    }
    if (top) {
      best.set(key, {
        name: current?.name ?? exercise.blueprint.name,
        best: top,
        tracksWeight: exercise.tracksResistance,
      });
    }
  }
  return best;
}

function isBetter(candidate: BestSet, top: BestSet, tracksWeight: boolean): boolean {
  if (tracksWeight && !candidate.weight.equals(top.weight, true)) {
    return candidate.weight.isGreaterThan(top.weight);
  }
  return candidate.reps > top.reps;
}

export interface NextTarget {
  name: string;
  /** Undefined for a movement with no load, or one done with none. */
  weight: Weight | undefined;
  reps: RepsTarget;
}

/**
 * What the next workout of the routine opens on, one line per weighted exercise logged in `done`: its
 * heaviest set that progression moves, with that set's rep target. An exercise skipped today is left
 * out, since nothing about it changed.
 */
export function nextTargets(next: Session, done: Session): NextTarget[] {
  const logged = new Set(
    done.recordedExercises
      .filter((exercise) => exercise instanceof RecordedWeightedExercise && exercise.isStarted)
      .map((exercise) => exercise.movementKey()),
  );
  return next.recordedExercises.flatMap((exercise) => {
    if (!(exercise instanceof RecordedWeightedExercise) || !logged.has(exercise.movementKey())) {
      return [];
    }
    const progressed = exercise.potentialSets.filter((s) => setKindHas(s.kind, 'countsTowardsProgression'));
    const top = (progressed.length ? progressed : exercise.potentialSets).reduce<
      (typeof exercise.potentialSets)[number] | undefined
    >((max, slot) => (!max || slot.weight.isGreaterThan(max.weight) ? slot : max), undefined);
    if (!top) {
      return [];
    }
    return [
      {
        name: exercise.blueprint.name,
        weight: exercise.tracksResistance && !top.weight.value.isZero() ? top.weight : undefined,
        reps: top.target,
      },
    ];
  });
}

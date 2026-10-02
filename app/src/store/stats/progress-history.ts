import { LocalDate } from '@js-joda/core';
import { MovementKey, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { Weight, WeightUnit } from '@/models/weight';
import { calculateOneRepMax, primaryAxisFor } from '@/store/stats/calculate-stats';
import { RecordLedger, SessionRecord } from '@/store/stats/personal-records';
import { StatAxis } from '@/store/stats/quantity';

/** One movement in one finished workout. A workout that logged the movement twice gives one point. */
export interface ExercisePoint {
  workoutId: string;
  date: LocalDate;
  /**
   * The best Epley estimate over the sets that count towards records, with bodyweight folded in as records
   * fold it. Undefined for a movement that tracks no load, and when only drop or myo sets were logged.
   */
  oneRepMax: Weight | undefined;
  /** The most reps in a set that counts towards records, 0 if none did: the axis of a no-load movement. */
  bestReps: number;
  /** Logged sets that count towards volume (every kind but warm-ups), as Stats' sets per week counts them. */
  workingSets: number;
}

export interface ExerciseHistory {
  key: MovementKey;
  /** The name it was last logged under. */
  name: string;
  /** The blueprint it was last logged with: how it is set up now (resistance, exercise id for muscles). */
  blueprint: WeightedExerciseBlueprint;
  /** Oldest first, one per workout that started it. */
  points: ExercisePoint[];
}

/** A record and the workout that set it. */
export interface DatedRecord {
  record: SessionRecord;
  workoutId: string;
  date: LocalDate;
}

/**
 * Everything the Progress screens read about lifting, from one walk over the finished history. Only weighted
 * exercises with a logged set count; cardio and exercises left untouched are not here.
 */
export interface ProgressHistory {
  exercises: ReadonlyMap<MovementKey, ExerciseHistory>;
  /** Every record ever set, oldest first, and within a workout in exercise order. */
  records: readonly DatedRecord[];
  /** The earliest workout's date, started or not, as `WorkoutRepository.earliestDate` gives it. */
  firstDate: LocalDate | undefined;
}

/** Builds the history in one pass; `sessionsOldestFirst` must be in the order the workouts happened. */
export function buildProgressHistory(sessionsOldestFirst: readonly Session[]): ProgressHistory {
  const ledger = new RecordLedger();
  const exercises = new Map<MovementKey, ExerciseHistory>();
  const records: DatedRecord[] = [];
  let firstDate: LocalDate | undefined;

  for (const session of sessionsOldestFirst) {
    if (!firstDate || session.date.isBefore(firstDate)) {
      firstDate = session.date;
    }
    for (const record of ledger.add(session)) {
      records.push({ record, workoutId: session.id, date: session.date });
    }
    for (const [key, { blueprint, point }] of pointsOf(session)) {
      const history = exercises.get(key);
      if (history) {
        history.name = blueprint.name;
        history.blueprint = blueprint;
        history.points.push(point);
      } else {
        exercises.set(key, { key, name: blueprint.name, blueprint, points: [point] });
      }
    }
  }

  return { exercises, records, firstDate };
}

function pointsOf(session: Session): Map<MovementKey, { blueprint: WeightedExerciseBlueprint; point: ExercisePoint }> {
  const points = new Map<MovementKey, { blueprint: WeightedExerciseBlueprint; point: ExercisePoint }>();
  for (const exercise of session.recordedExercises) {
    if (exercise.type !== 'RecordedWeightedExercise' || !exercise.isStarted) {
      continue;
    }
    const key = exercise.movementKey();
    const point = pointOf(session, exercise);
    const existing = points.get(key);
    points.set(key, { blueprint: exercise.blueprint, point: existing ? merged(existing.point, point) : point });
  }
  return points;
}

function pointOf(session: Session, exercise: RecordedWeightedExercise): ExercisePoint {
  let oneRepMax: Weight | undefined;
  let bestReps = 0;
  for (const potentialSet of exercise.setsCountingTowards('countsTowardsPrs')) {
    const reps = potentialSet.set?.repsCompleted;
    if (!reps) {
      continue;
    }
    bestReps = Math.max(bestReps, reps);
    if (exercise.tracksResistance) {
      const estimate = calculateOneRepMax(potentialSet, exercise.effectiveWeight(potentialSet, session.bodyweight));
      if (!oneRepMax || estimate.isGreaterThan(oneRepMax)) {
        oneRepMax = estimate;
      }
    }
  }
  return {
    workoutId: session.id,
    date: session.date,
    oneRepMax,
    bestReps,
    workingSets: exercise.setsCountingTowards('countsTowardsVolume').filter((x) => x.set).length,
  };
}

function merged(a: ExercisePoint, b: ExercisePoint): ExercisePoint {
  const oneRepMax = !a.oneRepMax || (b.oneRepMax && b.oneRepMax.isGreaterThan(a.oneRepMax)) ? b.oneRepMax : a.oneRepMax;
  return {
    ...a,
    oneRepMax,
    bestReps: Math.max(a.bestReps, b.bestReps),
    workingSets: a.workingSets + b.workingSets,
  };
}

/** First against last over a window, on the exercise's axis. `delta` is in `last`'s unit. */
export type ProgressChange =
  | { axis: 'load'; first: Weight; last: Weight; delta: Weight }
  | { axis: 'reps'; first: number; last: number; delta: number };

export interface ExerciseProgress {
  /** Read off the blueprint it was last logged with: reps for a movement that tracks no load, else load. */
  axis: StatAxis;
  /** The points on or after the window's start, oldest first. */
  points: readonly ExercisePoint[];
  /** Undefined with fewer than two points in the window that have a value on the axis. */
  change: ProgressChange | undefined;
}

/**
 * An exercise's points since `since` (inclusive) and how far it moved over them: the first point's estimated
 * 1RM against the last's, or best reps for a movement that tracks no load.
 */
export function progressSince(history: ExerciseHistory, since: LocalDate): ExerciseProgress {
  const axis = primaryAxisFor(history.blueprint);
  const points = history.points.filter((point) => !point.date.isBefore(since));
  if (axis === 'reps') {
    const valued = points.flatMap((point) => (point.bestReps > 0 ? [point.bestReps] : []));
    const first = valued[0];
    const last = valued.at(-1);
    const change =
      valued.length >= 2 && first !== undefined && last !== undefined
        ? { axis, first, last, delta: last - first }
        : undefined;
    return { axis, points, change };
  }
  const valued = points.flatMap((point) => (point.oneRepMax ? [point.oneRepMax] : []));
  const first = valued[0];
  const last = valued.at(-1);
  const change = valued.length >= 2 && first && last ? { axis, first, last, delta: last.minus(first) } : undefined;
  return { axis, points, change };
}

/**
 * The window's values on its axis as plain numbers, oldest first, for a sparkline: estimated 1RMs in `unit`,
 * or best reps. Points with no value on the axis are left out.
 */
export function trendValues(progress: ExerciseProgress, unit: WeightUnit): number[] {
  if (progress.axis === 'reps') {
    return progress.points.flatMap((point) => (point.bestReps > 0 ? [point.bestReps] : []));
  }
  return progress.points.flatMap((point) =>
    point.oneRepMax ? [point.oneRepMax.convertTo(unit).value.toNumber()] : [],
  );
}

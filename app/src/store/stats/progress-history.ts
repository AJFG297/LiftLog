import { LocalDate } from '@js-joda/core';
import { MovementKey, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { Weight, WeightUnit } from '@/models/weight';
import { primaryAxisFor } from '@/store/stats/calculate-stats';
import { bestOneRepMaxSet, RecordLedger, SessionRecord } from '@/store/stats/personal-records';
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
  /** The set {@link oneRepMax} comes from, as lifted. */
  oneRepMaxSet: LiftedSet | undefined;
  /** Every logged set that counts towards records, as lifted, in the order done: the exercise page's heaviest and reps bests. */
  sets: readonly LiftedSet[];
  /**
   * Load times reps over the sets that count towards volume, bodyweight folded in as for the estimate. Nothing
   * (`Weight.NIL`) for a movement that tracks no load.
   */
  volume: Weight;
  /** Reps over the sets that count towards volume: the volume of a movement that tracks no load. */
  totalReps: number;
}

/** A logged set: the weight as lifted (added weight on a bodyweight movement) and the reps. */
export interface LiftedSet {
  weight: Weight;
  reps: number;
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

/** A started workout: what Training counts per week and where Body reads the bodyweight from. */
export interface WorkoutPoint {
  workoutId: string;
  date: LocalDate;
  /** As entered with the workout. A new workout starts with the last one's, so a value often repeats. */
  bodyweight: Weight | undefined;
}

/**
 * Everything the Progress screens read about lifting, from one walk over the finished history. Only weighted
 * exercises with a logged set count; cardio and exercises left untouched are not here.
 */
export interface ProgressHistory {
  exercises: ReadonlyMap<MovementKey, ExerciseHistory>;
  /** Every record ever set, oldest first, and within a workout in exercise order. */
  records: readonly DatedRecord[];
  /** Every started workout, cardio-only ones included, oldest first. */
  workouts: readonly WorkoutPoint[];
  /**
   * The first started workout's date (the first of `workouts`): where the history begins for "since" lines
   * and for averages. A workout where nothing was logged doesn't start it.
   */
  firstDate: LocalDate | undefined;
}

/** Builds the history in one pass; `sessionsOldestFirst` must be in the order the workouts happened. */
export function buildProgressHistory(sessionsOldestFirst: readonly Session[]): ProgressHistory {
  const ledger = new RecordLedger();
  const exercises = new Map<MovementKey, ExerciseHistory>();
  const records: DatedRecord[] = [];
  const workouts: WorkoutPoint[] = [];

  for (const session of sessionsOldestFirst) {
    if (session.isStarted) {
      workouts.push({ workoutId: session.id, date: session.date, bodyweight: session.bodyweight });
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

  return { exercises, records, workouts, firstDate: workouts[0]?.date };
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
  const counted = exercise.setsCountingTowards('countsTowardsPrs');
  const volumeSets = exercise.setsCountingTowards('countsTowardsVolume').filter((x) => x.set);
  const best = bestOneRepMaxSet(exercise, session.bodyweight);
  return {
    workoutId: session.id,
    date: session.date,
    oneRepMax: best?.oneRepMax,
    oneRepMaxSet: best && { weight: best.weight, reps: best.reps },
    bestReps: Math.max(0, ...counted.map((potentialSet) => potentialSet.set?.repsCompleted ?? 0)),
    workingSets: volumeSets.length,
    sets: counted.flatMap((potentialSet) =>
      potentialSet.set?.repsCompleted ? [{ weight: potentialSet.weight, reps: potentialSet.set.repsCompleted }] : [],
    ),
    volume: exercise.tracksResistance ? exercise.totalWeightLiftedWith(session.bodyweight) : Weight.NIL,
    totalReps: volumeSets.reduce((total, potentialSet) => total + (potentialSet.set?.repsCompleted ?? 0), 0),
  };
}

function merged(a: ExercisePoint, b: ExercisePoint): ExercisePoint {
  const bFirst = !a.oneRepMax || (b.oneRepMax && b.oneRepMax.isGreaterThan(a.oneRepMax));
  return {
    ...a,
    oneRepMax: bFirst ? b.oneRepMax : a.oneRepMax,
    oneRepMaxSet: bFirst ? b.oneRepMaxSet : a.oneRepMaxSet,
    bestReps: Math.max(a.bestReps, b.bestReps),
    workingSets: a.workingSets + b.workingSets,
    sets: [...a.sets, ...b.sets],
    volume: a.volume.plus(b.volume),
    totalReps: a.totalReps + b.totalReps,
  };
}

/** First against last over a window, on the exercise's axis. `delta` is in `last`'s unit. */
export type ProgressChange = LoadChange | RepsChange;
type LoadChange = { axis: 'load'; first: Weight; last: Weight; delta: Weight };
type RepsChange = { axis: 'reps'; first: number; last: number; delta: number };

interface WindowOf<Axis extends StatAxis, Value, Change> {
  /** See {@link axisOf}. */
  axis: Axis;
  /** The points on or after the window's start, oldest first. */
  points: readonly ExercisePoint[];
  /** The points' values on the axis, oldest first, leaving out points with none. */
  values: readonly Value[];
  /** Undefined with fewer than two values. */
  change: Change | undefined;
}

export type ExerciseProgress = WindowOf<'load', Weight, LoadChange> | WindowOf<'reps', number, RepsChange>;

/**
 * The movement's axis: reps for one that tracks no load, and for a bodyweight movement that never had any load
 * to estimate from (no bodyweight logged and nothing added), which has no estimate to read. Else load.
 */
export function axisOf(history: ExerciseHistory): StatAxis {
  if (primaryAxisFor(history.blueprint) === 'reps') {
    return 'reps';
  }
  return history.blueprint.resistance === 'bodyweight' && !history.points.some(hasEffectiveLoad) ? 'reps' : 'load';
}

/** Whether a workout moved any load, bodyweight folded in. */
function hasEffectiveLoad(point: ExercisePoint): boolean {
  return point.oneRepMax !== undefined || !point.volume.value.isZero();
}

/**
 * An exercise's points since `since` (inclusive) and how far it moved over them: the first point's estimated
 * 1RM against the last's, or best reps on the reps axis (see {@link axisOf}).
 */
export function progressSince(history: ExerciseHistory, since: LocalDate): ExerciseProgress {
  const points = history.points.filter((point) => !point.date.isBefore(since));
  if (axisOf(history) === 'reps') {
    const values = points.flatMap((point) => (point.bestReps > 0 ? [point.bestReps] : []));
    const first = values[0];
    const last = values.at(-1);
    const change =
      values.length >= 2 && first !== undefined && last !== undefined
        ? { axis: 'reps' as const, first, last, delta: last - first }
        : undefined;
    return { axis: 'reps', points, values, change };
  }
  const values = points.flatMap((point) => (point.oneRepMax ? [point.oneRepMax] : []));
  const first = values[0];
  const last = values.at(-1);
  const change =
    values.length >= 2 && first && last ? { axis: 'load' as const, first, last, delta: last.minus(first) } : undefined;
  return { axis: 'load', points, values, change };
}

/**
 * The window's values as plain numbers, oldest first, for a sparkline: estimated 1RMs in `unit`, or best
 * reps.
 */
export function trendValues(progress: ExerciseProgress, unit: WeightUnit): number[] {
  return progress.axis === 'reps'
    ? [...progress.values]
    : progress.values.map((value) => value.convertTo(unit).value.toNumber());
}

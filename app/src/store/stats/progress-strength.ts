import { LocalDate } from '@js-joda/core';
import { ExerciseId, MovementKey } from '@/models/blueprint-models';
import { WeightUnit } from '@/models/weight';
import { ProgressHistory, progressSince, trendValues } from '@/store/stats/progress-history';
import { StatAxis } from '@/store/stats/quantity';

/** How many lifts and records Strength lists. */
export const LIFTS_SHOWN = 4;
export const RECORDS_SHOWN = 3;

/** One of the most-trained lifts in the range. */
export interface LiftRow {
  key: MovementKey;
  exerciseId: ExerciseId;
  name: string;
  /** `load` shows estimated 1RMs; `reps`, for a movement that tracks no load, the best reps. */
  axis: StatAxis;
  /** Workouts in the range that did it. */
  sessions: number;
  /** The latest value on the axis, in the user's unit for load. Undefined when none in the range has one. */
  latest: number | undefined;
  /** The first value in the range against the latest; undefined with fewer than two. */
  change: number | undefined;
  /** The range's values on the axis, oldest first, for the sparkline. */
  trend: number[];
}

/**
 * The lifts done in the most workouts since `since`, at most {@link LIFTS_SHOWN}. Ties go to the one done
 * most recently, then by name.
 */
export function mostTrainedLifts(history: ProgressHistory, since: LocalDate, unit: WeightUnit): LiftRow[] {
  const rows: (LiftRow & { lastDate: LocalDate })[] = [];
  for (const exercise of history.exercises.values()) {
    const progress = progressSince(exercise, since);
    const lastPoint = progress.points.at(-1);
    if (!lastPoint) {
      continue;
    }
    const trend = trendValues(progress, unit);
    const { change } = progress;
    rows.push({
      key: exercise.key,
      exerciseId: exercise.blueprint.exerciseId,
      name: exercise.name,
      axis: progress.axis,
      sessions: progress.points.length,
      latest: trend.at(-1),
      change: !change
        ? undefined
        : change.axis === 'reps'
          ? change.delta
          : change.delta.convertTo(unit).value.toNumber(),
      trend,
      lastDate: lastPoint.date,
    });
  }
  return rows
    .sort((a, b) => b.sessions - a.sessions || b.lastDate.compareTo(a.lastDate) || a.name.localeCompare(b.name))
    .slice(0, LIFTS_SHOWN)
    .map(({ lastDate: _, ...row }) => row);
}

/** A record and what it beat, in the user's unit. */
export interface RecentRecord {
  key: MovementKey;
  /** Undefined only if the movement has left the history. */
  exerciseId: ExerciseId | undefined;
  workoutId: string;
  date: LocalDate;
  /** The name the movement was last logged under, as the lifts show it. */
  name: string;
  kind: 'heaviestWeight' | 'estimatedOneRepMax';
  /** The heaviest weight, or the best estimated 1RM. */
  value: number;
  /** The set that set it, as lifted: the heaviest set, or the one the estimate comes from. */
  weight: number;
  reps: number;
  /** The best it beat. */
  previous: number;
  /** `value` less `previous`. */
  gain: number;
}

/** The latest {@link RECORDS_SHOWN} records ever set, latest first. */
export function recentRecords(history: ProgressHistory, unit: WeightUnit): RecentRecord[] {
  return history.records
    .slice(-RECORDS_SHOWN)
    .reverse()
    .map(({ record, workoutId, date }) => {
      const exercise = history.exercises.get(record.key);
      const value = (record.kind === 'heaviestWeight' ? record.weight : record.oneRepMax).convertTo(unit).value;
      const previous = record.previous.convertTo(unit).value;
      return {
        key: record.key,
        exerciseId: exercise?.blueprint.exerciseId,
        workoutId,
        date,
        name: exercise?.name ?? record.exerciseName,
        kind: record.kind,
        value: value.toNumber(),
        weight: record.weight.convertTo(unit).value.toNumber(),
        reps: record.reps,
        previous: previous.toNumber(),
        gain: value.minus(previous).toNumber(),
      };
    });
}

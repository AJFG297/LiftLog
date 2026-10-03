import { LocalDate } from '@js-joda/core';
import { ExerciseId, MovementKey } from '@/models/blueprint-models';
import { WeightUnit } from '@/models/weight';
import { shownChange, shownWeight } from '@/store/stats/progress-amounts';
import { ExerciseProgress, ProgressHistory, progressSince, trendValues } from '@/store/stats/progress-history';
import { StatAxis } from '@/store/stats/quantity';
import { newestWorkoutFirst, recordListRowOf, RecordListRow } from '@/store/stats/records-list';

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
  /**
   * The latest value on the axis, as shown: an estimate in the user's unit, to the nearest half. Undefined when
   * none in the range has one.
   */
  latest: number | undefined;
  /** The latest value less the range's first, as shown; undefined with fewer than two. */
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
    rows.push({
      key: exercise.key,
      exerciseId: exercise.blueprint.exerciseId,
      name: exercise.name,
      axis: progress.axis,
      sessions: progress.points.length,
      ...latestAndChange(progress, unit),
      trend: trendValues(progress, unit),
      lastDate: lastPoint.date,
    });
  }
  return rows
    .sort((a, b) => b.sessions - a.sessions || b.lastDate.compareTo(a.lastDate) || a.name.localeCompare(b.name))
    .slice(0, LIFTS_SHOWN)
    .map(({ lastDate: _, ...row }) => row);
}

function latestAndChange(progress: ExerciseProgress, unit: WeightUnit): Pick<LiftRow, 'latest' | 'change'> {
  if (progress.axis === 'reps') {
    return { latest: progress.values.at(-1), change: progress.change?.delta };
  }
  if (progress.change) {
    const shown = shownChange(progress.change.last, progress.change.first, 'estimate', unit);
    return { latest: shown.value.value.toNumber(), change: shown.change.value.toNumber() };
  }
  const latest = progress.values.at(-1);
  return { latest: latest && shownWeight(latest, 'estimate', unit).value.toNumber(), change: undefined };
}

/**
 * The latest {@link RECORDS_SHOWN} records ever set, as the Records list starts: the newest workout first, and
 * a workout's records in exercise order.
 */
export function recentRecords(history: ProgressHistory, unit: WeightUnit): RecordListRow[] {
  return newestWorkoutFirst(history.records)
    .slice(0, RECORDS_SHOWN)
    .map((dated) => recordListRowOf(history, dated, unit));
}

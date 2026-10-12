import { LocalDate } from '@js-joda/core';
import { ExerciseId, MovementKey, movementKeyFor } from '@/models/blueprint-models';
import { WeightUnit } from '@/models/weight';
import { shownChange, shownWeight } from '@/store/stats/progress-amounts';
import {
  ExerciseHistory,
  ExerciseProgress,
  ProgressHistory,
  progressSince,
  trendValues,
} from '@/store/stats/progress-history';
import { StatAxis } from '@/store/stats/quantity';
import { newestWorkoutFirst, recordListRowOf, RecordListRow } from '@/store/stats/records-list';

/** How many lifts and records Strength lists. */
export const LIFTS_SHOWN = 4;
export const RECORDS_SHOWN = 3;

/** A lift on Strength: pinned, or one of the most trained in the range. */
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
  /** Pinned to the list from the exercise page, so it shows whatever the range. */
  pinned: boolean;
}

/**
 * Strength's lifts: the `pinned` ones first, in the order they were pinned, then the ones done in the most
 * workouts since `since` until there are {@link LIFTS_SHOWN}. Ties go to the one done most recently, then by
 * name. A pinned lift always shows, even with nothing in the range and even past {@link LIFTS_SHOWN}, so
 * pinning never drops a lift the user asked for; it is the most-trained ones that make room. An id with no
 * history (never logged, or merged into another exercise) is skipped.
 */
export function strengthLifts(
  history: ProgressHistory,
  since: LocalDate,
  unit: WeightUnit,
  pinned: readonly ExerciseId[] = [],
): LiftRow[] {
  const pinnedKeys = new Set<MovementKey>();
  const pinnedRows: LiftRow[] = [];
  for (const id of pinned) {
    const key = movementKeyFor(id, 'WeightedExerciseBlueprint');
    const exercise = history.exercises.get(key);
    if (exercise && !pinnedKeys.has(key)) {
      pinnedKeys.add(key);
      pinnedRows.push(liftRowOf(exercise, since, unit, true).row);
    }
  }

  const rows: { row: LiftRow; lastDate: LocalDate }[] = [];
  for (const exercise of history.exercises.values()) {
    if (pinnedKeys.has(exercise.key)) {
      continue;
    }
    const lifted = liftRowOf(exercise, since, unit, false);
    if (lifted.lastDate) {
      rows.push({ row: lifted.row, lastDate: lifted.lastDate });
    }
  }
  const mostTrained = rows
    .sort(
      (a, b) =>
        b.row.sessions - a.row.sessions || b.lastDate.compareTo(a.lastDate) || a.row.name.localeCompare(b.row.name),
    )
    .slice(0, Math.max(0, LIFTS_SHOWN - pinnedRows.length))
    .map(({ row }) => row);
  return [...pinnedRows, ...mostTrained];
}

function liftRowOf(
  exercise: ExerciseHistory,
  since: LocalDate,
  unit: WeightUnit,
  pinned: boolean,
): { row: LiftRow; lastDate: LocalDate | undefined } {
  const progress = progressSince(exercise, since);
  return {
    row: {
      key: exercise.key,
      exerciseId: exercise.blueprint.exerciseId,
      name: exercise.name,
      axis: progress.axis,
      sessions: progress.points.length,
      ...latestAndChange(progress, unit),
      trend: trendValues(progress, unit),
      pinned,
    },
    lastDate: progress.points.at(-1)?.date,
  };
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

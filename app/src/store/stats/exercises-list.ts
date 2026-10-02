import { LocalDate } from '@js-joda/core';
import { fuzzyMatchScore } from '@/models/exercise-fuzzy-match';
import { ExerciseId, MovementKey } from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { MuscleGroup, muscleGroupOf } from '@/models/muscle-groups';
import { LastDoneLabel, lastDoneLabelOf } from '@/models/home/up-next';
import { Weight, WeightUnit } from '@/models/weight';
import { ChangeTone, shownChange, shownWeight, toneOf } from '@/store/stats/progress-amounts';
import {
  ExerciseHistory,
  ExerciseProgress,
  ProgressHistory,
  progressSince,
  trendValues,
} from '@/store/stats/progress-history';
import { StatAxis } from '@/store/stats/quantity';

/** How far back the trend line and the change reach. */
export const TREND_WEEKS = 12;

/**
 * The muscle chips after All. Core is left out unless something logged files under it, so the row stays
 * the five most people train.
 */
const MAIN_MUSCLE_CHIPS = ['chest', 'back', 'legs', 'shoulders', 'arms'] as const satisfies readonly MuscleGroup[];

export interface ExerciseFilters {
  query: string;
  /** Undefined is All. */
  muscle: MuscleGroup | undefined;
}

/** An amount on the exercise's axis: an estimated 1RM, or reps for a movement that tracks no load. */
export type AxisAmount = { axis: 'load'; value: Weight } | { axis: 'reps'; value: number };

export interface ExerciseListRow {
  key: MovementKey;
  exerciseId: ExerciseId;
  name: string;
  lastDone: LastDoneLabel;
  /** Workouts that started it, over the whole history. */
  sessions: number;
  /** The window's values, oldest first, for the sparkline. */
  trend: number[];
  /** The latest estimated 1RM, as shown (in the user's unit, to the nearest half), or best reps. */
  current: AxisAmount | undefined;
  /** The window's last value less its first, as shown. Undefined with fewer than two values. */
  change: AxisAmount | undefined;
  /** Which way the change went, as shown: what colours the line and the change. */
  tone: ChangeTone | undefined;
}

export interface ExercisesList {
  /** Most recently done first. */
  rows: ExerciseListRow[];
  /** The chips to offer after All. */
  muscles: MuscleGroup[];
}

/**
 * Every logged exercise the filters let through. With no search, most recently done first; those last done on
 * the same day keep the order they were first done in, which mostly follows the routine. A search ranks the
 * best match first, as the picker does, then the most recently done.
 */
export function exercisesListOf(
  history: ProgressHistory,
  catalog: Record<ExerciseId, ExerciseDescriptor>,
  today: LocalDate,
  filters: ExerciseFilters,
  unit: WeightUnit,
): ExercisesList {
  const groupOf = (exercise: ExerciseHistory) => {
    const descriptor = catalog[exercise.blueprint.exerciseId];
    return descriptor ? muscleGroupOf(descriptor) : undefined;
  };
  const query = filters.query.trim();
  const all = [...history.exercises.values()].filter((exercise) => exercise.points.length > 0);

  const rows = all
    .flatMap((exercise, firstDone) => {
      const score = query ? fuzzyMatchScore(query, exercise.name) : 0;
      const shown = score !== null && (!filters.muscle || groupOf(exercise) === filters.muscle);
      return shown ? [{ exercise, firstDone, score }] : [];
    })
    .sort(
      (a, b) => b.score - a.score || lastDate(b.exercise).compareTo(lastDate(a.exercise)) || a.firstDone - b.firstDone,
    )
    .map(({ exercise }) => rowOf(exercise, today, unit));

  const hasCore = all.some((exercise) => groupOf(exercise) === 'core');
  return { rows, muscles: hasCore ? [...MAIN_MUSCLE_CHIPS, 'core'] : [...MAIN_MUSCLE_CHIPS] };
}

function lastDate(exercise: ExerciseHistory): LocalDate {
  return exercise.points.at(-1)!.date;
}

function rowOf(exercise: ExerciseHistory, today: LocalDate, unit: WeightUnit): ExerciseListRow {
  const progress = progressSince(exercise, today.minusWeeks(TREND_WEEKS));
  const { current, change } = currentAndChange(exercise, progress, unit);
  return {
    key: exercise.key,
    exerciseId: exercise.blueprint.exerciseId,
    name: exercise.name,
    lastDone: lastDoneLabelOf(lastDate(exercise), today),
    sessions: exercise.points.length,
    trend: trendValues(progress, unit),
    current,
    change,
    tone: change && toneOf(change.axis === 'reps' ? change.value : change.value.value),
  };
}

/**
 * The latest value and the change over the window, as shown. With a change, the latest value is the window's
 * last, shown as the change shows it.
 */
function currentAndChange(
  exercise: ExerciseHistory,
  progress: ExerciseProgress,
  unit: WeightUnit,
): Pick<ExerciseListRow, 'current' | 'change'> {
  if (progress.change?.axis === 'reps') {
    return {
      current: { axis: 'reps', value: progress.change.last },
      change: { axis: 'reps', value: progress.change.delta },
    };
  }
  if (progress.change?.axis === 'load') {
    const shown = shownChange(progress.change.last, progress.change.first, 'estimate', unit);
    return { current: { axis: 'load', value: shown.value }, change: { axis: 'load', value: shown.change } };
  }
  return { current: latestOf(exercise, progress.axis, unit), change: undefined };
}

function latestOf(exercise: ExerciseHistory, axis: StatAxis, unit: WeightUnit): AxisAmount | undefined {
  for (let i = exercise.points.length - 1; i >= 0; i--) {
    const point = exercise.points[i]!;
    if (axis === 'reps' && point.bestReps > 0) {
      return { axis, value: point.bestReps };
    }
    if (axis === 'load' && point.oneRepMax) {
      return { axis, value: shownWeight(point.oneRepMax, 'estimate', unit) };
    }
  }
  return undefined;
}

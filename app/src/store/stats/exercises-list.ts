import { LocalDate } from '@js-joda/core';
import { fuzzyMatchScore } from '@/models/exercise-fuzzy-match';
import { ExerciseId, MovementKey } from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { MuscleGroup, muscleGroupOf } from '@/models/muscle-groups';
import { LastDoneLabel, lastDoneLabelOf } from '@/models/home/up-next';
import { Weight, WeightUnit } from '@/models/weight';
import { ExerciseHistory, ProgressHistory, progressSince, trendValues } from '@/store/stats/progress-history';

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

/** Up, down or flat over the window, as shown (rounded): what colours the line and the change. */
export type TrendDirection = 'up' | 'down' | 'same';

export interface ExerciseRow {
  key: MovementKey;
  exerciseId: ExerciseId;
  name: string;
  lastDone: LastDoneLabel;
  /** Workouts that started it, over the whole history. */
  sessions: number;
  /** The window's values, oldest first, for the sparkline. */
  trend: number[];
  /** The latest estimated 1RM (in the user's unit, to a tenth), or best reps. */
  current: AxisAmount | undefined;
  /** First against last over the window, rounded as `current` is. Undefined with fewer than two values. */
  change: AxisAmount | undefined;
  direction: TrendDirection | undefined;
}

export interface ExercisesList {
  /** Most recently done first. */
  rows: ExerciseRow[];
  /** The chips to offer after All. */
  muscles: MuscleGroup[];
}

const LOAD_DECIMALS = 1;

/**
 * Every logged exercise the filters let through, most recently done first. Those last done on the same day
 * keep the order they were first done in, which mostly follows the routine.
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
    .map((exercise, firstDone) => ({ exercise, firstDone }))
    .filter(
      ({ exercise }) =>
        (!filters.muscle || groupOf(exercise) === filters.muscle) &&
        (!query || fuzzyMatchScore(query, exercise.name) !== null),
    )
    .sort((a, b) => lastDate(b.exercise).compareTo(lastDate(a.exercise)) || a.firstDone - b.firstDone)
    .map(({ exercise }) => rowOf(exercise, today, unit));

  const hasCore = all.some((exercise) => groupOf(exercise) === 'core');
  return { rows, muscles: hasCore ? [...MAIN_MUSCLE_CHIPS, 'core'] : [...MAIN_MUSCLE_CHIPS] };
}

function lastDate(exercise: ExerciseHistory): LocalDate {
  return exercise.points.at(-1)!.date;
}

function rowOf(exercise: ExerciseHistory, today: LocalDate, unit: WeightUnit): ExerciseRow {
  const progress = progressSince(exercise, today.minusWeeks(TREND_WEEKS));
  const change = changeOf(progress.change, unit);
  return {
    key: exercise.key,
    exerciseId: exercise.blueprint.exerciseId,
    name: exercise.name,
    lastDone: lastDoneLabelOf(lastDate(exercise), today),
    sessions: exercise.points.length,
    trend: trendValues(progress, unit),
    current: currentOf(exercise, progress.axis, unit),
    change,
    direction: change && directionOf(change),
  };
}

function currentOf(exercise: ExerciseHistory, axis: 'load' | 'reps', unit: WeightUnit): AxisAmount | undefined {
  for (let i = exercise.points.length - 1; i >= 0; i--) {
    const point = exercise.points[i]!;
    if (axis === 'reps' && point.bestReps > 0) {
      return { axis, value: point.bestReps };
    }
    if (axis === 'load' && point.oneRepMax) {
      return { axis, value: rounded(point.oneRepMax, unit) };
    }
  }
  return undefined;
}

function changeOf(change: ReturnType<typeof progressSince>['change'], unit: WeightUnit): AxisAmount | undefined {
  if (!change) {
    return undefined;
  }
  if (change.axis === 'reps') {
    return { axis: 'reps', value: change.delta };
  }
  // Rounded on each end, so the change agrees with the current value beside it.
  return { axis: 'load', value: rounded(change.last, unit).minus(rounded(change.first, unit)) };
}

function directionOf(change: AxisAmount): TrendDirection {
  const sign = change.axis === 'reps' ? Math.sign(change.value) : change.value.value.toNumber();
  return sign > 0 ? 'up' : sign < 0 ? 'down' : 'same';
}

function rounded(weight: Weight, unit: WeightUnit): Weight {
  const converted = weight.convertTo(unit);
  return converted.with({ value: converted.value.decimalPlaces(LOAD_DECIMALS) });
}

import { DayOfWeek, LocalDate } from '@js-joda/core';
import { movementKeyFor, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';
import { ExerciseHistory, ExercisePoint, ProgressHistory, WorkoutPoint } from '@/store/stats/progress-history';
import { progressPeriod, progressRange, ProgressRangeId } from '@/store/stats/progress-tab';

export const kg = (n: number) => new Weight(n, 'kilograms');
/** A day in 2026. */
export const day = (month: number, n: number) => LocalDate.of(2026, month, n);
/** Thursday, Oct 1 2026: this week starts on Monday, Sep 28. */
export const today = day(10, 1);

export function periodFor(range: ProgressRangeId, firstDayOfWeek = DayOfWeek.MONDAY) {
  return progressPeriod(today, progressRange(range), firstDayOfWeek);
}

export function point(date: LocalDate, workingSets: number, oneRepMax?: Weight, bestReps = 5): ExercisePoint {
  return {
    workoutId: `w-${date.toString()}`,
    date,
    oneRepMax,
    oneRepMaxSet: undefined,
    bestReps,
    workingSets,
    sets: [],
    volume: Weight.NIL,
    totalReps: 0,
  };
}

export function exerciseHistory(
  blueprint: WeightedExerciseBlueprint | string,
  points: ExercisePoint[],
): ExerciseHistory {
  const bp = typeof blueprint === 'string' ? makeWeightedBlueprint({ name: blueprint }) : blueprint;
  const key = movementKeyFor(bp.exerciseId, 'WeightedExerciseBlueprint');
  return { key, name: bp.name, blueprint: bp, points };
}

export function workout(date: LocalDate, bodyweight?: number): WorkoutPoint {
  return { workoutId: `w-${date.toString()}`, date, bodyweight: bodyweight === undefined ? undefined : kg(bodyweight) };
}

export function historyOf(
  init: Omit<Partial<ProgressHistory>, 'exercises'> & { exercises?: ExerciseHistory[] },
): ProgressHistory {
  const workouts = init.workouts ?? [];
  return {
    exercises: new Map((init.exercises ?? []).map((x) => [x.key, x])),
    records: init.records ?? [],
    workouts,
    firstDate: init.firstDate ?? workouts[0]?.date,
  };
}

export function descriptor(
  name: string,
  primaryMuscles: string[],
  secondaryMuscles: string[] = [],
): ExerciseDescriptor {
  return {
    name,
    force: null,
    level: '',
    mechanic: null,
    equipment: null,
    primaryMuscles,
    secondaryMuscles,
    instructions: '',
    category: '',
  };
}

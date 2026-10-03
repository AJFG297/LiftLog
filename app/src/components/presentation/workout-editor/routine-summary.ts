import {
  CardioExerciseBlueprint,
  ExerciseBlueprint,
  SessionBlueprint,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { ChronoUnit, LocalDate } from '@js-joda/core';

/** A rough time for one set, rest aside, in seconds. */
const SECONDS_PER_SET = 45;
/** What a distance-based cardio set is guessed to take, with nothing to go on. */
const DISTANCE_SET_SECONDS = 10 * 60;

/** Every set the routine plans, warm-ups included. */
export function totalSetsOf(routine: SessionBlueprint): number {
  return routine.exercises.reduce((total, exercise) => total + setCountOf(exercise), 0);
}

function setCountOf(exercise: ExerciseBlueprint): number {
  return exercise instanceof WeightedExerciseBlueprint
    ? exercise.warmupSets.length + exercise.plannedSets.length
    : exercise.sets.length;
}

/**
 * About how long the routine takes, to the nearest 5 minutes and never under 5 for a routine with
 * anything in it: each weighted set and its rest, and each cardio set's time.
 */
export function estimatedMinutesOf(routine: SessionBlueprint): number {
  if (!routine.exercises.length) {
    return 0;
  }
  const seconds = routine.exercises.reduce((total, exercise) => total + secondsOf(exercise), 0);
  return Math.max(5, Math.round(seconds / 60 / 5) * 5);
}

function secondsOf(exercise: ExerciseBlueprint): number {
  if (exercise instanceof CardioExerciseBlueprint) {
    return exercise.sets.reduce(
      (total, set) =>
        total +
        (set.target.type === 'time' ? set.target.value.seconds() : DISTANCE_SET_SECONDS) +
        (set.restBetweenSets?.minRest.seconds() ?? 0),
      0,
    );
  }
  return setCountOf(exercise) * (SECONDS_PER_SET + exercise.restBetweenSets.minRest.seconds());
}

/** How long ago `date` was, in the unit a person would say it in. */
export type DaysAgo =
  | { unit: 'today' }
  | { unit: 'yesterday' }
  | { unit: 'days'; count: number }
  | { unit: 'weeks'; count: number }
  | { unit: 'date' };

export function daysAgoOf(date: LocalDate, today: LocalDate): DaysAgo {
  const days = ChronoUnit.DAYS.between(date, today);
  if (days <= 0) {
    return { unit: 'today' };
  }
  if (days === 1) {
    return { unit: 'yesterday' };
  }
  if (days < 14) {
    return { unit: 'days', count: days };
  }
  if (days < 9 * 7) {
    return { unit: 'weeks', count: Math.floor(days / 7) };
  }
  return { unit: 'date' };
}

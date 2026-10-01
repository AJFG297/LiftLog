import { CardioExerciseBlueprint, SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { Session } from '@/models/session-models';
import { LocalDate } from '@js-joda/core';

/** How many past runs of a workout its time estimate is the median of. */
const ESTIMATE_SAMPLE = 5;

/** For a workout never done before: a set takes about this long, before its rest. */
const SECONDS_PER_SET = 40;
/** A cardio set with a distance target, which says nothing about how long it takes. */
const SECONDS_PER_DISTANCE_CARDIO_SET = 10 * 60;

/** Estimates are rounded to this, since "~50 min" is all the card needs to say. */
const ESTIMATE_STEP_MINUTES = 5;

/** A few names from a list and how many more there are: "Bench Press, Overhead Press +3". */
export interface NamePreview {
  names: string[];
  more: number;
}

export function namePreviewOf(names: readonly string[], shown: number): NamePreview {
  return { names: names.slice(0, shown), more: Math.max(0, names.length - shown) };
}

/**
 * About how long a workout takes, in minutes. It's the median of the last few times it was done, which
 * already includes how this person rests and chats. A workout never done before is estimated from its
 * plan: each set plus its rest. `undefined` when there's nothing to go on.
 */
export function estimatedMinutesOf(blueprint: SessionBlueprint, sessions: readonly Session[]): number | undefined {
  const past = sessions
    .filter((session) => session.blueprint.name === blueprint.name && session.duration !== undefined)
    .sort((a, b) => b.date.compareTo(a.date))
    .slice(0, ESTIMATE_SAMPLE)
    .map((session) => session.duration!.seconds() / 60)
    .sort((a, b) => a - b);
  if (past.length) {
    return roundToStep(median(past));
  }
  const planned = plannedSecondsOf(blueprint);
  return planned > 0 ? roundToStep(planned / 60) : undefined;
}

/** The last day a workout of this name was done, or `undefined` if it never was. */
export function lastDoneOf(workoutName: string, sessions: readonly Session[]): LocalDate | undefined {
  return sessions
    .filter((session) => session.isStarted && session.blueprint.name === workoutName)
    .reduce<LocalDate | undefined>(
      (latest, session) => (!latest || session.date.isAfter(latest) ? session.date : latest),
      undefined,
    );
}

/** How "last done" reads: today, yesterday, a weekday within the last week, or a date. */
export type LastDoneLabel =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'weekday'; date: LocalDate }
  | { kind: 'date'; date: LocalDate };

export function lastDoneLabelOf(date: LocalDate, today: LocalDate): LastDoneLabel {
  const daysAgo = today.toEpochDay() - date.toEpochDay();
  if (daysAgo <= 0) {
    return { kind: 'today' };
  }
  if (daysAgo === 1) {
    return { kind: 'yesterday' };
  }
  return daysAgo < 7 ? { kind: 'weekday', date } : { kind: 'date', date };
}

function plannedSecondsOf(blueprint: SessionBlueprint): number {
  let seconds = 0;
  for (const exercise of blueprint.exercises) {
    if (exercise instanceof WeightedExerciseBlueprint) {
      const rest = exercise.restBetweenSets.minRest.seconds();
      seconds += exercise.plannedSets.length * (SECONDS_PER_SET + rest);
      seconds += exercise.warmupSets.length * SECONDS_PER_SET * 2;
    } else if (exercise instanceof CardioExerciseBlueprint) {
      for (const set of exercise.sets) {
        seconds += set.target.type === 'time' ? set.target.value.seconds() : SECONDS_PER_DISTANCE_CARDIO_SET;
        seconds += set.restBetweenSets?.minRest.seconds() ?? 0;
      }
    }
  }
  return seconds;
}

function median(ascending: readonly number[]): number {
  const middle = Math.floor(ascending.length / 2);
  return ascending.length % 2 ? ascending[middle]! : (ascending[middle - 1]! + ascending[middle]!) / 2;
}

function roundToStep(minutes: number): number {
  return Math.max(ESTIMATE_STEP_MINUTES, Math.round(minutes / ESTIMATE_STEP_MINUTES) * ESTIMATE_STEP_MINUTES);
}

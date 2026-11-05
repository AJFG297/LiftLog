import { LocalDate } from '@js-joda/core';
import { routinesDoneThisRoundOf } from '@/models/routine-rounds';

/** A routine as history knows it. `id` is absent until the routine has been saved with one. */
export interface RoutineRef {
  id?: string;
  name: string;
}

/** One finished workout, as far as routine history needs to see it. */
export interface DoneWorkoutRef {
  routineId: string | null;
  name: string;
  date: LocalDate;
}

export function routineKey(routine: RoutineRef): string {
  return routine.id ?? routine.name;
}

/**
 * Whether a logged workout is this routine.
 *
 * The id wins. A workout with no id, or an id that belongs to no routine anymore, still matches
 * the name: that is history from before routines had ids, or from a routine that was deleted.
 * A workout stamped to a routine that still exists does not follow a different routine that reuses the name.
 */
export function workoutBelongsTo(
  workout: { routineId: string | null; name: string },
  routine: RoutineRef,
  liveRoutineIds?: ReadonlySet<string>,
): boolean {
  if (routine.id && workout.routineId === routine.id) {
    return true;
  }
  if (workout.name !== routine.name) {
    return false;
  }
  if (!workout.routineId) {
    return true;
  }
  return liveRoutineIds !== undefined && !liveRoutineIds.has(workout.routineId);
}

/** In-memory check for a workout already narrowed to a few candidates. Same id, or the same name. */
export function sameRoutine(routine: RoutineRef, workout: RoutineRef): boolean {
  if (routine.id && workout.id === routine.id) {
    return true;
  }
  return routine.name === workout.name;
}

/** The routine a workout was started from: its id, then the first routine of its name. */
export function findRoutineIndex(routines: readonly RoutineRef[], workout: RoutineRef): number {
  if (workout.id) {
    const byId = routines.findIndex((routine) => routine.id === workout.id);
    if (byId >= 0) {
      return byId;
    }
  }
  return routines.findIndex((routine) => routine.name === workout.name);
}

export interface RoutineHistoryResult {
  /** Keyed by {@link routineKey}. */
  lastDone: Map<string, LocalDate>;
  workoutsDone: number;
  routinesDoneThisRound: number;
}

/**
 * Last day, workout count and round position for `routines`, from finished workouts oldest first.
 * A workout counts once. The round sees each matched routine's current name, so a rename does not
 * open a new round.
 */
export function routineHistoryOf(
  doneOldestFirst: readonly DoneWorkoutRef[],
  routines: readonly RoutineRef[],
  liveRoutineIds?: ReadonlySet<string>,
): RoutineHistoryResult {
  const lastDone = new Map<string, LocalDate>();
  const namesOldestFirst: string[] = [];
  let workoutsDone = 0;
  for (const workout of doneOldestFirst) {
    const matched = routines.filter((routine) => workoutBelongsTo(workout, routine, liveRoutineIds));
    if (!matched.length) {
      continue;
    }
    workoutsDone += 1;
    for (const routine of matched) {
      const key = routineKey(routine);
      const previous = lastDone.get(key);
      if (!previous || workout.date.isAfter(previous)) {
        lastDone.set(key, workout.date);
      }
    }
    // One name per workout, the routine the id picked, else the stored name. Two routines that still
    // share a name keep counting as one step of the round, as they did when history was the name.
    namesOldestFirst.push(matched[0]!.name);
  }
  return {
    lastDone,
    workoutsDone,
    routinesDoneThisRound: routinesDoneThisRoundOf(
      namesOldestFirst,
      routines.map((routine) => routine.name),
    ),
  };
}

export function liveRoutineIdsOf(programs: readonly { sessions: readonly RoutineRef[] }[]): string[] {
  return programs.flatMap((program) => program.sessions.flatMap((routine) => (routine.id ? [routine.id] : [])));
}

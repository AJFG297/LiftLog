import { RecordedExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import { carriedFrom, plannedExerciseFor, TodaysTarget, todaysTarget } from '@/models/session-models/todays-target';
import { useAppSelector, useAppSelectorWithArg } from '@/store';
import { selectActiveProgram } from '@/store/program';
import { selectRecentlyCompletedExercises } from '@/store/stored-sessions';

/**
 * The performance an exercise of `session` carries on from (see {@link carriedFrom}), and every recent
 * performance of the same movement, newest first.
 */
export function usePreviousPerformance(session: Session) {
  const recentlyCompletedExercises = useAppSelectorWithArg(selectRecentlyCompletedExercises, session.id);
  const program = useAppSelector(selectActiveProgram);
  const routine = program.sessions.find((planned) => planned.name === session.blueprint.name);
  return (exercise: RecordedWeightedExercise) => {
    const candidates = recentlyCompletedExercises(exercise.movementKey()) as RecordedWeightedExercise[];
    const planned = plannedExerciseFor(exercise, session.recordedExercises, routine?.exercises ?? []);
    return { previous: carriedFrom(exercise, candidates, planned), candidates };
  };
}

/** Today's target for an exercise of `session`, measured against its last performance. Cardio has none. */
export function useTodaysTarget(session: Session): (exercise: RecordedExercise) => TodaysTarget | undefined {
  const previousPerformance = usePreviousPerformance(session);
  return (exercise) => {
    if (!(exercise instanceof RecordedWeightedExercise)) {
      return undefined;
    }
    const { previous, candidates } = previousPerformance(exercise);
    return todaysTarget(exercise, previous, candidates.length > 0);
  };
}

export function usesBodyweight(exercise: RecordedExercise): boolean {
  return exercise instanceof RecordedWeightedExercise && exercise.blueprint.resistance === 'bodyweight';
}

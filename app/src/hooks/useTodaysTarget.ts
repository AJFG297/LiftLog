import { RecordedExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import { TodaysTarget, todaysTarget } from '@/models/session-models/todays-target';
import { useAppSelectorWithArg } from '@/store';
import { selectRecentlyCompletedExercises } from '@/store/stored-sessions';

/** Today's target for an exercise of `session`, measured against its last performance. Cardio has none. */
export function useTodaysTarget(session: Session): (exercise: RecordedExercise) => TodaysTarget | undefined {
  const recentlyCompletedExercises = useAppSelectorWithArg(selectRecentlyCompletedExercises, session.id);
  return (exercise) => {
    if (!(exercise instanceof RecordedWeightedExercise)) {
      return undefined;
    }
    const previous = exercise.previousPerformanceIn(
      recentlyCompletedExercises(exercise.movementKey()) as RecordedWeightedExercise[],
    );
    return todaysTarget(exercise, previous);
  };
}

export function usesBodyweight(exercise: RecordedExercise): boolean {
  return exercise instanceof RecordedWeightedExercise && exercise.blueprint.resistance === 'bodyweight';
}

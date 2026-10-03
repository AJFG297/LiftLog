import { usePreviousPerformances } from '@/components/smart/previous-performances';
import { RecordedExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import { carriedFrom, plannedLineageFor, TodaysTarget, todaysTarget } from '@/models/session-models/todays-target';
import { useAppSelector } from '@/store';
import { selectActiveProgram } from '@/store/program';

export interface PreviousPerformance {
  /** The performance an exercise of the session carries on from (see {@link carriedFrom}). */
  previous: RecordedWeightedExercise | undefined;
  /** Every recent performance of the same movement, newest first. */
  candidates: RecordedWeightedExercise[];
}

/**
 * The previous performance of each weighted exercise of `session`, from the nearest
 * `PreviousPerformancesProvider`. Undefined until that has loaded, so a screen shows nothing rather than
 * "first time" for a moment.
 */
export function usePreviousPerformance(
  session: Session,
): ((exercise: RecordedWeightedExercise) => PreviousPerformance) | undefined {
  const { ofMovement, byLineage, loaded } = usePreviousPerformances();
  const program = useAppSelector(selectActiveProgram);
  const routine = program.sessions.find((planned) => planned.name === session.blueprint.name);
  if (!loaded) {
    return undefined;
  }
  return (exercise: RecordedWeightedExercise) => {
    const candidates = ofMovement(exercise.movementKey()) as RecordedWeightedExercise[];
    const planned = plannedLineageFor(exercise, session.recordedExercises, routine?.exercises ?? []);
    return { previous: carriedFrom(exercise, planned, byLineage), candidates };
  };
}

/**
 * Today's target for an exercise of `session`, measured against its last performance. Cardio has none,
 * and nothing has one until the previous performances have loaded.
 */
export function useTodaysTarget(session: Session): (exercise: RecordedExercise) => TodaysTarget | undefined {
  const previousPerformance = usePreviousPerformance(session);
  return (exercise) => {
    if (!previousPerformance || !(exercise instanceof RecordedWeightedExercise)) {
      return undefined;
    }
    const { previous, candidates } = previousPerformance(exercise);
    return todaysTarget(exercise, previous, candidates.length > 0);
  };
}

export function usesBodyweight(exercise: RecordedExercise): boolean {
  return exercise instanceof RecordedWeightedExercise && exercise.blueprint.resistance === 'bodyweight';
}

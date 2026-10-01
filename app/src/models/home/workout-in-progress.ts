import { ExerciseGroup, nextExerciseInGroup } from '@/models/session-models/exercise-groups';
import { RecordedCardioExercise } from '@/models/session-models/recorded-cardio-exercise';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import { NextSetLabel, restUpNextOf } from '@/models/session-models/rest-up-next';
import type { Session } from '@/models/session-models/session';

/**
 * What the workout-in-progress bar says is next: "Bench Press · set 3 of 5 next". It reads the page the
 * workout screen shows (`app.liveWorkoutFocus`), the same way the rest pill does, so resuming lands on
 * the set the bar named.
 */
export type WorkoutInProgressNext =
  /** `workingSets` is how many working sets the exercise has, for "of 5"; other kinds aren't counted. */
  | { kind: 'set'; exerciseName: string; set: NextSetLabel; workingSets: number }
  | { kind: 'page'; exerciseNames: string[] }
  | { kind: 'finish' };

export function workoutInProgressNextOf(
  session: Session,
  groups: readonly ExerciseGroup[],
  focusedGroupIndex: number | undefined,
): WorkoutInProgressNext {
  const upNext = restUpNextOf(session, groups, focusedGroupIndex);
  if (upNext.kind !== 'set') {
    return upNext;
  }
  const group = focusedGroupIndex === undefined ? undefined : groups[focusedGroupIndex];
  const index = group ? nextExerciseInGroup(session, group) : undefined;
  const exercise = index === undefined ? undefined : session.recordedExercises[index];
  return { ...upNext, workingSets: exercise ? workingSetsOf(exercise) : 0 };
}

function workingSetsOf(exercise: Session['recordedExercises'][number]): number {
  if (exercise instanceof RecordedWeightedExercise) {
    return exercise.potentialSets.filter((slot) => slot.kind === 'working').length;
  }
  return exercise instanceof RecordedCardioExercise ? exercise.sets.length : 0;
}

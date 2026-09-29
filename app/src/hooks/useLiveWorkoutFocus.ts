import { Session } from '@/models/session-models';
import { exerciseGroupsOf, focusedGroupIndexOf } from '@/models/session-models/exercise-groups';
import { useAppSelector } from '@/store';
import { setLiveWorkoutFocus } from '@/store/app';
import { useDispatch } from 'react-redux';

/**
 * The live workout's pages and which one is on screen, shared by the workout screen and its "All
 * exercises" sheet. `focusedExerciseIndex` is the exercise the user picked, or the first of the page
 * the workout would open on.
 */
export function useLiveWorkoutFocus(session: Session) {
  const stored = useAppSelector((x) => x.app.liveWorkoutFocus);
  const dispatch = useDispatch();
  const groups = exerciseGroupsOf(session.recordedExercises);
  const storedIndex =
    stored?.sessionId === session.id && stored.exerciseIndex < session.recordedExercises.length
      ? stored.exerciseIndex
      : undefined;
  const focusedGroupIndex = focusedGroupIndexOf(session, groups, storedIndex);
  const focusedGroup = focusedGroupIndex === undefined ? undefined : groups[focusedGroupIndex];

  return {
    groups,
    focusedGroupIndex,
    focusedGroup,
    focusedExerciseIndex: storedIndex ?? focusedGroup?.indices[0],
    /** Whether the page on screen was picked, rather than inferred from where the workout is up to. */
    isPinned: storedIndex !== undefined,
    focusExercise: (exerciseIndex: number) => dispatch(setLiveWorkoutFocus({ sessionId: session.id, exerciseIndex })),
  };
}

import {
  exerciseGroupsOf,
  focusedGroupIndexOf,
  groupMoveOrder,
  withGroupMoved,
} from '@/models/session-models/exercise-groups';
import { remapLiveWorkoutDrafts, setLiveWorkoutFocus } from '@/store/app';
import type { RootState } from '@/store/store';
import { updateStoredSession } from '@/store/stored-sessions';
import type { ThunkAction, ThunkDispatch, UnknownAction } from '@reduxjs/toolkit';

type MoveState = Pick<RootState, 'app' | 'storedSessions'>;
export type LiveWorkoutMoveDispatch = ThunkDispatch<MoveState, unknown, UnknownAction>;

export function moveLiveWorkoutGroup(
  sessionId: string,
  from: number,
  to: number,
): ThunkAction<void, MoveState, unknown, UnknownAction> {
  return (dispatch, getState) => {
    const state = getState();
    const session = state.storedSessions.sessions[sessionId];
    if (!session) return;
    const groups = exerciseGroupsOf(session.recordedExercises);
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < 0 ||
      from >= groups.length ||
      to >= groups.length ||
      from === to
    )
      return;
    const order = groupMoveOrder(groups, from, to);
    const storedFocus = state.app.liveWorkoutFocus;
    const focused =
      storedFocus?.sessionId === sessionId &&
      storedFocus.exerciseIndex >= 0 &&
      storedFocus.exerciseIndex < session.recordedExercises.length
        ? storedFocus.exerciseIndex
        : undefined;
    const fallback = focusedGroupIndexOf(session, groups, undefined);
    const focus = focused ?? (fallback === undefined ? undefined : groups[fallback]?.indices[0]);
    dispatch(
      remapLiveWorkoutDrafts({
        sessionId,
        names: session.recordedExercises.map((exercise) => exercise.blueprint.name),
        order,
      }),
    );
    dispatch(updateStoredSession({ sessionId, update: (current) => withGroupMoved(current, from, to) }));
    if (focus !== undefined && (!storedFocus || storedFocus.sessionId === sessionId)) {
      dispatch(setLiveWorkoutFocus({ sessionId, exerciseIndex: order.indexOf(focus) }));
    }
  };
}

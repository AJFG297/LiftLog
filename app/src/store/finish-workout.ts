import { selectActiveProgram, setPendingPlanDiff } from '@/store/program';
import { getPlanDiff } from '@/store/program/helpers';
import { selectSession, sessionFinished } from '@/store/stored-sessions';
import type { RootState } from '@/store/store';
import type { Dispatch } from '@reduxjs/toolkit';

/**
 * Finishes the given session, first storing how it differs from the active plan as the pending plan diff
 * for the "Update your routine?" sheet. Every Finish control goes through this, in the app or on the
 * workout notification. Returns whether there is a diff to offer.
 */
export function finishWorkout(sessionId: string) {
  return (dispatch: Dispatch, getState: () => RootState): boolean => {
    const state = getState();
    const session = selectSession(state, sessionId);
    if (!session) {
      return false;
    }
    const diff = getPlanDiff(selectActiveProgram(state), session, state.program.activePlanId);
    if (diff) {
      dispatch(setPendingPlanDiff(diff));
    }
    dispatch(sessionFinished(sessionId));
    return !!diff;
  };
}

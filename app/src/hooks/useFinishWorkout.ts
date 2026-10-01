import { finishWorkout } from '@/store/finish-workout';
import type { AppDispatch } from '@/store/store';
import { useDispatch } from 'react-redux';

/**
 * Finishes the given session and returns whether the saved session
 * differs from the active plan, so the caller can open the diff-save modal.
 */
export function useFinishWorkout(sessionId: string | undefined) {
  const dispatch = useDispatch<AppDispatch>();
  return (): boolean => (sessionId ? dispatch(finishWorkout(sessionId)) : false);
}

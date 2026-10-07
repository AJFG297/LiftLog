import { ExerciseBlueprint } from '@/models/blueprint-models';
import { sessionWithExerciseEdited } from '@/models/session-models/carry-over';
import { RootState } from '@/store';
import { updateStoredSession } from '@/store/stored-sessions';
import { useCarryOver } from '@/hooks/useCarryOver';
import { useOnDismiss } from '@/hooks/useOnDismiss';
import { useRef } from 'react';
import { useDispatch, useStore } from 'react-redux';

/**
 * Holds an edit of one exercise of a workout until the screen showing it is dismissed, then applies it to
 * the workout. Returns the function that records the newest edit.
 */
export function useSessionExerciseDraft(
  sessionId: string,
  exerciseIndex: number,
): (exercise: ExerciseBlueprint) => void {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const withCarryOver = useCarryOver();
  const draftRef = useRef<ExerciseBlueprint | undefined>(undefined);

  useOnDismiss(() => {
    const updated = draftRef.current;
    if (!updated) {
      return;
    }
    const state = store.getState();
    const edited = state.storedSessions.sessions[sessionId]?.recordedExercises[exerciseIndex]?.blueprint;
    // The exercise can have been removed while the editor was open, in which case the edit is moot.
    if (!edited) {
      return;
    }
    // Only another movement opens on carried numbers, so only that can need the tables read.
    const keys = edited.movementKey() === updated.movementKey() ? [] : [updated.progressionKey()];
    withCarryOver(sessionId, keys, (carryOver) =>
      dispatch(
        updateStoredSession({
          sessionId,
          update: (s) =>
            s.recordedExercises[exerciseIndex]?.blueprint === edited
              ? sessionWithExerciseEdited(s, exerciseIndex, updated, carryOver)
              : s,
        }),
      ),
    );
  });

  return (exercise) => {
    draftRef.current = exercise;
  };
}

import { sessionWithPickAdded } from '@/components/presentation/workout-editor/exercise-picker';
import { useExercisePicker } from '@/hooks/useExerciseSearch';
import { RootState, useAppSelectorWithArg } from '@/store';
import { selectCarryOver, selectSession, updateStoredSession } from '@/store/stored-sessions';
import { useDispatch, useStore } from 'react-redux';

/**
 * Opens the exercise picker and adds what was picked to the end of the session, in tap order, as one
 * superset when asked, each on the numbers a routine would carry over for it. `onAdded` gets the index of
 * the first exercise added.
 *
 * Every caller for a session shares one request id: the All exercises sheet closes itself before the
 * picker opens, so the live workout underneath, which uses this hook too, is the one that adds the pick.
 */
export function useAddExercise(sessionId: string | undefined, options?: { onAdded?: (firstIndex: number) => void }) {
  const session = useAppSelectorWithArg(selectSession, sessionId ?? '');
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const onAdded = options?.onAdded;

  const open = useExercisePicker(
    (pick) => {
      const state = store.getState();
      const current = sessionId ? state.storedSessions.sessions[sessionId] : undefined;
      if (!sessionId || !current || !pick.exercises.length) {
        return;
      }
      const picked = pick.exercises.map((exercise) => ({ id: exercise.id, name: exercise.descriptor.name }));
      const carryOver = selectCarryOver(state, sessionId);
      dispatch(
        updateStoredSession({
          sessionId,
          update: (s) => sessionWithPickAdded(s, picked, pick.asSuperset, carryOver),
        }),
      );
      onAdded?.(current.recordedExercises.length);
    },
    { requestId: `add-exercise:${sessionId ?? ''}` },
  );

  return () => {
    if (!sessionId || !session) {
      return;
    }
    open({
      mode: 'add',
      context: {
        name: session.blueprint.name,
        exerciseIds: session.recordedExercises.map((exercise) => exercise.blueprint.exerciseId),
      },
    });
  };
}

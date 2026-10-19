import { useWorkoutExerciseChanges } from '@/hooks/useWorkoutExerciseChanges';
import { useExercisePicker } from '@/hooks/useExerciseSearch';
import { useAppSelectorWithArg } from '@/store';
import { selectSession } from '@/store/stored-sessions';

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
  const { add } = useWorkoutExerciseChanges();
  const onAdded = options?.onAdded;

  const open = useExercisePicker(
    (pick) => {
      if (!sessionId) {
        return;
      }
      void add({
        sessionId,
        picked: pick.exercises.map((exercise) => ({ id: exercise.id, name: exercise.descriptor.name })),
        asSuperset: pick.asSuperset,
        onAdded,
      });
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

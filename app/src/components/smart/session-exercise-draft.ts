import { ExerciseBlueprint } from '@/models/blueprint-models';
import { useServices } from '@/components/smart/services-provider';
import { useOnDismiss } from '@/hooks/useOnDismiss';
import { useRef } from 'react';

/**
 * Holds an edit of one exercise of a workout until the screen showing it is dismissed, then applies it to
 * the workout. Returns the function that records the newest edit.
 */
export function useSessionExerciseDraft(
  sessionId: string,
  exerciseIndex: number,
): (exercise: ExerciseBlueprint) => void {
  const { exerciseEntry } = useServices();
  const draftRef = useRef<ExerciseBlueprint | undefined>(undefined);

  useOnDismiss(() => {
    const updated = draftRef.current;
    if (!updated) {
      return;
    }
    const target = exerciseEntry.target({ workoutId: sessionId, index: exerciseIndex });
    if (target) void exerciseEntry.edit({ target, blueprint: updated });
  });

  return (exercise) => {
    draftRef.current = exercise;
  };
}

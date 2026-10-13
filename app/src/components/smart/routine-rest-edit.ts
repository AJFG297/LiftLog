import { openExerciseEdit } from '@/components/smart/exercise-edit-draft';
import { RoutineDraftLocation, routineDraftAt, updateRoutineDraft } from '@/components/smart/routine-draft';
import { WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { uuid } from '@/utils/uuid';

/**
 * Opens an edit of one routine exercise for the rest sheet (`getExerciseEditRestHref`), which the routine
 * editor's card opens without the edit exercise sheet under it. Each change lands in the routine editor's
 * draft, so its Save and Cancel cover it. Only the rest is taken, so nothing else in the exercise is
 * overwritten by the copy the sheet opened on. Undefined when there is no weighted exercise there.
 */
export function openRoutineRestEdit(
  location: RoutineDraftLocation,
  exerciseIndex: number,
): { editId: string; close: () => void } | undefined {
  const exercise = routineDraftAt(location)?.routine.exercises[exerciseIndex];
  if (!(exercise instanceof WeightedExerciseBlueprint)) {
    return undefined;
  }
  const editId = uuid();
  const close = openExerciseEdit(editId, exercise, (edited) => {
    if (!(edited instanceof WeightedExerciseBlueprint)) {
      return;
    }
    updateRoutineDraft(location, (routine) => {
      const current = routine.exercises[exerciseIndex];
      return current instanceof WeightedExerciseBlueprint
        ? routine.withExercise(exerciseIndex, current.with({ restBetweenSets: edited.restBetweenSets }))
        : routine;
    });
  });
  return { editId, close };
}

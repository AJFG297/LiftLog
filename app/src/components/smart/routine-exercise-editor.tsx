import { ActionButton } from '@/components/presentation/foundation/action-button';
import { ExerciseEditorSheet } from '@/components/smart/exercise-editor-sheet';
import CopyExerciseDialog from '@/components/smart/copy-exercise-dialog';
import { updateRoutineDraft, useRoutineDraft } from '@/components/smart/routine-draft';
import { useBackWhenGone } from '@/hooks/useBackWhenGone';
import { ExerciseBlueprint } from '@/models/blueprint-models';
import { useAppSelector } from '@/store';
import { updateProgram } from '@/store/program';
import { useTranslate } from '@tolgee/react';
import { Href } from 'expo-router';
import { useState } from 'react';
import { useDispatch } from 'react-redux';

export interface RoutineExerciseLocation {
  programId: string;
  sessionIndex: number;
  exerciseIndex: number;
}

export function getRoutineExerciseEditorHref(location: RoutineExerciseLocation): Href {
  return {
    pathname: '/routine-exercise-editor',
    params: {
      programId: location.programId,
      sessionIndex: String(location.sessionIndex),
      exerciseIndex: String(location.exerciseIndex),
    },
  } as unknown as Href;
}

/**
 * The edit exercise sheet on one exercise of a routine. Opened from the routine editor it edits the
 * editor's draft, so Save and Cancel there cover it too. Opened on its own, it edits the saved routine
 * directly. Either way each change lands as it is made.
 */
export function RoutineExerciseEditor(location: RoutineExerciseLocation) {
  const { t } = useTranslate();
  const dispatch = useDispatch();
  const draft = useRoutineDraft(location);
  const savedRoutine = useAppSelector(
    (x) => x.program.savedPrograms[location.programId]?.sessions[location.sessionIndex],
  );
  const routine = draft ? draft.routine : savedRoutine;
  const exercise = routine?.exercises[location.exerciseIndex];
  const [copyOpen, setCopyOpen] = useState(false);

  const saveExercise = (exerciseToSave: ExerciseBlueprint) => {
    if (draft) {
      updateRoutineDraft(location, (r) => r.withExercise(location.exerciseIndex, exerciseToSave));
      return;
    }
    dispatch(
      updateProgram({
        programId: location.programId,
        update: (program) =>
          program.withSession(location.sessionIndex, (session) =>
            session.withExercise(location.exerciseIndex, exerciseToSave),
          ),
      }),
    );
  };

  useBackWhenGone(!exercise);

  if (!routine || !exercise) {
    return null;
  }

  return (
    <ExerciseEditorSheet
      exercise={exercise}
      scope={{ kind: draft ? 'routineDraft' : 'routine', routineName: routine.name }}
      nextExerciseName={routine.exercises[location.exerciseIndex + 1]?.name}
      onChange={saveExercise}
      footer={
        <>
          <ActionButton
            variant="secondary"
            label={t('exercise.copy_to_session.button')}
            onPress={() => setCopyOpen(true)}
          />
          <CopyExerciseDialog
            visible={copyOpen}
            onDismiss={() => setCopyOpen(false)}
            exerciseBlueprint={exercise}
            currentSessionIndex={location.sessionIndex}
            programId={location.programId}
          />
        </>
      }
    />
  );
}

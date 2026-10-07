import { ActionButton } from '@/components/presentation/foundation/action-button';
import Menu from '@/components/presentation/foundation/menu';
import { ExerciseEditorSheet } from '@/components/smart/exercise-editor-sheet';
import { updateRoutineDraft, useRoutineDraft } from '@/components/smart/routine-draft';
import { useBackWhenGone } from '@/hooks/useBackWhenGone';
import { ExerciseBlueprint } from '@/models/blueprint-models';
import { useAppSelector } from '@/store';
import { showSnackbar } from '@/store/app';
import { setProgramSession, updateProgram } from '@/store/program';
import { useTranslate } from '@tolgee/react';
import { Href } from 'expo-router';
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
  const program = useAppSelector((x) => x.program.savedPrograms[location.programId]);

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

  const copyTo = (exerciseToCopy: ExerciseBlueprint, sessionIndex: number) => {
    const target = program?.sessions[sessionIndex];
    if (!target) {
      return;
    }
    dispatch(
      setProgramSession({
        programId: location.programId,
        sessionIndex,
        sessionBlueprint: target.with({ exercises: [...target.exercises, exerciseToCopy] }),
      }),
    );
    dispatch(
      showSnackbar({
        text: t('exercise.copied_to_session.message', {
          exerciseName: exerciseToCopy.name,
          targetSessionName: target.name,
        }),
      }),
    );
  };

  useBackWhenGone(!exercise);

  if (!routine || !exercise) {
    return null;
  }

  const copyTargets = (program?.sessions ?? [])
    .map((session, index) => ({ session, index }))
    .filter(({ index }) => index !== location.sessionIndex);

  return (
    <ExerciseEditorSheet
      exercise={exercise}
      scope={{ kind: draft ? 'routineDraft' : 'routine', routineName: routine.name }}
      nextExerciseName={routine.exercises[location.exerciseIndex + 1]?.name}
      onChange={saveExercise}
      footer={
        <Menu
          size="content"
          testID="exercise-copy-to-routine"
          items={
            copyTargets.length === 0
              ? [{ label: t('plan.no_other_sessions_available.message'), onPress: () => {}, disabled: true }]
              : copyTargets.map(({ session, index }) => ({
                  label: session.name,
                  onPress: () => copyTo(exercise, index),
                }))
          }
          trigger={(open) => (
            <ActionButton variant="secondary" label={t('exercise.copy_to_session.button')} onPress={open} />
          )}
        />
      }
    />
  );
}

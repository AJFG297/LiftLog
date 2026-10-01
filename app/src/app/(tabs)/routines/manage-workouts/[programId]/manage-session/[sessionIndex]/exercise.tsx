import FullHeightScrollView from '@/components/layout/full-height-scroll-view';
import { ActionButton } from '@/components/presentation/foundation/action-button';
import { ExerciseEditor } from '@/components/presentation/workout-editor/exercise-editor';
import CopyExerciseDialog from '@/components/smart/copy-exercise-dialog';
import { updateRoutineDraft, useRoutineDraft } from '@/components/smart/routine-draft';
import { spacing } from '@/hooks/useAppTheme';
import { ExerciseBlueprint } from '@/models/blueprint-models';
import { useAppSelector } from '@/store';
import { selectProgramSessionExercise, updateProgram } from '@/store/program';
import { useTranslate } from '@tolgee/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useDispatch } from 'react-redux';

/**
 * Every setting of one exercise in a routine. Opened from the routine editor it edits the editor's draft,
 * so Save and Cancel there cover it too. Opened on its own, it edits the saved routine directly.
 */
export default function ExercisePage() {
  const { t } = useTranslate();
  const { sessionIndex, programId, exerciseIndex } = useLocalSearchParams<{
    sessionIndex: string;
    programId: string;
    exerciseIndex: string;
  }>();
  const location = {
    programId,
    sessionIndex: Number(sessionIndex),
    exerciseIndex: Number(exerciseIndex),
  };
  const draft = useRoutineDraft(location);
  const savedExercise = useAppSelector((x) => selectProgramSessionExercise(x, location));
  const exercise = draft ? draft.routine.exercises[location.exerciseIndex] : savedExercise;
  const dispatch = useDispatch();
  const { dismiss } = useRouter();
  const [copyOpen, setCopyOpen] = useState(false);
  const saveExercise = (exerciseToSave: ExerciseBlueprint) => {
    if (draft) {
      updateRoutineDraft(location, (routine) => routine.withExercise(location.exerciseIndex, exerciseToSave));
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
  const hasExercise = !!exercise;
  useEffect(() => {
    if (!hasExercise) {
      dismiss();
    }
  }, [hasExercise, dismiss]);
  if (!exercise) {
    return;
  }

  return (
    <FullHeightScrollView avoidKeyboard>
      <ExerciseEditor exercise={exercise} updateExercise={saveExercise} />
      <View style={{ paddingHorizontal: spacing.pageHorizontalMargin, paddingBottom: spacing[8] }}>
        <ActionButton
          variant="secondary"
          label={t('exercise.copy_to_session.button')}
          onPress={() => setCopyOpen(true)}
        />
      </View>
      <CopyExerciseDialog
        visible={copyOpen}
        onDismiss={() => setCopyOpen(false)}
        exerciseBlueprint={exercise}
        currentSessionIndex={location.sessionIndex}
        programId={location.programId}
      />
      <Stack.Screen options={{ title: t('exercise.edit.title') }} />
    </FullHeightScrollView>
  );
}

import FullHeightScrollView from '@/components/layout/full-height-scroll-view';
import { ExerciseEditor } from '@/components/presentation/workout-editor/exercise-editor';
import { ExerciseBlueprint } from '@/models/blueprint-models';
import { useAppSelectorWithArg } from '@/store';
import { selectSession } from '@/store/stored-sessions';
import { useTranslate } from '@tolgee/react';
import { Href, Stack, useRouter } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useOnDismiss } from '@/hooks/useOnDismiss';
import { useWorkoutExerciseChanges } from '@/hooks/useWorkoutExerciseChanges';

export function getSessionExerciseEditorHref(sessionId: string, index: number): Href {
  return `/exercise-editor?sessionId=${encodeURIComponent(sessionId)}&index=${index}` as Href;
}

export function SessionExerciseEditor(props: { sessionId: string; index: number }) {
  const { t } = useTranslate();
  const exerciseIndex = props.index;
  const session = useAppSelectorWithArg(selectSession, props.sessionId);
  const { edit } = useWorkoutExerciseChanges();
  const { dismiss } = useRouter();

  const exercise = session?.recordedExercises[exerciseIndex]?.blueprint;

  const title = t('exercise.edit.title');

  // Hold the edited exercise locally and only apply it to the session when the route is dismissed
  const draftRef = useRef<ExerciseBlueprint | undefined>(undefined);
  const saveExercise = (updated: ExerciseBlueprint) => {
    draftRef.current = updated;
  };
  const headerHeight = useContext(HeaderHeightContext); // Intentionally don't use useHeaderHeight as it might not be in a stack
  const topInsetHeight = Platform.select({ ios: headerHeight }) ?? 0;

  useOnDismiss(() => {
    const updated = draftRef.current;
    if (!updated) {
      return;
    }
    void edit({ sessionId: props.sessionId, index: exerciseIndex, updated });
  });

  const hasExercise = !!exercise;
  useEffect(() => {
    if (!hasExercise) {
      dismiss();
    }
  }, [hasExercise, dismiss]);

  return (
    <FullHeightScrollView
      safeAreaEdges={{
        left: 'additive',
        right: 'additive',
        top: 'off',
        bottom: 'additive',
      }}
      avoidKeyboard
      contentContainerStyle={{ insetBlockStart: topInsetHeight }}
    >
      <Stack.Screen options={{ title }} />
      {exercise ? <ExerciseEditor exercise={exercise} updateExercise={saveExercise} /> : null}
    </FullHeightScrollView>
  );
}

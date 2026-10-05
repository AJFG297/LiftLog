import FullHeightScrollView from '@/components/layout/full-height-scroll-view';
import { ExerciseEditor } from '@/components/presentation/workout-editor/exercise-editor';
import { ExerciseBlueprint } from '@/models/blueprint-models';
import { sessionWithExerciseEdited } from '@/models/session-models/carry-over';
import { RootState, useAppSelectorWithArg } from '@/store';
import { selectSession, updateStoredSession, withCarryOver } from '@/store/stored-sessions';
import { useServices } from '@/components/smart/services-provider';
import { useTranslate } from '@tolgee/react';
import { Href, Stack, useRouter } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useDispatch, useStore } from 'react-redux';
import { useOnDismiss } from '@/hooks/useOnDismiss';

export function getSessionExerciseEditorHref(sessionId: string, index: number): Href {
  return `/exercise-editor?sessionId=${encodeURIComponent(sessionId)}&index=${index}` as Href;
}

export function SessionExerciseEditor(props: { sessionId: string; index: number }) {
  const { t } = useTranslate();
  const exerciseIndex = props.index;
  const session = useAppSelectorWithArg(selectSession, props.sessionId);
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const { workoutRepository } = useServices();
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
    const state = store.getState();
    const edited = state.storedSessions.sessions[props.sessionId]?.recordedExercises[exerciseIndex]?.blueprint;
    // The exercise can have been removed while the editor was open, in which case the edit is moot.
    if (!edited) {
      return;
    }
    // Only another movement opens on carried numbers, so only that can need the tables read.
    const keys = edited.movementKey() === updated.movementKey() ? [] : [updated.progressionKey()];
    void withCarryOver(store.getState, workoutRepository, props.sessionId, keys, (carryOver) =>
      dispatch(
        updateStoredSession({
          sessionId: props.sessionId,
          update: (s) =>
            s.recordedExercises[exerciseIndex]?.blueprint === edited
              ? sessionWithExerciseEdited(s, exerciseIndex, updated, carryOver)
              : s,
        }),
      ),
    );
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

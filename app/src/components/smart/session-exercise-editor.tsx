import { sessionEditScope } from '@/components/presentation/workout-editor/exercise-edit-copy';
import { ExerciseEditorSheet } from '@/components/smart/exercise-editor-sheet';
import { ExerciseBlueprint } from '@/models/blueprint-models';
import { sessionWithExerciseEdited } from '@/models/session-models/carry-over';
import { RootState, useAppSelector, useAppSelectorWithArg } from '@/store';
import { selectActiveSessionId, selectSession, updateStoredSession } from '@/store/stored-sessions';
import { Href } from 'expo-router';
import { useRef } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { useOnDismiss } from '@/hooks/useOnDismiss';
import { useCarryOver } from '@/hooks/useCarryOver';
import { useBackWhenGone } from '@/hooks/useBackWhenGone';

export function getSessionExerciseEditorHref(sessionId: string, index: number): Href {
  return `/exercise-editor?sessionId=${encodeURIComponent(sessionId)}&index=${index}` as Href;
}

/**
 * The edit exercise sheet on one exercise of a workout: the workout in progress (today only), or a past one
 * opened from history. The edit is held until the sheet closes, by its save button or a swipe, and then
 * applied to the workout.
 */
export function SessionExerciseEditor(props: { sessionId: string; index: number }) {
  const exerciseIndex = props.index;
  const session = useAppSelectorWithArg(selectSession, props.sessionId);
  const activeSessionId = useAppSelector(selectActiveSessionId);
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const withCarryOver = useCarryOver();

  const exercise = session?.recordedExercises[exerciseIndex]?.blueprint;

  // Hold the edited exercise locally and only apply it to the session when the route is dismissed
  const draftRef = useRef<ExerciseBlueprint | undefined>(undefined);

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
    withCarryOver(props.sessionId, keys, (carryOver) =>
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

  useBackWhenGone(!exercise);

  if (!session || !exercise) {
    return null;
  }

  return (
    <ExerciseEditorSheet
      exercise={exercise}
      scope={sessionEditScope(session, activeSessionId)}
      nextExerciseName={session.recordedExercises[exerciseIndex + 1]?.blueprint.name}
      onChange={(updated) => {
        draftRef.current = updated;
      }}
    />
  );
}

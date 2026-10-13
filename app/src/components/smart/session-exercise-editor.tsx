import { sessionEditScope } from '@/components/presentation/workout-editor/exercise-edit-copy';
import { workingWeightOf } from '@/components/presentation/workout-editor/warmup-edit';
import { ExerciseEditorSheet } from '@/components/smart/exercise-editor-sheet';
import { useSessionExerciseDraft } from '@/components/smart/session-exercise-draft';
import { RecordedWeightedExercise } from '@/models/session-models';
import { useAppSelector, useAppSelectorWithArg } from '@/store';
import { selectActiveSessionId, selectSession } from '@/store/stored-sessions';
import { Href } from 'expo-router';
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
  const keepDraft = useSessionExerciseDraft(props.sessionId, exerciseIndex);

  const recorded = session?.recordedExercises[exerciseIndex];
  const exercise = recorded?.blueprint;

  useBackWhenGone(!exercise);

  if (!session || !exercise) {
    return null;
  }

  return (
    <ExerciseEditorSheet
      exercise={exercise}
      scope={sessionEditScope(session, activeSessionId)}
      nextExerciseName={session.recordedExercises[exerciseIndex + 1]?.blueprint.name}
      workingWeight={recorded instanceof RecordedWeightedExercise ? workingWeightOf(recorded.potentialSets) : undefined}
      onChange={keepDraft}
    />
  );
}

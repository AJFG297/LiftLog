import { haptics } from '@/components/presentation/foundation/haptics';
import { withRestTimerAt } from '@/components/smart/recorded-exercise-view';
import { RecordedExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import { SetDrafts, SetEntryState } from '@/models/session-models/set-entry';
import { useAppSelector } from '@/store';
import { setLiveWorkoutDrafts } from '@/store/app';
import { useDispatch } from 'react-redux';

type UpdateSession = (update: (session: Session) => Session) => void;
type SetEntryChange = (state: SetEntryState) => SetEntryState;

const NO_DRAFTS: SetDrafts = {};

function liveExerciseKey(exerciseIndex: number, exercise: RecordedExercise): string {
  return `${exerciseIndex}:${exercise.blueprint.name}`;
}

function loggedCount(exercise: RecordedWeightedExercise): number {
  return [...exercise.warmupSets, ...exercise.potentialSets].filter((slot) => slot.set).length;
}

/**
 * One weighted exercise's sets with what was typed into them, and the one way to change both. Shared by the
 * workout screen and the set-type sheet.
 */
export function useSetEntryStore(session: Session, updateSession: UpdateSession) {
  const dispatch = useDispatch();
  const stored = useAppSelector((x) => x.app.liveWorkoutDrafts);

  const stateFor = (exerciseIndex: number): SetEntryState | undefined => {
    const exercise = session.recordedExercises[exerciseIndex];
    if (!(exercise instanceof RecordedWeightedExercise)) {
      return undefined;
    }
    const drafts =
      stored?.sessionId === session.id ? stored.exercises[liveExerciseKey(exerciseIndex, exercise)] : undefined;
    return { exercise, drafts: drafts ?? NO_DRAFTS };
  };

  /**
   * Applies `change` to the exercise as the store holds it, and to its drafts. Logging or undoing a set
   * restarts rest from the latest set, as the old set tiles did.
   */
  const apply = (exerciseIndex: number, change: SetEntryChange): SetEntryState | undefined => {
    const current = stateFor(exerciseIndex);
    if (!current) {
      return undefined;
    }
    const next = change(current);
    if (next.exercise !== current.exercise) {
      updateSession((s) => {
        const exercise = s.recordedExercises[exerciseIndex];
        if (!(exercise instanceof RecordedWeightedExercise)) {
          return s;
        }
        const changed = change({ exercise, drafts: current.drafts }).exercise;
        const updated = s.withExercise(exerciseIndex, changed);
        return loggedCount(changed) === loggedCount(exercise)
          ? updated
          : withRestTimerAt(updated, updated.lastExercise?.lastActivityTime);
      });
      if (loggedCount(next.exercise) > loggedCount(current.exercise)) {
        haptics.setLogged();
      }
    }
    if (next.drafts !== current.drafts) {
      dispatch(
        setLiveWorkoutDrafts({
          sessionId: session.id,
          exerciseKey: liveExerciseKey(exerciseIndex, current.exercise),
          drafts: next.drafts,
        }),
      );
    }
    return next;
  };

  return { stateFor, apply };
}

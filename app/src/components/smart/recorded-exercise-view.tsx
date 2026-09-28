import { CardioExercise } from '@/components/presentation/workout/cardio/cardio-exercise';
import WeightedExercise from '@/components/presentation/workout/weighted/weighted-exercise';
import { getSessionExerciseEditorHref } from '@/components/smart/session-exercise-editor';
import {
  RecordedCardioExercise,
  RecordedCardioExerciseSet,
  RecordedWeightedExercise,
  RestTimer,
  Session,
} from '@/models/session-models';
import { useAppSelector, useAppSelectorWithArg } from '@/store';
import { selectRecentlyCompletedExercises } from '@/store/stored-sessions';
import { Updater } from '@/utils/types';
import { LocalTime, OffsetDateTime, ZoneId } from '@js-joda/core';
import { useRouter } from 'expo-router';

export function withRestTimerAt(session: Session, time: OffsetDateTime | undefined) {
  return session.with({ restTimer: time ? new RestTimer(time) : undefined });
}

/**
 * The cardio write path: both a set's own tiles and the docked clock go through here, so a set earns its
 * rest whichever way it was filled in.
 */
export function withCardioSetUpdate(
  exerciseIndex: number,
  setIndex: number,
  update: Updater<RecordedCardioExerciseSet>,
  now: OffsetDateTime,
) {
  return (s: Session) => {
    const before = s.cardioSetAt(exerciseIndex, setIndex);
    const updated = s.withCardioSet(exerciseIndex, setIndex, update, now);
    return updated.cardioSetAt(exerciseIndex, setIndex)?.earnsRest(before)
      ? withRestTimerAt(updated, updated.lastExercise?.lastActivityTime)
      : updated;
  };
}

interface RecordedExerciseViewProps {
  session: Session;
  exerciseIndex: number;
  /** Omit for a session the user does not own, which makes the exercise read-only. */
  updateSession?: (update: (session: Session) => Session) => void;
  /** The workout being performed right now: live timestamps and previous performances. */
  isActiveWorkout?: boolean;
  toStartNext: boolean;
  variant?: 'list' | 'focus';
}

/** One exercise's sets, weighted or cardio: the logging UI every session screen shares. */
export function RecordedExerciseView(props: RecordedExerciseViewProps) {
  const { session, exerciseIndex, isActiveWorkout } = props;
  const { push } = useRouter();
  const logRpe = useAppSelector((x) => x.settings.logRpe);
  const recentlyCompletedExercises = useAppSelectorWithArg(selectRecentlyCompletedExercises, session.id);
  const isReadonly = !props.updateSession;
  const updateSession = (reducer: (session: Session) => Session) => props.updateSession?.(reducer);
  const onEditExercise = isReadonly ? undefined : () => push(getSessionExerciseEditorHref(session.id, exerciseIndex));
  const onRemoveExercise = () => updateSession((s) => s.withRemovedExercise(exerciseIndex));
  const item = session.recordedExercises[exerciseIndex];

  if (item instanceof RecordedWeightedExercise) {
    return (
      <WeightedExercise
        timeProvider={() =>
          isActiveWorkout
            ? OffsetDateTime.now()
            : (session.lastExercise?.lastActivityTime ??
              session.date.atTime(LocalTime.now()).atZone(ZoneId.systemDefault()).toOffsetDateTime())
        }
        resetSetTimer={() => updateSession((s) => withRestTimerAt(s, s.lastExercise?.lastActivityTime))}
        recordedExercise={item}
        toStartNext={props.toStartNext}
        updateExercise={(update) =>
          updateSession((s) =>
            s.withExercise(exerciseIndex, update(s.recordedExercises[exerciseIndex] as RecordedWeightedExercise)),
          )
        }
        onEditExercise={onEditExercise}
        onRemoveExercise={onRemoveExercise}
        isReadonly={isReadonly}
        rpeEnabled={logRpe}
        showPreviousButton={!!isActiveWorkout}
        previousRecordedExercises={recentlyCompletedExercises(item.movementKey()) as RecordedWeightedExercise[]}
        variant={props.variant}
      />
    );
  }
  if (item instanceof RecordedCardioExercise) {
    return (
      <CardioExercise
        recordedExercise={item}
        updateExercise={(ex) =>
          updateSession((s) =>
            s.withExercise(exerciseIndex, ex(s.recordedExercises[exerciseIndex] as RecordedCardioExercise)),
          )
        }
        updateSet={(setIndex, update) =>
          updateSession(withCardioSetUpdate(exerciseIndex, setIndex, update, OffsetDateTime.now()))
        }
        onStartTimer={(setIndex) =>
          updateSession((s) => s.withCardioTimerStarted(exerciseIndex, setIndex, OffsetDateTime.now()))
        }
        toStartNext={props.toStartNext}
        onEditExercise={onEditExercise}
        onRemoveExercise={onRemoveExercise}
        isReadonly={isReadonly}
        showPreviousButton={!!isActiveWorkout}
        previousRecordedExercises={recentlyCompletedExercises(item.movementKey()) as RecordedCardioExercise[]}
        variant={props.variant}
      />
    );
  }
  return null;
}

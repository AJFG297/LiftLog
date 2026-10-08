import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { restWindowOf } from '@/models/session-models/rest';
import { toDurationJSON, toInstantJson } from '@/models/storage/versions/latest';
import { CardioTimerInfo, CurrentExerciseDetails, RestTimerInfo } from '@/models/workout-worker-messages';
import { Duration } from '@js-joda/core';

export function workoutUpdatedEvent(session: Session, restTimersEnabled: boolean) {
  return {
    type: 'WorkoutUpdatedEvent',
    workout: session.toJSON(),
    restTimerInfo: restTimersEnabled ? getTimerInfo(session) : undefined,
    cardioTimerInfo: getCardioTimerInfo(session),
    currentExerciseDetails: getCurrentExerciseDetails(session),
    totalWeightLifted: session.totalWeightLifted.toJSON(),
    workoutDuration: toDurationJSON(session.duration ?? Duration.ZERO),
  } as const;
}

export function getCardioTimerInfo(session: Session): CardioTimerInfo | undefined {
  const running = session.runningCardioSet;
  if (!running) {
    return undefined;
  }

  const { set, exerciseIndex, setIndex } = running;
  return {
    currentBlockStartTime: toInstantJson(set.currentBlockStartTime?.toInstant()),
    // The notification anchors its clock at `currentBlockStartTime - currentDuration`, so this must
    // be the set's own banked time and not the exercise's running total.
    currentDuration: toDurationJSON(set.duration ?? Duration.ZERO),
    exerciseIndex,
    setIndex,
  };
}

export function getCurrentExerciseDetails(session: Session): CurrentExerciseDetails | undefined {
  const next = session.nextExercise;
  if (!next) {
    return undefined;
  }
  // A weighted exercise's next set may be a warm-up, which the worker labels as one. Once every
  // working set is logged there is no current set, and the index stays at -1 as it always has.
  const current = next instanceof RecordedWeightedExercise ? next.currentSet : undefined;
  const slot = current && (next as RecordedWeightedExercise).slotAt(current);
  return {
    exercise: next.toJSON(),
    setKind: slot?.kind ?? 'working',
    setIndex: current?.index ?? next.currentSetIndex,
  };
}

/** The same window the rest pill counts down, so the notification and the pill agree. */
export function getTimerInfo(session: Session): RestTimerInfo | undefined {
  const window = restWindowOf(session);
  if (!window) {
    return undefined;
  }
  return {
    startedAt: toInstantJson(window.startedAt.toInstant()),
    partiallyEndAt: toInstantJson(window.readyAt.toInstant()),
    // The countdown has one end since D5 dropped the max rest; both instants stay for the native worker.
    endAt: toInstantJson(window.readyAt.toInstant()),
  };
}

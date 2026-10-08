import { Duration, OffsetDateTime } from '@js-joda/core';
import { failedSetRestOf } from '@/models/blueprint-models';
import { RecordedCardioExercise } from '@/models/session-models/recorded-cardio-exercise';
import type { RecordedExercise } from '@/models/session-models/recorded-exercise';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import { RestTimer } from '@/models/session-models/rest-timer';
import type { Session } from '@/models/session-models/session';

/** How much the rest sheet's -15 and +15 move the countdown. */
export const REST_STEP = Duration.ofSeconds(15);

/** -15 stops here rather than at zero, so the countdown still runs out (and says so) on its own. */
export const MIN_REMAINING_AFTER_STEP = Duration.ofSeconds(1);

/** The rest sheet's presets, 0:30 to 3:00. */
export const REST_PRESETS: readonly Duration[] = [30, 60, 90, 120, 150, 180].map((s) => Duration.ofSeconds(s));

/**
 * The running rest, as instants. The pill and the sheet count down to `readyAt` and then show Go; the
 * workout worker gets the same instants, so its notification counts down with them.
 */
export interface RestWindow {
  startedAt: OffsetDateTime;
  /** What the countdown runs for: a picked length, or the rest (the failed-set rest after a missed set). */
  length: Duration;
  readyAt: OffsetDateTime;
}

export type RestPhase =
  | { kind: 'idle' }
  | { kind: 'resting'; remaining: Duration; length: Duration }
  /** The countdown is over: the pill reads Go until the next set restarts the timer. */
  | { kind: 'ready' };

/** The rest the latest set earned, before any length picked in the sheet. */
function earnedRestOf(exercise: RecordedExercise | undefined): Duration | undefined {
  if (exercise instanceof RecordedCardioExercise) {
    return exercise.lastCompletedSet?.blueprint.restBetweenSets?.rest;
  }
  if (!(exercise instanceof RecordedWeightedExercise) || !exercise.hasLoggedAnySet) {
    return undefined;
  }
  const rest = exercise.blueprint.restBetweenSets;
  return exercise.lastSetMissedTarget ? failedSetRestOf(rest) : rest.rest;
}

export function restWindowOf(session: Session): RestWindow | undefined {
  const timer = session.restTimer;
  // A running cardio clock is the next set under way, so there is no rest to count down or buzz for.
  if (!timer || !session.nextExercise || session.runningCardioSet) {
    return undefined;
  }
  const length = timer.length ?? earnedRestOf(session.lastExercise);
  if (!length || length.isZero() || length.isNegative()) {
    return undefined;
  }
  return { startedAt: timer.startedAt, length, readyAt: timer.startedAt.plus(length) };
}

export function restPhaseAt(session: Session, now: OffsetDateTime): RestPhase {
  return restPhaseOf(restWindowOf(session), now);
}

export function restPhaseOf(window: RestWindow | undefined, now: OffsetDateTime): RestPhase {
  if (!window) {
    return { kind: 'idle' };
  }
  if (now.isBefore(window.readyAt)) {
    return { kind: 'resting', remaining: Duration.between(now, window.readyAt), length: window.length };
  }
  return { kind: 'ready' };
}

/** A buzz that lands later than this after its moment (the app was in the background) is dropped. */
const CUE_LATENESS = Duration.ofSeconds(2);

/**
 * Whether going from `before` to `after` crosses the end of the countdown, the moment the phone buzzes while
 * the workout is on screen. The notification covers it otherwise, so a crossing noticed late, on coming back
 * to the app, stays quiet.
 */
export function isRestCue(
  before: RestPhase,
  after: RestPhase,
  window: RestWindow | undefined,
  now: OffsetDateTime,
): boolean {
  if (!window || after.kind !== 'ready') {
    return false;
  }
  return before.kind === 'resting' && Duration.between(window.readyAt, now).compareTo(CUE_LATENESS) <= 0;
}

/**
 * -15 or +15 on a running countdown. -15 moves the start back, stopping one second short of the end. +15
 * moves the start forward, or, in the first 15 seconds, lengthens the rest instead, so the timer never
 * starts in the future. Anything but a running countdown is left alone.
 */
export function withRestStepped(session: Session, direction: -1 | 1, now: OffsetDateTime): Session {
  const window = restWindowOf(session);
  const timer = session.restTimer;
  if (!window || !timer || !now.isBefore(window.readyAt)) {
    return session;
  }
  const remaining = Duration.between(now, window.readyAt);
  if (direction === -1) {
    if (remaining.compareTo(MIN_REMAINING_AFTER_STEP) <= 0) {
      return session;
    }
    const target = remaining.minus(REST_STEP);
    const shift =
      target.compareTo(MIN_REMAINING_AFTER_STEP) < 0 ? remaining.minus(MIN_REMAINING_AFTER_STEP) : REST_STEP;
    return session.with({ restTimer: new RestTimer(timer.startedAt.minus(shift), timer.length) });
  }
  const elapsed = Duration.between(window.startedAt, now);
  const restTimer =
    elapsed.compareTo(REST_STEP) >= 0
      ? new RestTimer(timer.startedAt.plus(REST_STEP), timer.length)
      : new RestTimer(timer.startedAt, window.length.plus(REST_STEP));
  return session.with({ restTimer });
}

/** A preset: restarts the timer at that length, or starts one when nothing is running. */
export function withRestStarted(session: Session, length: Duration, now: OffsetDateTime): Session {
  return session.with({ restTimer: new RestTimer(now, length) });
}

/**
 * Whether a length is one of the sheet's presets, the only lengths it offers to keep as the exercise's rest.
 * +15 can make any length, including a lengthened failed-set rest after a missed set, which isn't a rest the
 * lifter chose for the exercise.
 */
export function isRestPreset(length: Duration): boolean {
  return REST_PRESETS.some((preset) => preset.equals(length));
}

export function withRestSkipped(session: Session): Session {
  return session.with({ restTimer: undefined });
}

/** The exercise's own rest: what the idle pill shows and what a picked length is compared with. */
export function exerciseRestOf(exercise: RecordedExercise | undefined): Duration | undefined {
  if (exercise instanceof RecordedWeightedExercise) {
    return exercise.blueprint.restBetweenSets.rest;
  }
  if (exercise instanceof RecordedCardioExercise) {
    const next = exercise.sets.find((set) => !set.completionDateTime) ?? exercise.lastCompletedSet;
    return next?.blueprint.restBetweenSets?.rest;
  }
  return undefined;
}

/**
 * The exercise a running rest belongs to, the one "Use 2:00 for Bench Press from now on" writes to: the
 * one whose set started it. A timer started from the sheet before any set falls back to `fallbackIndex`,
 * the exercise on screen. Only a weighted exercise keeps a rest of its own; cardio rests per set.
 */
export function restOwnerIndexOf(session: Session, fallbackIndex: number | undefined): number | undefined {
  const last = session.lastExercise;
  const index = last ? session.recordedExercises.indexOf(last) : (fallbackIndex ?? -1);
  return session.recordedExercises[index] instanceof RecordedWeightedExercise ? index : undefined;
}

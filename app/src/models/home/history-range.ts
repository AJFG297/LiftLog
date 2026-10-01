import { RecordedCardioExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import { sessionVolume } from '@/store/activity/volume';
import { LocalDate } from '@js-joda/core';

/** The Home screen's two views of recent training: the last 7 or the last 30 days, today included. */
export type HistoryRange = 7 | 30;

/** One day of the range and the workouts done on it. */
export interface HistoryDay {
  date: LocalDate;
  /** Latest first. */
  sessions: readonly Session[];
  isToday: boolean;
}

export interface HistorySummary {
  workouts: number;
  /** Kilograms moved, graded the same way as the activity calendar (`sessionVolume`). */
  volumeKg: number;
  /** Across the workouts that have a length (see `minutesOf`). */
  minutes: number;
  averageMinutes: number | undefined;
}

/** A row of the Home history list: a workout, or in the 7-day view a day without one. */
export type HistoryEntry =
  | { kind: 'workout'; date: LocalDate; session: Session }
  | { kind: 'rest'; date: LocalDate; isToday: boolean };

/** What a history card says about one workout. */
export interface WorkoutFacts {
  minutes: number | undefined;
  volumeKg: number;
  /** Logged sets, warm-ups left out. */
  sets: number;
  /** The exercises something was logged in, in workout order. */
  exerciseNames: string[];
}

/** The 30-day view is five weeks of seven, so the five cells before the range stay blank. */
export const THIRTY_DAY_GRID_CELLS = 35;

/**
 * The `count` days ending on `today`, oldest first. `sessionsByDate` is `selectOwnSessionsByDate`, the
 * same grouping the activity calendar draws, keyed by `LocalDate.toString()`: finished workouts where
 * something counted was logged.
 */
export function historyDaysOf(
  sessionsByDate: ReadonlyMap<string, readonly Session[]>,
  today: LocalDate,
  count: number,
): HistoryDay[] {
  return Array.from({ length: count }, (_, index) => {
    const date = today.minusDays(count - 1 - index);
    const sessions = [...(sessionsByDate.get(date.toString()) ?? [])].sort(latestFirst);
    return { date, sessions, isToday: date.isEqual(today) };
  });
}

export function historySummaryOf(days: readonly HistoryDay[]): HistorySummary {
  const sessions = days.flatMap((day) => day.sessions);
  const lengths = sessions.map(minutesOf).filter((minutes) => minutes !== undefined);
  const minutes = lengths.reduce((total, length) => total + length, 0);
  return {
    workouts: sessions.length,
    volumeKg: sessions.reduce((total, session) => total + sessionVolume(session), 0),
    minutes,
    averageMinutes: lengths.length ? Math.round(minutes / lengths.length) : undefined,
  };
}

/** Newest first. Only the 7-day view shows the days without a workout, so a month doesn't fill with them. */
export function historyEntriesOf(days: readonly HistoryDay[], range: HistoryRange): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const day of [...days].reverse()) {
    if (day.sessions.length) {
      entries.push(...day.sessions.map((session) => ({ kind: 'workout' as const, date: day.date, session })));
    } else if (range === 7) {
      entries.push({ kind: 'rest', date: day.date, isToday: day.isToday });
    }
  }
  return entries;
}

/** The 30-day calendar's cells, oldest first: blanks, then the 30 days. Each column is one weekday. */
export function thirtyDayGridOf(days: readonly HistoryDay[]): (HistoryDay | undefined)[] {
  const blanks = Math.max(0, THIRTY_DAY_GRID_CELLS - days.length);
  return [...Array.from({ length: blanks }, () => undefined), ...days.slice(-THIRTY_DAY_GRID_CELLS)];
}

export function workoutFactsOf(session: Session): WorkoutFacts {
  let sets = 0;
  for (const exercise of session.recordedExercises) {
    if (exercise instanceof RecordedWeightedExercise) {
      sets += exercise.potentialSets.filter((slot) => slot.set !== undefined).length;
    } else if (exercise instanceof RecordedCardioExercise) {
      sets += exercise.sets.filter((set) => set.completionDateTime !== undefined).length;
    }
  }
  return {
    minutes: minutesOf(session),
    volumeKg: sessionVolume(session),
    sets,
    exerciseNames: session.recordedExercises.filter((x) => x.isStarted).map((x) => x.blueprint.name),
  };
}

/** A workout with a single logged set starts and ends at once, which isn't a length. */
function minutesOf(session: Session): number | undefined {
  const duration = session.duration;
  return duration && !duration.isZero() ? Math.round(duration.seconds() / 60) : undefined;
}

function latestFirst(a: Session, b: Session): number {
  const aTime = a.endTime?.toEpochSecond() ?? 0;
  const bTime = b.endTime?.toEpochSecond() ?? 0;
  return bTime - aTime;
}

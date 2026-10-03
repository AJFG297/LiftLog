import { LocalDate } from '@js-joda/core';
import { DailyActivity, VolumeScale } from '@/store/activity/activity-types';

/**
 * The user's own training, as the calendar, the week strips and the streak read it: one entry per day
 * trained, and the volume range to grade a day against. Queried from the workout tables
 * (`WorkoutRepository.dailyActivity` / `volumeScale`, see `useOwnActivity`), never from the whole history.
 */
export interface OwnActivity {
  /** Keyed by `LocalDate.toString()`. */
  days: ReadonlyMap<string, DailyActivity>;
  /** Undefined until something was trained, so every day grades 0. */
  scale: VolumeScale | undefined;
}

/** What a screen shows before its query answers, and what someone with no history has. */
export const NO_OWN_ACTIVITY: OwnActivity = { days: new Map(), scale: undefined };

export function ownActivityOf(days: readonly DailyActivity[], scale: VolumeScale | undefined): OwnActivity {
  return { days: new Map(days.map((day) => [day.date.toString(), day])), scale };
}

/** Each day trained, once. */
export function trainingDatesOf(own: OwnActivity): LocalDate[] {
  return [...own.days.values()].map((day) => day.date);
}

export function lastWorkoutDateOf(own: OwnActivity): LocalDate | undefined {
  return trainingDatesOf(own).reduce<LocalDate | undefined>(
    (latest, date) => (!latest || date.isAfter(latest) ? date : latest),
    undefined,
  );
}

import { useWorkoutQuery } from '@/hooks/useWorkoutQuery';
import { useAppSelector } from '@/store';
import { NO_OWN_ACTIVITY, OwnActivity, ownActivityOf, trainingDatesOf } from '@/store/activity/own-activity';
import { calculateStreak, StreakStats } from '@/store/activity/streak';
import { PersonalRecord } from '@/store/stats/personal-records';
import { LocalDate } from '@js-joda/core';

/**
 * The user's own training by day and the volume range to grade it, from the workout tables. Empty until
 * the query answers. One call per screen: hand it down to the calendar, the strip and the streak.
 */
export function useOwnActivity(): OwnActivity {
  const own = useWorkoutQuery(
    async (repository) => ownActivityOf(...(await Promise.all([repository.dailyActivity(), repository.volumeScale()]))),
    [],
  );
  return own ?? NO_OWN_ACTIVITY;
}

/** The streak over `own`, with the user's first day of the week. */
export function useStreakStats(own: OwnActivity, today: LocalDate): StreakStats {
  const firstDayOfWeek = useAppSelector((x) => x.settings.firstDayOfWeek);
  return calculateStreak(trainingDatesOf(own), firstDayOfWeek, today);
}

const NO_RECORDS: ReadonlyMap<string, PersonalRecord[]> = new Map();

/** All-time records per finished workout id, from the workout tables. Empty until the query answers. */
export function usePersonalRecords(): ReadonlyMap<string, PersonalRecord[]> {
  return useWorkoutQuery((repository) => repository.personalRecords(), []) ?? NO_RECORDS;
}

import { DayOfWeek, LocalDate } from '@js-joda/core';
import { weekStart } from '@/store/activity/week-start';
import type { ProgressHistory } from '@/store/stats/progress-history';

/** The Progress tab's sections, in the order they're shown. */
export const PROGRESS_TABS = ['strength', 'training', 'body'] as const;
export type ProgressTab = (typeof PROGRESS_TABS)[number];

/** The range switch under the tabs. One range applies to every tab. */
export const PROGRESS_RANGES = [
  { id: '4w', weeks: 4 },
  { id: '12w', weeks: 12 },
  { id: '1y', weeks: 52 },
] as const;
export type ProgressRange = (typeof PROGRESS_RANGES)[number];
export type ProgressRangeId = ProgressRange['id'];
export const DEFAULT_PROGRESS_RANGE: ProgressRangeId = '12w';

export function progressRange(id: ProgressRangeId): ProgressRange {
  return PROGRESS_RANGES.find((range) => range.id === id) ?? PROGRESS_RANGES[1];
}

/**
 * The tabs to show. Someone who has never logged a bodyweight (or hides bodyweight everywhere) gets no Body
 * tab rather than an empty one.
 */
export function progressTabs(showsBody: boolean): ProgressTab[] {
  return PROGRESS_TABS.filter((tab) => tab !== 'body' || showsBody);
}

/** The tab to open: the one last used while it is still shown, else Strength. */
export function shownTab(wanted: ProgressTab, tabs: readonly ProgressTab[]): ProgressTab {
  return tabs.includes(wanted) ? wanted : 'strength';
}

/** Whether any started workout carries a bodyweight. */
export function hasBodyweight(history: ProgressHistory): boolean {
  return history.workouts.some((workout) => workout.bodyweight !== undefined);
}

/**
 * The weeks a range covers. A range of N weeks is N bars on the board, the last of them this week so far:
 * N - 1 complete weeks and this week. Averages leave this week's partial count out, while the bars and the
 * lifts include it.
 */
export interface ProgressPeriod {
  /** The range's complete weeks, one fewer than its weeks. Averages and their change read this many. */
  completeWeeks: number;
  /** The first day of this week, by the user's first day of the week. */
  thisWeek: LocalDate;
  /** The first day of the range: the start of its oldest week. "Since" this date. */
  start: LocalDate;
  today: LocalDate;
}

export function progressPeriod(today: LocalDate, range: ProgressRange, firstDayOfWeek: DayOfWeek): ProgressPeriod {
  const thisWeek = weekStart(today, firstDayOfWeek);
  const completeWeeks = range.weeks - 1;
  return { completeWeeks, thisWeek, start: thisWeek.minusWeeks(completeWeeks), today };
}

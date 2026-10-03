import { describe, expect, it } from 'vitest';
import { DayOfWeek, LocalDate } from '@js-joda/core';
import { calculateStreak } from '@/store/activity/streak';

const MONDAY = DayOfWeek.MONDAY;

/**
 * `daysPerWeek[i]` days trained in the week starting `weeksAgo - i` weeks before `today`'s week. The input
 * is the dates of started workouts, one per workout (`trainingDatesOf` an `OwnActivity`).
 */
function daysForWeeks(today: LocalDate, daysPerWeek: number[]): LocalDate[] {
  const currentWeekStart = today.minusDays((today.dayOfWeek().value() - MONDAY.value() + 7) % 7);
  const dates: LocalDate[] = [];

  daysPerWeek.forEach((days, index) => {
    const weekStart = currentWeekStart.minusWeeks(daysPerWeek.length - 1 - index);
    for (let day = 0; day < days; day++) {
      dates.push(weekStart.plusDays(day));
    }
  });

  return dates;
}

// A Wednesday, so the current week is genuinely mid-flight.
const TODAY = LocalDate.of(2026, 7, 8);

describe('calculateStreak', () => {
  it('reports no streak for someone with no history', () => {
    const stats = calculateStreak([], MONDAY, TODAY);

    expect(stats.state).toBe('none');
    expect(stats.weeks).toBe(0);
  });

  it('targets 1 for a new user with too little history to take a median of', () => {
    const stats = calculateStreak(daysForWeeks(TODAY, [4, 0]), MONDAY, TODAY);

    expect(stats.target).toBe(1);
  });

  it('takes the lower median, so a 3/4/4/3 user gets a bar of 3 rather than 4', () => {
    const stats = calculateStreak(daysForWeeks(TODAY, [3, 4, 4, 3, 0]), MONDAY, TODAY);

    expect(stats.target).toBe(3);
  });

  it('counts distinct days, so a two-a-day cannot inflate the bar', () => {
    const currentWeekStart = TODAY.minusDays(2);
    const twoOnTheSameDay = [currentWeekStart.minusWeeks(1), currentWeekStart.minusWeeks(1)];

    const stats = calculateStreak(twoOnTheSameDay, MONDAY, TODAY);

    expect(stats.target).toBe(1);
  });

  it('counts the run of completed weeks that met the target', () => {
    // Target is the lower median of [3,3,3,3] = 3; all four completed weeks met it.
    const stats = calculateStreak(daysForWeeks(TODAY, [3, 3, 3, 3, 0]), MONDAY, TODAY);

    expect(stats.target).toBe(3);
    expect(stats.weeks).toBe(4);
  });

  it('breaks the streak on a deload below target', () => {
    // Weeks: 3,3,1,3 -> the 1 breaks it, so only the single most recent week counts.
    const stats = calculateStreak(daysForWeeks(TODAY, [3, 3, 1, 3, 0]), MONDAY, TODAY);

    expect(stats.target).toBe(3);
    expect(stats.weeks).toBe(1);
  });

  it('never lets the current week break a streak', () => {
    // Four completed weeks at 3, and nothing done yet this week.
    const stats = calculateStreak(daysForWeeks(TODAY, [3, 3, 3, 3, 0]), MONDAY, TODAY);

    expect(stats.state).toBe('in_progress');
    expect(stats.weeks).toBe(4);
    expect(stats.remainingThisWeek).toBe(3);
  });

  it('secures the streak once this week meets the target', () => {
    const stats = calculateStreak(daysForWeeks(TODAY, [3, 3, 3, 3, 3]), MONDAY, TODAY);

    expect(stats.state).toBe('secured');
    expect(stats.remainingThisWeek).toBe(0);
  });

  it('reports no streak rather than a zero-week one when the run has been broken', () => {
    // Weeks 5,5,0 -> the most recent completed week missed the target of 5, so there is no run to show.
    const stats = calculateStreak(daysForWeeks(TODAY, [5, 5, 0, 0]), MONDAY, TODAY);

    expect(stats.weeks).toBe(0);
    expect(stats.state).toBe('none');
  });

  it('reports the honest rolling count of distinct training days in the last 7', () => {
    const dates = [TODAY, TODAY.minusDays(2), TODAY.minusDays(6), TODAY.minusDays(9)];

    const stats = calculateStreak(dates, MONDAY, TODAY);

    expect(stats.workoutsLast7Days).toBe(3);
  });

  it('honours a non-Monday first day of week', () => {
    const stats = calculateStreak(daysForWeeks(TODAY, [3, 3, 3]), DayOfWeek.SUNDAY, TODAY);

    expect(stats.target).toBeGreaterThanOrEqual(1);
    expect(stats.target).toBeLessThanOrEqual(7);
  });
});

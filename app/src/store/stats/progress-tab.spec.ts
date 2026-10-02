import { describe, expect, it } from 'vitest';
import { DayOfWeek, LocalDate } from '@js-joda/core';
import { day, historyOf, today, workout } from '@/store/stats/__test__/progress-fixtures';
import { hasBodyweight, progressPeriod, progressRange, progressTabs, shownTab } from '@/store/stats/progress-tab';

describe('progressTabs', () => {
  it('shows Body only to someone with a bodyweight', () => {
    expect(progressTabs(true)).toEqual(['strength', 'training', 'body']);
    expect(progressTabs(false)).toEqual(['strength', 'training']);
  });
});

describe('shownTab', () => {
  it('reopens on the tab last used', () => {
    expect(shownTab('training', progressTabs(true))).toBe('training');
    expect(shownTab('body', progressTabs(true))).toBe('body');
  });

  it('falls back to Strength when the last tab was Body and Body is hidden', () => {
    expect(shownTab('body', progressTabs(false))).toBe('strength');
  });
});

describe('hasBodyweight', () => {
  it('is true once any workout carries a bodyweight', () => {
    expect(hasBodyweight(historyOf({ workouts: [workout(day(9, 1)), workout(day(9, 8), 80)] }))).toBe(true);
    expect(hasBodyweight(historyOf({ workouts: [workout(day(9, 1))] }))).toBe(false);
  });
});

describe('progressPeriod', () => {
  it('covers the range in bars ending with this week', () => {
    // 4 bars: Sep 7, 14 and 21, then this week.
    expect(progressPeriod(today, progressRange('4w'), DayOfWeek.MONDAY)).toEqual({
      completeWeeks: 3,
      thisWeek: day(9, 28),
      start: day(9, 7),
      today,
    });
    // 52 bars, from the Sunday 51 weeks before this one.
    expect(progressPeriod(today, progressRange('1y'), DayOfWeek.SUNDAY)).toMatchObject({
      completeWeeks: 51,
      start: LocalDate.of(2025, 10, 5),
    });
  });
});

import { describe, expect, it } from 'vitest';
import { LocalDate, LocalTime, YearMonth } from '@js-joda/core';
import {
  historyDaysOf,
  historyEntriesOf,
  historySummaryOf,
  thirtyDayGridOf,
  workoutFactsOf,
} from '@/models/home/history-range';
import { ownActivityOf, stateWith, workout } from '@/models/home/__test__/home-sessions';
import { selectActivityMonth } from '@/store/activity';

const today = LocalDate.of(2025, 4, 10);

const legs = workout('Legs', today.minusDays(1), { kg: 100, minutes: 45 });
const pull = workout('Pull', today.minusDays(3), { kg: 80, minutes: 40 });
const push = workout('Push', today.minusDays(4), { kg: 60, minutes: 50 });
const olderPull = workout('Pull', today.minusDays(8), { kg: 70, minutes: 30 });
const olderLegs = workout('Legs', today.minusDays(20), { kg: 90, minutes: 60 });
const beforeTheMonth = workout('Push', today.minusDays(35), { kg: 50 });
const neverStarted = workout('Push', today.minusDays(2), { logged: false });

const sessions = [legs, pull, push, olderPull, olderLegs, beforeTheMonth, neverStarted];

describe('the last 7 days', () => {
  const days = historyDaysOf(sessions, today, 7);

  it('runs from six days ago to today', () => {
    expect(days.map((day) => day.date.toString())).toEqual([
      '2025-04-04',
      '2025-04-05',
      '2025-04-06',
      '2025-04-07',
      '2025-04-08',
      '2025-04-09',
      '2025-04-10',
    ]);
    expect(days.map((day) => day.isToday)).toEqual([false, false, false, false, false, false, true]);
  });

  it('adds up the workouts, volume and time in the range', () => {
    // 3 × 10 reps at 100, 80 and 60 kg; 45, 40 and 50 minutes.
    expect(historySummaryOf(days)).toEqual({ workouts: 3, volumeKg: 7200, minutes: 135, averageMinutes: 45 });
  });

  it('lists workouts newest first, with a thin row for each day without one', () => {
    expect(
      historyEntriesOf(days, 7).map((entry) =>
        entry.kind === 'workout'
          ? `${entry.date.toString()} ${entry.session.blueprint.name}`
          : `${entry.date.toString()} ${entry.isToday ? 'today' : 'rest'}`,
      ),
    ).toEqual([
      '2025-04-10 today',
      '2025-04-09 Legs',
      '2025-04-08 rest',
      '2025-04-07 Pull',
      '2025-04-06 Push',
      '2025-04-05 rest',
      '2025-04-04 rest',
    ]);
  });
});

describe('the last 30 days', () => {
  const days = historyDaysOf(sessions, today, 30);

  it('adds up everything since 30 days ago and nothing before', () => {
    // 3000 + 2400 + 1800 + 2100 + 2700 kg; 45 + 40 + 50 + 30 + 60 minutes.
    expect(historySummaryOf(days)).toEqual({ workouts: 5, volumeKg: 12000, minutes: 225, averageMinutes: 45 });
  });

  it('lists only the workouts', () => {
    expect(historyEntriesOf(days, 30).map((entry) => entry.kind === 'workout' && entry.session.blueprint.name)).toEqual(
      ['Legs', 'Pull', 'Push', 'Pull', 'Legs'],
    );
  });

  it('draws five weeks of seven: five blanks, then the 30 days ending today', () => {
    const grid = thirtyDayGridOf(days);

    expect(grid).toHaveLength(35);
    expect(grid.slice(0, 5)).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(grid[5]?.date.toString()).toBe('2025-03-12');
    expect(grid[34]?.date.toString()).toBe('2025-04-10');
    // Every column is one weekday, so the last row is the 7-day strip.
    expect(grid.slice(28).map((cell) => cell?.date.toString())).toEqual(
      historyDaysOf(sessions, today, 7).map((day) => day.date.toString()),
    );
  });

  it('marks the same days as the old month calendar, with the same number of workouts on each', () => {
    const own = ownActivityOf(sessions);
    const calendarCells = [YearMonth.of(2025, 3), YearMonth.of(2025, 4)]
      .flatMap((yearMonth) => selectActivityMonth(stateWith(), { own, yearMonth, today }).rows)
      .flatMap((row) => row.cells)
      .filter((cell) => !cell.isOutsideFocus);
    const calendarCount = new Map(calendarCells.map((cell) => [cell.date.toString(), cell.sessionCount]));

    expect(days.map((day) => [day.date.toString(), day.sessions.length])).toEqual(
      days.map((day) => [day.date.toString(), calendarCount.get(day.date.toString())]),
    );
    expect(days.filter((day) => day.sessions.length).map((day) => day.date.toString())).toEqual([
      '2025-03-21',
      '2025-04-02',
      '2025-04-06',
      '2025-04-07',
      '2025-04-09',
    ]);
  });
});

describe('two workouts on one day', () => {
  it('keeps both, latest first', () => {
    const morning = workout('Upper', today, { kg: 50, at: LocalTime.of(7, 0) });
    const evening = workout('Lower', today, { kg: 50, at: LocalTime.of(19, 0) });
    const days = historyDaysOf([morning, evening], today, 7);

    expect(days.at(-1)?.sessions.map((session) => session.blueprint.name)).toEqual(['Lower', 'Upper']);
    expect(historySummaryOf(days).workouts).toBe(2);
  });
});

describe('workoutFactsOf', () => {
  it('reads the length, volume, logged sets and exercises of a workout', () => {
    expect(workoutFactsOf(legs)).toEqual({ minutes: 45, volumeKg: 3000, sets: 3, exerciseNames: ['Squat'] });
  });

  it('has no length when only one set was logged', () => {
    expect(workoutFactsOf(workout('Legs', today, { sets: 1 })).minutes).toBeUndefined();
  });
});

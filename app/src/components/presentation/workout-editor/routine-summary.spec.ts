import { describe, expect, it } from 'vitest';
import {
  lastDoneByRoutineName,
  routinesDoneThisRoundOf,
  workoutsDoneOf,
} from '@/components/presentation/workout-editor/routine-summary';
import { Session } from '@/models/session-models';
import { LocalDate } from '@js-joda/core';

function workout(name: string, options: { logged?: boolean; freeform?: boolean; day?: number } = {}): Session {
  return {
    blueprint: { name },
    isFreeform: options.freeform ?? false,
    hasLoggedAnySet: options.logged ?? true,
    date: LocalDate.of(2026, 9, options.day ?? 1),
  } as unknown as Session;
}

describe('workoutsDoneOf', () => {
  it("counts the program's logged workouts by routine name", () => {
    const sessions = [
      workout('Push'),
      workout('Pull'),
      workout('Push'),
      workout('Legs', { logged: false }),
      workout('Push', { freeform: true }),
      workout('Arms'),
    ];

    expect(workoutsDoneOf(sessions, ['Push', 'Pull', 'Legs'])).toBe(3);
    expect(workoutsDoneOf([], ['Push'])).toBe(0);
  });

  it('agrees with what counts as done for the last-done date', () => {
    const sessions = [workout('Push', { day: 3 }), workout('Pull', { logged: false, day: 4 })];

    expect(workoutsDoneOf(sessions, ['Push', 'Pull'])).toBe(lastDoneByRoutineName(sessions).size);
  });
});

describe('routinesDoneThisRoundOf', () => {
  const program = ['Push', 'Pull', 'Legs', 'Arms'];

  it('is nothing before any routine is done', () => {
    expect(routinesDoneThisRoundOf([], program)).toBe(0);
    expect(routinesDoneThisRoundOf([workout('Push', { logged: false }), workout('Other')], program)).toBe(0);
  });

  it('counts one routine done out of order as one', () => {
    expect(routinesDoneThisRoundOf([workout('Legs', { day: 2 })], program)).toBe(1);
  });

  it('counts each routine once however often it was done', () => {
    const sessions = [workout('Legs', { day: 2 }), workout('Legs', { day: 3 }), workout('Push', { day: 4 })];

    expect(routinesDoneThisRoundOf(sessions, program)).toBe(2);
  });

  it('wraps to a new round once every routine is done', () => {
    const round = [
      workout('Arms', { day: 5 }),
      workout('Push', { day: 2 }),
      workout('Legs', { day: 4 }),
      workout('Pull', { day: 3 }),
    ];

    expect(routinesDoneThisRoundOf(round, program)).toBe(0);
    expect(routinesDoneThisRoundOf([...round, workout('Pull', { day: 6 })], program)).toBe(1);
  });
});

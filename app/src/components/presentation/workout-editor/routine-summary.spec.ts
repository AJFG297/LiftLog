import { describe, expect, it } from 'vitest';
import { lastDoneByRoutineName, workoutsDoneOf } from '@/components/presentation/workout-editor/routine-summary';
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

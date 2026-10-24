import { LocalDate } from '@js-joda/core';
import { describe, expect, it } from 'vitest';
import { findRoutineIndex, routineHistoryOf, routineKey } from '@/models/routine-identity';

const day = (n: number) => LocalDate.of(2026, 4, n);

describe('routineHistoryOf', () => {
  it('keeps last performed when the routine is renamed and the workout carries its id', () => {
    const history = routineHistoryOf(
      [{ routineId: 'push', name: 'Push', date: day(5) }],
      [{ id: 'push', name: 'Press' }],
      new Set(['push']),
    );

    expect(history.lastDone.get(routineKey({ id: 'push', name: 'Press' }))?.toString()).toBe('2026-04-05');
    expect(history.workoutsDone).toBe(1);
    expect(history.routinesDoneThisRound).toBe(0);
  });

  it('still matches a workout logged before routines had ids, by name', () => {
    const history = routineHistoryOf(
      [{ routineId: null, name: 'Push', date: day(2) }],
      [{ id: 'push', name: 'Push' }],
      new Set(['push']),
    );

    expect(history.lastDone.get('push')?.toString()).toBe('2026-04-02');
  });

  it('does not give a new routine the history of a different routine that still has that name', () => {
    const history = routineHistoryOf(
      [{ routineId: 'original', name: 'Push', date: day(2) }],
      [
        { id: 'original', name: 'Press' },
        { id: 'other', name: 'Push' },
      ],
      new Set(['original', 'other']),
    );

    expect(history.lastDone.get('original')?.toString()).toBe('2026-04-02');
    expect(history.lastDone.get('other')).toBeUndefined();
  });

  it('gives a recreated routine the history of one that was deleted', () => {
    const history = routineHistoryOf(
      [{ routineId: 'gone', name: 'Push', date: day(8) }],
      [{ id: 'new', name: 'Push' }],
      new Set(['new']),
    );

    expect(history.lastDone.get('new')?.toString()).toBe('2026-04-08');
  });

  it('counts a renamed routine toward the round under its current name', () => {
    const history = routineHistoryOf(
      [
        { routineId: 'push', name: 'Push', date: day(1) },
        { routineId: 'pull', name: 'Pull', date: day(2) },
      ],
      [
        { id: 'push', name: 'Press' },
        { id: 'pull', name: 'Pull' },
      ],
      new Set(['push', 'pull']),
    );

    expect(history.routinesDoneThisRound).toBe(0);
    expect(history.workoutsDone).toBe(2);
  });
});

describe('findRoutineIndex', () => {
  const routines = [
    { id: 'push', name: 'Press' },
    { id: 'pull', name: 'Pull' },
  ];

  it('finds a renamed routine by id', () => {
    expect(findRoutineIndex(routines, { id: 'push', name: 'Push' })).toBe(0);
  });

  it('falls back to the name when the workout has no id', () => {
    expect(findRoutineIndex(routines, { name: 'Pull' })).toBe(1);
  });
});

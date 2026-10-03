import { describe, expect, it } from 'vitest';
import { routinesDoneThisRoundOf } from '@/models/routine-rounds';

describe('routinesDoneThisRoundOf', () => {
  const program = ['Push', 'Pull', 'Legs', 'Arms'];

  it('is nothing before any routine is done', () => {
    expect(routinesDoneThisRoundOf([], program)).toBe(0);
    expect(routinesDoneThisRoundOf(['Other'], program)).toBe(0);
  });

  it('counts one routine done out of order as one', () => {
    expect(routinesDoneThisRoundOf(['Legs'], program)).toBe(1);
  });

  it('counts each routine once however often it was done', () => {
    expect(routinesDoneThisRoundOf(['Legs', 'Legs', 'Push'], program)).toBe(2);
  });

  it('wraps to a new round once every routine is done', () => {
    const round = ['Push', 'Pull', 'Other', 'Legs', 'Arms'];

    expect(routinesDoneThisRoundOf(round, program)).toBe(0);
    expect(routinesDoneThisRoundOf([...round, 'Pull'], program)).toBe(1);
    expect(routinesDoneThisRoundOf([...round, 'Pull', 'Pull', 'Push'], program)).toBe(2);
  });
});

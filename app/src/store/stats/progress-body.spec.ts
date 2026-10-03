import { describe, expect, it } from 'vitest';
import { day, historyOf, workout } from '@/store/stats/__test__/progress-fixtures';
import { bodyView, weighInsOf } from '@/store/stats/progress-body';

// A Monday, where a range starts.
const since = day(8, 31);

const history = historyOf({
  workouts: [
    workout(day(7, 1), 80),
    workout(day(8, 20), 79),
    // Carried over from the workout before: not a new weigh-in.
    workout(day(9, 1), 79),
    workout(day(9, 8), 78.5),
    workout(day(9, 10)),
    workout(day(9, 15), 78.5),
    workout(day(9, 22), 79.2),
    workout(day(9, 29), 78.8),
  ],
});

describe('weighInsOf', () => {
  it('takes a weigh-in from each workout whose bodyweight changed, with the change from the one before', () => {
    expect(weighInsOf(history, 'kilograms').map((x) => [x.date.toString(), x.weight, x.change])).toEqual([
      ['2026-07-01', 80, undefined],
      ['2026-08-20', 79, -1],
      ['2026-09-08', 78.5, -0.5],
      ['2026-09-22', 79.2, 0.7],
      ['2026-09-29', 78.8, -0.4],
    ]);
  });
});

describe('bodyView', () => {
  const view = bodyView(history, since, 'kilograms')!;

  it('gives the current bodyweight and when it was last weighed', () => {
    expect(view.current).toBe(78.8);
    expect(view.lastWeighed).toEqual(day(9, 29));
  });

  it('measures the change from the bodyweight carried into the range', () => {
    expect(view.change).toBe(-0.2);
    expect(view.chart).toEqual([
      { date: since, weight: 79, carried: true },
      { date: day(9, 8), weight: 78.5, carried: false },
      { date: day(9, 22), weight: 79.2, carried: false },
      { date: day(9, 29), weight: 78.8, carried: false },
    ]);
  });

  it('gives the lowest, average and highest over the range', () => {
    expect(view.lowest).toBe(78.5);
    expect(view.average).toBeCloseTo(78.875, 6);
    expect(view.highest).toBe(79.2);
  });

  it('lists the last 5 weigh-ins, latest first, whatever the range', () => {
    expect(view.recent.map((x) => x.date.toString())).toEqual([
      '2026-09-29',
      '2026-09-22',
      '2026-09-08',
      '2026-08-20',
      '2026-07-01',
    ]);
  });

  it('starts from the first weigh-in in the range when there is none before it', () => {
    const late = bodyView(historyOf({ workouts: history.workouts.slice(3) }), since, 'kilograms')!;

    expect(late.chart[0]).toEqual({ date: day(9, 8), weight: 78.5, carried: false });
    expect(late.change).toBe(0.3);
  });

  it('has no change with a single weigh-in ever', () => {
    expect(bodyView(historyOf({ workouts: [workout(day(9, 8), 78.5)] }), since, 'kilograms')?.change).toBeUndefined();
  });

  it('is undefined for someone who has never logged a bodyweight', () => {
    expect(bodyView(historyOf({ workouts: [workout(day(9, 8))] }), since, 'kilograms')).toBeUndefined();
  });

  it('converts to the unit the user weighs in', () => {
    expect(bodyView(history, since, 'pounds')!.current).toBeCloseTo(173.72, 2);
  });
});

import { describe, it, expect } from 'vitest';
import { PlannedWarmupSet } from '@/models/blueprint-models';
import { Weight } from '@/models/weight';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import { makeRecordedExercise, makeWeightedBlueprint, tick } from '@/models/session-models/__test__/helpers';

const percent = (value: number, reps = 5): PlannedWarmupSet => ({ load: { type: 'percent', percent: value }, reps });
const absolute = (kg: number, reps = 5): PlannedWarmupSet => ({
  load: { type: 'absolute', weight: new Weight(kg, 'kilograms') },
  reps,
});
const repsOnly = (reps: number): PlannedWarmupSet => ({ load: undefined, reps });

function exercise(warmupSets: PlannedWarmupSet[], opts: { sets?: number; kg?: number } = {}) {
  const blueprint = makeWeightedBlueprint({ sets: opts.sets ?? 2, warmupSets });
  return makeRecordedExercise(
    blueprint,
    Array.from({ length: opts.sets ?? 2 }, () => undefined),
    new Weight(opts.kg ?? 100, 'kilograms'),
  ).withWarmupsFromPlan('kilograms');
}

/** A past performance with every warm-up logged at its target. */
function logged(ex: RecordedWeightedExercise) {
  return ex.warmupSets.reduce((acc, _, i) => acc.withCycledWarmupRepCount(i, tick()), ex);
}

describe('previous performance', () => {
  it('is the newest candidate with the same progression key', () => {
    const today = exercise([percent(50)]);
    const otherScheme = logged(exercise([percent(50)], { sets: 5 }));
    const older = logged(exercise([percent(50)], { kg: 60 }));
    const newer = logged(exercise([percent(50)], { kg: 80 }));

    expect(today.previousPerformanceIn([otherScheme, newer, older])).toBe(newer);
  });

  it('still matches once the plan gains or loses warm-ups', () => {
    const today = exercise([percent(50), percent(70)]);
    const before = logged(exercise([]));
    expect(today.previousPerformanceIn([before])).toBe(before);
  });

  it('is undefined with nothing comparable', () => {
    expect(exercise([]).previousPerformanceIn([logged(exercise([], { sets: 4 }))])).toBeUndefined();
  });
});

describe('previous warm-up hint', () => {
  it("shows the same-position warm-up's reps and weight from last time", () => {
    const today = exercise([percent(50), percent(70)], { kg: 110 });
    const last = logged(exercise([percent(50), percent(70)])).withWarmupRepCount(1, 2, tick());

    const hints = today.warmupSets.map((_, i) => today.previousWarmupHint(i, last));
    expect(hints.map((h) => h?.reps)).toEqual([5, 2]);
    expect(hints.map((h) => h?.weight?.value.toNumber())).toEqual([50, 70]);
  });

  it('is absent for a warm-up last time never had, or never logged', () => {
    const today = exercise([percent(50), percent(70)]);
    const last = exercise([percent(50)]);
    expect(today.previousWarmupHint(0, last)).toBeUndefined();
    expect(today.previousWarmupHint(1, logged(last))).toBeUndefined();
    expect(today.previousWarmupHint(0, undefined)).toBeUndefined();
  });

  it('never reads a working set', () => {
    const today = exercise([percent(50)]);
    const last = exercise([]).withCycledRepCount(0, tick());
    expect(today.previousWarmupHint(0, last)).toBeUndefined();
  });

  it('leaves the weight out when the movement has no load to show', () => {
    const none = makeWeightedBlueprint({ resistance: 'none', warmupSets: [repsOnly(8)] });
    const today = RecordedWeightedExercise.empty(none, 'kilograms');
    const hint = today.previousWarmupHint(0, logged(RecordedWeightedExercise.empty(none, 'kilograms')));
    expect(hint).toEqual({ reps: 8, weight: undefined });
  });

  it('shows added weight on bodyweight, but not plain bodyweight', () => {
    const bodyweight = makeWeightedBlueprint({ resistance: 'bodyweight', warmupSets: [absolute(0), absolute(10)] });
    const today = RecordedWeightedExercise.empty(bodyweight, 'kilograms');
    const last = logged(RecordedWeightedExercise.empty(bodyweight, 'kilograms'));
    expect(today.previousWarmupHint(0, last)?.weight).toBeUndefined();
    expect(today.previousWarmupHint(1, last)?.weight?.value.toNumber()).toBe(10);
  });
});

describe('warm-up percent label', () => {
  it('is the planned percentage for a percent warm-up only', () => {
    const ex = exercise([percent(50), absolute(20), percent(70)]);
    expect(ex.warmupSets.map((_, i) => ex.warmupPercentAt(i))).toEqual([50, undefined, 70]);
  });

  it('is absent past the end of the plan', () => {
    expect(exercise([percent(50)]).warmupPercentAt(3)).toBeUndefined();
  });
});

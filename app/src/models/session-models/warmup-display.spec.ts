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
  it('is the newest candidate of the same exercise, whatever its set count', () => {
    const today = exercise([percent(50)]);
    const otherScheme = logged(exercise([percent(50)], { sets: 5 }));
    const older = logged(exercise([percent(50)], { kg: 60 }));

    expect(today.previousPerformanceIn([otherScheme, older])).toBe(otherScheme);
  });

  it('still matches once the plan gains or loses warm-ups', () => {
    const today = exercise([percent(50), percent(70)]);
    const before = logged(exercise([]));
    expect(today.previousPerformanceIn([before])).toBe(before);
  });

  it('is undefined with nothing comparable', () => {
    const otherExercise = logged(exercise([])).with({ blueprint: makeWeightedBlueprint({ name: 'Bench' }) });
    expect(exercise([]).previousPerformanceIn([otherExercise])).toBeUndefined();
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

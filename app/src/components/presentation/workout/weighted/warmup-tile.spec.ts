import { describe, it, expect } from 'vitest';
import { PlannedWarmupSet } from '@/models/blueprint-models';
import { Weight } from '@/models/weight';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import { makeRecordedExercise, makeWeightedBlueprint, tick } from '@/models/session-models/__test__/helpers';
import { warmupTileFor } from '@/components/presentation/workout/weighted/warmup-tile';

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

const hintFor = (today: RecordedWeightedExercise, index: number, previous: RecordedWeightedExercise | undefined) =>
  warmupTileFor(today, index, previous).previous;

describe('warm-up tile hint', () => {
  it("shows the same-position warm-up's reps and weight from last time", () => {
    const today = exercise([percent(50), percent(70)], { kg: 110 });
    const last = logged(exercise([percent(50), percent(70)])).withWarmupRepCount(1, 2, tick());

    const hints = today.warmupSets.map((_, i) => hintFor(today, i, last));
    expect(hints.map((h) => h?.reps)).toEqual([5, 2]);
    expect(hints.map((h) => h?.weight?.value.toNumber())).toEqual([50, 70]);
  });

  it('is absent for a warm-up last time never had, or never logged', () => {
    const today = exercise([percent(50), percent(70)]);
    const last = exercise([percent(50)]);
    expect(hintFor(today, 0, last)).toBeUndefined();
    expect(hintFor(today, 1, logged(last))).toBeUndefined();
    expect(hintFor(today, 0, undefined)).toBeUndefined();
  });

  it('never reads a working set', () => {
    const today = exercise([percent(50)]);
    const last = exercise([]).withCycledRepCount(0, tick());
    expect(hintFor(today, 0, last)).toBeUndefined();
  });

  it('leaves the weight out when the movement has no load to show', () => {
    const none = makeWeightedBlueprint({ resistance: 'none', warmupSets: [repsOnly(8)] });
    const today = RecordedWeightedExercise.empty(none, 'kilograms');
    const hint = hintFor(today, 0, logged(RecordedWeightedExercise.empty(none, 'kilograms')));
    expect(hint).toEqual({ reps: 8, weight: undefined });
  });

  it('shows added weight on bodyweight, but not plain bodyweight', () => {
    const bodyweight = makeWeightedBlueprint({ resistance: 'bodyweight', warmupSets: [absolute(0), absolute(10)] });
    const today = RecordedWeightedExercise.empty(bodyweight, 'kilograms');
    const last = logged(RecordedWeightedExercise.empty(bodyweight, 'kilograms'));
    expect(hintFor(today, 0, last)?.weight).toBeUndefined();
    expect(hintFor(today, 1, last)?.weight?.value.toNumber()).toBe(10);
  });
});

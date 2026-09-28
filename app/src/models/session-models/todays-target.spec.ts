import { describe, expect, it } from 'vitest';
import { Weight } from '@/models/weight';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import { todaysTarget } from '@/models/session-models/todays-target';
import { emptyPotentialSet, makeRecordedExercise, makeWeightedBlueprint } from './__test__/helpers';

const bench = makeWeightedBlueprint({ name: 'Bench', sets: 3, repsConfig: { type: 'fixed', reps: 5 } });

function today(weights: number[], blueprint = bench, target = { min: 5, max: 5 }) {
  return new RecordedWeightedExercise(
    blueprint,
    weights.map((weight) => emptyPotentialSet(weight, target)),
    undefined,
  );
}

function lastTime(reps: (number | undefined)[], weight = 85, blueprint = bench) {
  return makeRecordedExercise(blueprint, reps, new Weight(weight, 'kilograms'));
}

describe('todaysTarget', () => {
  it('explains a weight increase after a session that hit every target', () => {
    const target = todaysTarget(today([87.5, 87.5, 87.5]), lastTime([5, 5, 5]));

    expect(target?.weight).toEqual(new Weight(87.5, 'kilograms'));
    expect(target?.reps).toEqual({ min: 5, max: 5 });
    expect(target?.reason).toEqual({
      kind: 'weightUp',
      by: new Weight(2.5, 'kilograms'),
      lastTime: { sets: 3, reps: 5 },
    });
  });

  it('names the set that fell short when the weight stays', () => {
    const target = todaysTarget(today([85, 85, 85]), lastTime([5, 5, 4]));

    expect(target?.reason).toEqual({ kind: 'repeatAfterMiss', setLabel: '3', reps: 4, target: 5 });
  });

  it('says a set was skipped when it was never logged', () => {
    const target = todaysTarget(today([85, 85, 85]), lastTime([5, undefined, 5]));

    expect(target?.reason).toEqual({ kind: 'repeatAfterMiss', setLabel: '2', reps: undefined, target: 5 });
  });

  it('explains a reps increase from a reps rule', () => {
    const blueprint = makeWeightedBlueprint({ name: 'Dips', sets: 2, repsConfig: { type: 'fixed', reps: 8 } });
    const exercise = today([0, 0], blueprint, { min: 9, max: 9 });

    const target = todaysTarget(exercise, lastTime([8, 8], 0, blueprint));

    expect(target?.reason).toEqual({ kind: 'repsUp', by: 1, lastTime: { sets: 2, reps: 8 } });
  });

  it('shows a lighter weight as a drop', () => {
    const target = todaysTarget(today([80, 80, 80]), lastTime([5, 5, 5]));

    expect(target?.reason).toEqual({ kind: 'weightDown', by: new Weight(5, 'kilograms') });
  });

  it('says the numbers repeat when a success moved nothing', () => {
    const target = todaysTarget(today([85, 85, 85]), lastTime([5, 5, 5]));

    expect(target?.reason).toEqual({ kind: 'repeatAfterSuccess', lastTime: { sets: 3, reps: 5 } });
  });

  it('leaves out the rep summary when last time was uneven', () => {
    const target = todaysTarget(today([87.5, 87.5, 87.5]), lastTime([6, 5, 5]));

    expect(target?.reason).toEqual({ kind: 'weightUp', by: new Weight(2.5, 'kilograms'), lastTime: undefined });
  });

  it('uses the heaviest set as the target', () => {
    const target = todaysTarget(today([60, 90, 80]), undefined);

    expect(target).toEqual({
      weight: new Weight(90, 'kilograms'),
      reps: { min: 5, max: 5 },
      reason: { kind: 'firstTime' },
    });
  });

  it('has no weight for a movement that carries no load', () => {
    const blueprint = makeWeightedBlueprint({ name: 'Plank', sets: 1, resistance: 'none' });

    expect(todaysTarget(today([0], blueprint), undefined)?.weight).toBeUndefined();
  });

  it('shows only reps for an exercise that has no weight on it yet', () => {
    expect(todaysTarget(today([0, 0, 0]), undefined)?.weight).toBeUndefined();
  });

  it('keeps a bodyweight movement with nothing added', () => {
    const blueprint = makeWeightedBlueprint({ name: 'Pull-up', sets: 1, resistance: 'bodyweight' });

    expect(todaysTarget(today([0], blueprint), undefined)?.weight).toEqual(new Weight(0, 'kilograms'));
  });

  it('has nothing to show for an exercise with no sets', () => {
    expect(todaysTarget(today([]), undefined)).toBeUndefined();
  });
});

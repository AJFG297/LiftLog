import { describe, expect, it } from 'vitest';
import { Weight } from '@/models/weight';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import {
  carriedFrom,
  plannedExerciseFor,
  plannedLineageFor,
  todaysTarget,
} from '@/models/session-models/todays-target';
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

  it('says it is new, not a first time, when only another set scheme was done before', () => {
    expect(todaysTarget(today([60, 60, 60]), undefined, true)?.reason).toEqual({ kind: 'newScheme' });
  });

  it('measures today’s top set against last time’s best set, whatever the set count', () => {
    const fourSets = bench.with({ sets: 4 });

    expect(todaysTarget(today([85, 85, 85, 90], fourSets), lastTime([5, 5, 5]))?.reason).toEqual({
      kind: 'weightUp',
      by: new Weight(5, 'kilograms'),
      lastTime: { sets: 3, reps: 5 },
    });
  });

  it('measures against the heaviest set last time, wherever it was', () => {
    const pyramid = lastTime([5, 5, 5]).with({
      potentialSets: lastTime([5, 5, 5]).potentialSets.map((s, i) =>
        s.with({ weight: new Weight([80, 90, 85][i]!, 'kilograms') }),
      ),
    });

    expect(todaysTarget(today([82.5, 92.5, 87.5]), pyramid)?.reason).toEqual({
      kind: 'weightUp',
      by: new Weight(2.5, 'kilograms'),
      lastTime: { sets: 3, reps: 5 },
    });
  });

  it('says it is new when the performance carried from has only drop sets to compare with', () => {
    const drops = lastTime([5, 5, 5]).withAllSets((s) => s.with({ kind: 'drop' }));

    expect(todaysTarget(today([85, 85, 85]), drops)?.reason).toEqual({ kind: 'newScheme' });
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

describe('carriedFrom', () => {
  const fourSets = bench.with({ sets: 4 });
  const squat = makeWeightedBlueprint({ name: 'Squat', sets: 3 });
  const key = bench.progressionKey();
  const second = `${key}#2` as typeof key;

  it('finds last time after a set is added mid-workout', () => {
    const previous = lastTime([5, 5, 5]);
    const withAddedSet = today([87.5, 87.5, 87.5, 87.5], fourSets);

    expect(carriedFrom(withAddedSet, [withAddedSet], [bench], { [key]: previous })).toBe(previous);
    expect(withAddedSet.previousPerformanceIn([previous])).toBe(previous);
  });

  it('reads an exercise swapped in on its own key, as the swap opened it', () => {
    const benchLastTime = lastTime([5, 5, 5]);
    const squatLastTime = lastTime([5, 5, 5], 100, squat);
    const swapped = today([100, 100, 100], squat);
    const previous = { [key]: benchLastTime, [squat.progressionKey()]: squatLastTime };

    expect(carriedFrom(swapped, [swapped], [bench], previous)).toBe(squatLastTime);
  });

  it('reads the place of an exercise added without a routine exercise', () => {
    const first = lastTime([5, 5, 5]);
    const newerSecond = lastTime([8, 8, 8]);
    const added = today([85, 85, 85]);
    const addedAgain = today([60, 60, 60]);
    const squatToday = today([100, 100, 100], squat);
    const session = [added, squatToday, addedAgain];

    expect(carriedFrom(added, session, [], { [key]: first, [second]: newerSecond })).toBe(first);
    expect(carriedFrom(addedAgain, session, [], { [key]: first, [second]: newerSecond })).toBe(newerSecond);
    expect(carriedFrom(squatToday, session, [], { [key]: first })).toBeUndefined();
  });
});

describe('plannedExerciseFor', () => {
  const heavyBench = bench;
  const lightBench = bench.with({ sets: 4, repsConfig: { type: 'fixed', reps: 8 } });
  const squat = makeWeightedBlueprint({ name: 'Squat', sets: 3 });
  const routine = [heavyBench, squat, lightBench];
  const key = bench.progressionKey();

  it('pairs a movement planned twice with its own place in the routine', () => {
    const first = today([85, 85, 85]);
    const second = today([60, 60, 60, 60, 60], lightBench.with({ sets: 5 }));
    const session = [first, today([100, 100, 100], squat), second];

    expect(plannedExerciseFor(first, session, routine)).toBe(heavyBench);
    expect(plannedExerciseFor(second, session, routine)).toBe(lightBench);
  });

  it('gives a movement planned twice a lineage for each place', () => {
    const heavyLastTime = lastTime([5, 5, 5]);
    const lightLastTime = lastTime([8, 8, 8, 8], 60, lightBench);
    const first = today([85, 85, 85]);
    const second = today([60, 60, 60, 60, 60], lightBench.with({ sets: 5 }));
    const session = [first, second];
    const previous = { [key]: heavyLastTime, [`${key}#2`]: lightLastTime };

    expect(plannedLineageFor(first, session, routine)).toBe(key);
    expect(plannedLineageFor(second, session, routine)).toBe(`${key}#2`);
    expect(carriedFrom(first, session, routine, previous)).toBe(heavyLastTime);
    expect(carriedFrom(second, session, routine, previous)).toBe(lightLastTime);
  });

  it('carries a repeat never done as one from the first place', () => {
    const heavyLastTime = lastTime([5, 5, 5]);
    const second = today([60, 60, 60, 60], lightBench);

    expect(carriedFrom(second, [today([85, 85, 85]), second], routine, { [key]: heavyLastTime })).toBe(heavyLastTime);
  });

  it('has none for an exercise outside the session', () => {
    expect(plannedExerciseFor(today([85, 85, 85]), [], routine)).toBeUndefined();
    expect(plannedLineageFor(today([85, 85, 85]), [], routine)).toBeUndefined();
  });
});

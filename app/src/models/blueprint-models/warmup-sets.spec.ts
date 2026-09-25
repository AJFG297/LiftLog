import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import BigNumber from 'bignumber.js';
import {
  PlannedWarmupSet,
  ProgressionRule,
  Resistance,
  WeightedExerciseBlueprint,
  formatPlannedWarmupSet,
  nextWarmupSet,
  roundWarmupWeight,
  warmupIncrementFor,
  warmupLoadTypesFor,
  withWarmupLoadType,
} from '@/models/blueprint-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';
import type { WeightedExerciseBlueprintJSON } from '@/models/storage/versions/latest';

vi.mock('expo-localization', () => ({ getLocales: () => [{ decimalSeparator: '.' }] }));

const percent = (value: number, reps = 5): PlannedWarmupSet => ({ load: { type: 'percent', percent: value }, reps });
const absolute = (kg: number, reps = 5): PlannedWarmupSet => ({
  load: { type: 'absolute', weight: new Weight(kg, 'kilograms') },
  reps,
});
const repsOnly = (reps = 5): PlannedWarmupSet => ({ load: undefined, reps });

describe('planned warm-ups on a weighted blueprint', () => {
  it('has none unless planned', () => {
    expect(WeightedExerciseBlueprint.empty().warmupSets).toEqual([]);
  });

  it.each<[Resistance, string[]]>([
    ['external', ['percent', 'absolute']],
    ['bodyweight', ['absolute']],
    ['none', []],
  ])('lets a %s exercise take %j loads', (resistance, allowed) => {
    expect(warmupLoadTypesFor(resistance)).toEqual(allowed);
  });

  it('keeps percentage and absolute warm-ups on an external exercise, in order', () => {
    const warmups = [absolute(20), percent(50), percent(70, 3)];
    expect(makeWeightedBlueprint({ warmupSets: warmups }).warmupSets).toEqual(warmups);
  });

  it('drops a percentage from a bodyweight exercise but keeps an absolute added weight', () => {
    const blueprint = makeWeightedBlueprint({ resistance: 'bodyweight', warmupSets: [percent(50), absolute(10)] });
    expect(blueprint.warmupSets).toEqual([repsOnly(5), absolute(10)]);
  });

  it('makes every warm-up reps only on an exercise with no resistance', () => {
    const blueprint = makeWeightedBlueprint({ resistance: 'none', warmupSets: [percent(50), absolute(10, 3)] });
    expect(blueprint.warmupSets).toEqual([repsOnly(5), repsOnly(3)]);
  });

  it('refits its warm-ups when the resistance changes', () => {
    const blueprint = makeWeightedBlueprint({ warmupSets: [percent(50), absolute(20)] });
    expect(blueprint.with({ resistance: 'bodyweight' }).warmupSets).toEqual([repsOnly(5), absolute(20)]);
  });

  it('round-trips its warm-ups through JSON', () => {
    const blueprint = makeWeightedBlueprint({ warmupSets: [percent(50), absolute(20, 3), repsOnly(2)] });
    const json = JSON.parse(JSON.stringify(blueprint.toJSON())) as WeightedExerciseBlueprintJSON;
    const rebuilt = WeightedExerciseBlueprint.fromJSON(json);
    expect(rebuilt.equals(blueprint)).toBe(true);
    expect(rebuilt.warmupSets).toEqual(blueprint.warmupSets);
  });

  it('leaves the load off the JSON of a reps-only warm-up', () => {
    expect(makeWeightedBlueprint({ warmupSets: [repsOnly(5)] }).toJSON().warmupSets).toEqual([{ reps: 5 }]);
  });

  it.each([
    ['a different percentage', [percent(50)], [percent(60)]],
    ['a different load type', [percent(50)], [absolute(50)]],
    [
      'a different absolute unit',
      [absolute(20)],
      [{ load: { type: 'absolute', weight: new Weight(20, 'pounds') }, reps: 5 }],
    ],
    ['different reps', [percent(50, 5)], [percent(50, 3)]],
    ['an extra warm-up', [percent(50)], [percent(50), percent(70, 3)]],
  ] as [string, PlannedWarmupSet[], PlannedWarmupSet[]][])('is not equal with %s', (_label, a, b) => {
    expect(makeWeightedBlueprint({ warmupSets: a }).equals(makeWeightedBlueprint({ warmupSets: b }))).toBe(false);
  });

  it('formats a warm-up the way the plan reads it', () => {
    expect(formatPlannedWarmupSet(percent(50))).toBe('50% × 5');
    expect(formatPlannedWarmupSet(absolute(20, 3))).toBe('20kg × 3');
    expect(formatPlannedWarmupSet(repsOnly(8))).toBe('8');
  });
});

describe('nextWarmupSet', () => {
  it('offers 50% × 5 first and 70% × 3 after that on an external exercise', () => {
    const first = nextWarmupSet('external', []);
    expect(first).toEqual(percent(50, 5));
    expect(nextWarmupSet('external', [first])).toEqual(percent(70, 3));
  });

  it.each<Resistance>(['bodyweight', 'none'])('offers the same reps with no load on a %s exercise', (resistance) => {
    const first = nextWarmupSet(resistance, []);
    expect(first).toEqual(repsOnly(5));
    expect(nextWarmupSet(resistance, [first])).toEqual(repsOnly(3));
  });
});

describe('withWarmupLoadType', () => {
  it('starts a percentage at 50%, keeping the reps', () => {
    expect(withWarmupLoadType(absolute(20, 3), 'percent')).toEqual(percent(50, 3));
    expect(withWarmupLoadType(repsOnly(3), 'percent')).toEqual(percent(50, 3));
  });

  it('starts a fixed weight empty, keeping the reps', () => {
    expect(withWarmupLoadType(percent(70, 3), 'absolute')).toEqual(repsOnly(3));
  });

  it('leaves a warm-up already planned that way alone', () => {
    expect(withWarmupLoadType(percent(70, 3), 'percent')).toEqual(percent(70, 3));
    expect(withWarmupLoadType(absolute(20, 3), 'absolute')).toEqual(absolute(20, 3));
  });
});

describe('warm-up weight rounding', () => {
  it('rounds to the exercise’s load step', () => {
    const blueprint = makeWeightedBlueprint({ progression: [ProgressionRule.load(new BigNumber(5))] });
    expect(warmupIncrementFor(blueprint, 'kilograms').toNumber()).toBe(5);
  });

  it.each([
    ['kilograms', 2.5],
    ['pounds', 5],
  ] as const)('falls back to a pair of the smallest plates in %s', (unit, step) => {
    const noLoadStep = makeWeightedBlueprint({ progression: [] });
    expect(warmupIncrementFor(noLoadStep, unit).toNumber()).toBe(step);
  });

  it('lands on the nearest multiple of the increment, never below zero', () => {
    const units = fc.constantFrom('kilograms' as const, 'pounds' as const);
    const increments = fc.constantFrom(1, 1.25, 2.5, 5, 10);
    const values = fc.double({ min: -500, max: 1000, noNaN: true });
    fc.assert(
      fc.property(values, increments, units, (value, step, unit) => {
        const increment = new BigNumber(step);
        const rounded = roundWarmupWeight(new Weight(value, unit), increment);

        expect(rounded.unit).toBe(unit);
        expect(rounded.value.isGreaterThanOrEqualTo(0)).toBe(true);
        expect(rounded.value.modulo(increment).isZero()).toBe(true);
        if (value >= 0) {
          expect(rounded.value.minus(value).abs().isLessThanOrEqualTo(increment.dividedBy(2))).toBe(true);
        } else {
          expect(rounded.value.isZero()).toBe(true);
        }
      }),
    );
  });
});

describe('the progression key ignores warm-ups', () => {
  const warmupArb: fc.Arbitrary<PlannedWarmupSet> = fc.oneof(
    fc.record({ load: fc.constant(undefined), reps: fc.integer({ min: 1, max: 20 }) }),
    fc.record({
      load: fc.record({ type: fc.constant('percent' as const), percent: fc.integer({ min: 0, max: 100 }) }),
      reps: fc.integer({ min: 1, max: 20 }),
    }),
    fc.record({
      load: fc.record({
        type: fc.constant('absolute' as const),
        weight: fc
          .tuple(fc.constantFrom('kilograms' as const, 'pounds' as const), fc.integer({ min: 0, max: 200 }))
          .map(([unit, value]) => new Weight(value, unit)),
      }),
      reps: fc.integer({ min: 1, max: 20 }),
    }),
  );

  it('never changes when warm-ups are added or removed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Resistance>('external', 'bodyweight', 'none'),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 15 }),
        fc.boolean(),
        fc.array(warmupArb, { maxLength: 5 }),
        fc.array(warmupArb, { maxLength: 5 }),
        (resistance, sets, reps, repsRule, before, after) => {
          const blueprint = makeWeightedBlueprint({
            resistance,
            sets,
            repsConfig: { type: 'fixed', reps },
            progression: repsRule
              ? [ProgressionRule.of({ axis: 'reps', step: new BigNumber(1) })]
              : [ProgressionRule.load(new BigNumber(2.5))],
            warmupSets: before,
          });
          expect(blueprint.with({ warmupSets: after }).progressionKey()).toBe(blueprint.progressionKey());
        },
      ),
    );
  });
});

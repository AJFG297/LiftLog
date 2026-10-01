import { describe, expect, it } from 'vitest';
import BigNumber from 'bignumber.js';
import { ProgressionRule } from '@/models/blueprint-models';
import {
  progressionChoiceOf,
  rulesForPreset,
  sharedWorkingTopReps,
  withLadderKeptClimbable,
} from '@/components/presentation/workout-editor/routine-progression';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';

const bench = (progression: ProgressionRule[] = []) =>
  makeWeightedBlueprint({ name: 'Bench', sets: 3, repsConfig: { type: 'fixed', reps: 8 }, progression });

const json = (rules: ProgressionRule[]) => rules.map((rule) => rule.toJSON());

describe('rulesForPreset', () => {
  it('Add weight is one load rule on every set', () => {
    expect(json(rulesForPreset('weight', bench(), new BigNumber(2.5)))).toEqual([
      { axis: 'load', step: '2.5', scope: { type: 'allSets' }, trigger: 'allSetsMetTarget' },
    ]);
  });

  it('Reps, then weight climbs one rep to four above the plan, starts over, then adds weight', () => {
    expect(json(rulesForPreset('double', bench(), new BigNumber(2)))).toEqual([
      {
        axis: 'reps',
        step: '1',
        scope: { type: 'allSets' },
        ceiling: '12',
        onCeiling: 'reset',
        trigger: 'allSetsMetTarget',
      },
      { axis: 'load', step: '2', scope: { type: 'allSets' }, trigger: 'allSetsMetTarget' },
    ]);
  });

  it('Off is no rules', () => {
    expect(rulesForPreset('off', bench([ProgressionRule.load(new BigNumber(5))]), new BigNumber(2.5))).toEqual([]);
  });

  it('keeps the weight step the exercise already adds', () => {
    const deadlift = bench([ProgressionRule.load(new BigNumber(5))]);
    expect(json(rulesForPreset('double', deadlift, new BigNumber(2.5)))[1]).toEqual({
      axis: 'load',
      step: '5',
      scope: { type: 'allSets' },
      trigger: 'allSetsMetTarget',
    });
  });
});

describe('progressionChoiceOf', () => {
  it('reads each preset back from the rules it wrote', () => {
    for (const preset of ['weight', 'double', 'off'] as const) {
      expect(progressionChoiceOf(rulesForPreset(preset, bench(), new BigNumber(2.5)))).toBe(preset);
    }
  });

  it('reads the rule list Add rule builds for double progression as Reps, then weight', () => {
    const ladder = [
      ProgressionRule.of({ axis: 'reps', step: new BigNumber(1), ceiling: new BigNumber(15), onCeiling: 'reset' }),
      ProgressionRule.load(new BigNumber(2.5)),
    ];
    expect(progressionChoiceOf(ladder)).toBe('double');
  });

  it('calls anything else custom', () => {
    expect(progressionChoiceOf([ProgressionRule.load(new BigNumber(2.5), { type: 'lowestSets', pick: 'all' })])).toBe(
      'custom',
    );
    expect(progressionChoiceOf([ProgressionRule.of({ axis: 'reps', step: new BigNumber(1) })])).toBe('custom');
    expect(
      progressionChoiceOf([
        ProgressionRule.of({ axis: 'reps', step: new BigNumber(2), ceiling: new BigNumber(12), onCeiling: 'reset' }),
        ProgressionRule.load(new BigNumber(2.5)),
      ]),
    ).toBe('custom');
    expect(progressionChoiceOf([ProgressionRule.load(new BigNumber(0))])).toBe('custom');
  });
});

describe('withLadderKeptClimbable', () => {
  it('raises the limit when the plan reps reach it', () => {
    const climbing = bench(rulesForPreset('double', bench(), new BigNumber(2.5))).with({
      repsConfig: { type: 'fixed', reps: 12 },
    });
    expect(withLadderKeptClimbable(climbing).progression[0]!.ceiling?.toNumber()).toBe(16);
  });

  it('keeps a limit that is still above the plan reps', () => {
    const climbing = bench(rulesForPreset('double', bench(), new BigNumber(2.5))).with({
      repsConfig: { type: 'fixed', reps: 10 },
    });
    expect(withLadderKeptClimbable(climbing).progression[0]!.ceiling?.toNumber()).toBe(12);
  });
});

describe('sharedWorkingTopReps', () => {
  it('is the top reps when every working set shares them', () => {
    expect(sharedWorkingTopReps(bench())).toBe(8);
  });

  it('is undefined when the working sets have their own targets', () => {
    const perSet = makeWeightedBlueprint({
      name: 'Pull up',
      plannedSets: [
        { reps: { min: 6, max: 6 }, kind: 'working' },
        { reps: { min: 5, max: 5 }, kind: 'working' },
      ],
    });
    expect(sharedWorkingTopReps(perSet)).toBeUndefined();
  });

  it('ignores a drop set, which the rules never check', () => {
    const withDrop = makeWeightedBlueprint({
      name: 'Curl',
      plannedSets: [
        { reps: { min: 10, max: 10 }, kind: 'working' },
        { reps: { min: 10, max: 10 }, kind: 'working' },
        { reps: { min: 15, max: 15 }, kind: 'drop' },
      ],
    });
    expect(sharedWorkingTopReps(withDrop)).toBe(10);
  });
});

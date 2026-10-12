import { describe, expect, it } from 'vitest';
import BigNumber from 'bignumber.js';
import { ProgressionRule, SessionBlueprint } from '@/models/blueprint-models';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { nextSessionExercises, nextTimeOf } from '@/models/session-models/next-exercise';
import { RecordedWeightedExercise } from '@/models/session-models';
import { Weight } from '@/models/weight';

const kg = (n: number) => new Weight(n, 'kilograms');

// 3 x 8, then +2.5 kg once the best set hits 8.
const bench = makeWeightedBlueprint({ name: 'Bench', sets: 3, repsConfig: { type: 'fixed', reps: 8 } });
const row = makeWeightedBlueprint({ name: 'Row', sets: 3 });
const push = new SessionBlueprint('Push', [bench], '');
const pull = new SessionBlueprint('Pull', [row], '');

describe('nextTimeOf', () => {
  it('adds the weight the best set earned, and says it hit its reps', () => {
    const last = makeRecordedExercise(bench, [8, 8, 8], kg(60));

    expect(nextTimeOf([pull, push], bench.movementKey(), { [bench.progressionKey()]: last }, 'kilograms')).toEqual({
      routineName: 'Push',
      usesBodyweight: false,
      target: {
        weight: kg(62.5),
        reps: { min: 8, max: 8 },
        reason: { kind: 'weightUp', by: kg(2.5), lastTime: { sets: 3, reps: 8 } },
      },
    });
  });

  it('holds the weight when the best set fell short, naming the set that missed', () => {
    const last = makeRecordedExercise(bench, [7, 6, 6], kg(60));

    expect(nextTimeOf([push], bench.movementKey(), { [bench.progressionKey()]: last }, 'kilograms')?.target).toEqual({
      weight: kg(60),
      reps: { min: 8, max: 8 },
      reason: { kind: 'repeatAfterMiss', setLabel: '1', reps: 7, target: 8 },
    });
  });

  it('climbs a rep ladder before the weight', () => {
    const ladder = bench.with({
      progression: [
        ProgressionRule.of({ axis: 'reps', step: new BigNumber(1), ceiling: new BigNumber(10), onCeiling: 'reset' }),
        ProgressionRule.load(new BigNumber(2.5)),
      ],
    });
    const last = makeRecordedExercise(ladder, [8, 8, 8], kg(60));

    const next = nextTimeOf(
      [new SessionBlueprint('Push', [ladder], '')],
      ladder.movementKey(),
      { [ladder.progressionKey()]: last },
      'kilograms',
    );

    expect(next?.target).toEqual({
      weight: kg(60),
      reps: { min: 9, max: 9 },
      reason: { kind: 'repsUp', by: 1, lastTime: { sets: 3, reps: 8 } },
    });
  });

  it('opens an exercise never done on the plan, as a first time', () => {
    expect(nextTimeOf([push], bench.movementKey(), {}, 'kilograms')?.target.reason).toEqual({ kind: 'firstTime' });
  });

  it('takes the first routine to come up that plans it', () => {
    const legs = new SessionBlueprint('Legs', [makeWeightedBlueprint({ name: 'Squat' }), bench], '');

    expect(nextTimeOf([pull, legs, push], bench.movementKey(), {}, 'kilograms')?.routineName).toBe('Legs');
  });

  it('is undefined when no routine plans it', () => {
    expect(nextTimeOf([pull], bench.movementKey(), {}, 'kilograms')).toBeUndefined();
  });

  it('opens the exercise exactly as starting the routine does', () => {
    const last = makeRecordedExercise(bench, [8, 8, 6], kg(60));
    const latest = { [bench.progressionKey()]: last };

    const started = nextSessionExercises(push, latest, 'kilograms')[0] as RecordedWeightedExercise;
    const next = nextTimeOf([push], bench.movementKey(), latest, 'kilograms');

    expect(next?.target.weight).toEqual(started.potentialSets[0]!.weight);
    expect(next?.target.reps).toEqual(started.repsTargetForSet(0));
  });

  it('marks a bodyweight movement, whose weight is what is added', () => {
    const dip = makeWeightedBlueprint({ name: 'Dip', resistance: 'bodyweight' });

    expect(
      nextTimeOf([new SessionBlueprint('Push', [dip], '')], dip.movementKey(), {}, 'kilograms')?.usesBodyweight,
    ).toBe(true);
  });
});

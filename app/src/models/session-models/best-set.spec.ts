import { describe, expect, it } from 'vitest';
import { OffsetDateTime } from '@js-joda/core';
import {
  PotentialSet,
  RecordedSet,
  RecordedWeightedExercise,
} from '@/models/session-models/recorded-weighted-exercise';
import type { SetKind } from '@/models/session-models/set-kind';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';

const at = (minute: number) => OffsetDateTime.parse(`2026-09-29T10:${String(minute).padStart(2, '0')}:00Z`);

type Slot = [kg: number, reps: number | undefined, kind?: SetKind];

/** A performance of 10-rep sets, each `[kg, reps, kind]`; `undefined` reps is a set never logged. */
function performed(slots: Slot[], warmups: Slot[] = []) {
  const toSet = ([kg, reps, kind = 'working']: Slot, minute: number) =>
    PotentialSet.of({
      weight: new Weight(kg, 'kilograms'),
      target: { min: 10, max: 10 },
      kind,
      set: reps === undefined ? undefined : RecordedSet.of({ repsCompleted: reps, completionDateTime: at(minute) }),
    });
  return new RecordedWeightedExercise(
    makeWeightedBlueprint({ sets: slots.length }),
    slots.map(toSet),
    undefined,
    warmups.map(toSet),
  );
}

describe('the best set', () => {
  it.each([
    [
      'first',
      [
        [50, 10],
        [40, 10],
        [40, 10],
      ] as Slot[],
      0,
    ],
    [
      'middle',
      [
        [40, 10],
        [50, 10],
        [40, 10],
      ] as Slot[],
      1,
    ],
    [
      'last',
      [
        [40, 10],
        [40, 10],
        [50, 10],
      ] as Slot[],
      2,
    ],
  ])('is the heaviest set when it comes %s', (_, slots, index) => {
    expect(performed(slots).bestSetIndex).toBe(index);
  });

  it('goes to the set with more reps on a tie on weight', () => {
    expect(
      performed([
        [40, 8],
        [40, 10],
        [40, 9],
      ]).bestSetIndex,
    ).toBe(1);
  });

  it('goes to the earlier set on a tie on weight and reps', () => {
    expect(
      performed([
        [40, 10],
        [40, 10],
      ]).bestSetIndex,
    ).toBe(0);
  });

  it('is heavier before it has more reps', () => {
    expect(
      performed([
        [40, 12],
        [45, 6],
      ]).bestSetIndex,
    ).toBe(1);
  });

  it('counts a failure set', () => {
    expect(
      performed([
        [40, 10],
        [45, 6, 'failure'],
      ]).bestSetIndex,
    ).toBe(1);
  });

  it('never counts a drop, myo or warm-up set, however heavy', () => {
    const exercise = performed(
      [
        [40, 10],
        [60, 10, 'drop'],
        [70, 10, 'myo'],
      ],
      [[100, 5]],
    );

    expect(exercise.bestSetIndex).toBe(0);
    expect(exercise.bestSet?.weight).toEqual(new Weight(40, 'kilograms'));
  });

  it('is a logged set before a heavier one never logged', () => {
    expect(
      performed([
        [40, 10],
        [50, undefined],
      ]).bestSetIndex,
    ).toBe(0);
  });

  it('is the heaviest as loaded when none of the sets that count was logged', () => {
    expect(
      performed([
        [40, undefined],
        [50, undefined],
        [30, 10, 'drop'],
      ]).bestSetIndex,
    ).toBe(1);
  });

  it('is undefined when only drop and myo sets were planned', () => {
    expect(
      performed([
        [40, 10, 'drop'],
        [30, 10, 'myo'],
      ]).bestSetIndex,
    ).toBeUndefined();
  });

  it.each([
    [
      'met its target',
      [
        [40, 10],
        [40, 6],
        [40, 6],
      ] as Slot[],
      true,
    ],
    [
      'went past its target',
      [
        [40, 12],
        [40, 6],
      ] as Slot[],
      true,
    ],
    [
      'fell short',
      [
        [40, 9],
        [40, 9],
        [40, 9],
      ] as Slot[],
      false,
    ],
    [
      'fell short, though a lighter set met its target',
      [
        [40, 10],
        [45, 8],
      ] as Slot[],
      false,
    ],
    [
      'was never logged',
      [
        [40, undefined],
        [40, undefined],
      ] as Slot[],
      false,
    ],
  ])('meets its target when it %s', (_, slots, met) => {
    expect(performed(slots).bestSetMetTarget).toBe(met);
  });
});

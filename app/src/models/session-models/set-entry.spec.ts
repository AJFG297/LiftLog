import { describe, expect, it } from 'vitest';
import { OffsetDateTime } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { PotentialSet, RecordedSet, RecordedWeightedExercise } from '@/models/session-models';
import type { SetPosition } from '@/models/session-models/recorded-weighted-exercise';
import { rpeAfterTap } from '@/models/session-models/rpe';
import {
  canChangeSetKind,
  setRowAt,
  setRowsOf,
  SetEntryState,
  withAddedSet,
  withSetKind,
  withSetLogged,
  withSetRpe,
  withSetToggled,
  withTypedValue,
  weightUnitOf,
  workingNumberFor,
} from '@/models/session-models/set-entry';
import type { SetKind } from '@/models/session-models/set-kind';
import { Weight } from '@/models/weight';

const at = (minute: number) => OffsetDateTime.parse(`2025-04-05T10:${String(minute).padStart(2, '0')}:00Z`);
const kg = (value: number) => new Weight(value, 'kilograms');
const first = { list: 'working', index: 0 } as const;
const second = { list: 'working', index: 1 } as const;
const third = { list: 'working', index: 2 } as const;
const warmup = { list: 'warmup', index: 0 } as const;

function slot(weight: number, reps: number, init: { kind?: SetKind; logged?: number; minute?: number } = {}) {
  return PotentialSet.of({
    weight: kg(weight),
    target: { min: reps, max: reps },
    kind: init.kind ?? 'working',
    set:
      init.logged === undefined
        ? undefined
        : RecordedSet.of({ repsCompleted: init.logged, completionDateTime: at(init.minute ?? 0) }),
  });
}

/** Bench press: a 60 kg × 8 warm-up, then three working sets of 87.5 kg × 5. */
function bench(working: PotentialSet[] = [slot(87.5, 5), slot(87.5, 5), slot(87.5, 5)]): SetEntryState {
  const blueprint = makeWeightedBlueprint({
    name: 'Bench Press',
    plannedSets: working.map((s) => ({ reps: { min: 5, max: 5 }, kind: s.kind === 'warmup' ? 'working' : s.kind })),
    warmupSets: [{ reps: 8, load: { type: 'absolute', weight: kg(60) } }],
  });
  return { exercise: new RecordedWeightedExercise(blueprint, working, undefined, [slot(60, 8)]), drafts: {} };
}

const type = (state: SetEntryState, position: SetPosition, field: 'weight' | 'reps', value: number) =>
  withTypedValue(state, position, field, new BigNumber(value), 'kilograms');

describe('what a set row shows', () => {
  it('shows today’s target as placeholders until something is typed', () => {
    const row = setRowAt(bench(), first)!;

    expect(row.weight.value.value.toNumber()).toBe(87.5);
    expect(row.weight.entered).toBe(false);
    expect(row.reps).toEqual({ value: 5, entered: false });
    expect(row.logged).toBe(false);
  });

  it('lists warm-ups first, lettered, and numbers the working sets', () => {
    const state = withSetKind(bench(), third, 'failure');

    expect(setRowsOf(state).map((row) => row.label)).toEqual(['W', '1', '2', 'F']);
  });

  it('shows typed reps as the lifter’s own without logging them', () => {
    const state = type(bench(), first, 'reps', 4);

    expect(setRowAt(state, first)!.reps).toEqual({ value: 4, entered: true });
    expect(state.exercise.potentialSets[0]!.set).toBeUndefined();
  });

  it('puts a typed weight on the set, and later sets on the same weight follow it as placeholders', () => {
    const state = type(bench(), first, 'weight', 90);
    const rows = setRowsOf(state);

    expect(rows.map((row) => row.weight.value.value.toNumber())).toEqual([60, 90, 90, 90]);
    expect(rows.map((row) => row.weight.entered)).toEqual([false, true, false, false]);
  });

  it('leaves earlier sets, logged sets and sets on another weight where they are', () => {
    const state = type(
      bench([slot(87.5, 5, { logged: 5 }), slot(87.5, 5), slot(87.5, 5, { logged: 5 }), slot(80, 5)]),
      second,
      'weight',
      92.5,
    );

    expect(state.exercise.potentialSets.map((s) => s.weight.value.toNumber())).toEqual([87.5, 92.5, 87.5, 80]);
  });

  it('keeps a later set that was typed itself when an earlier one changes', () => {
    const typedThird = type(bench(), third, 'weight', 87.5);
    const state = type(typedThird, first, 'weight', 95);

    expect(state.exercise.potentialSets.map((s) => s.weight.value.toNumber())).toEqual([95, 95, 87.5]);
  });

  it('changes only the logged set when its weight is typed', () => {
    const state = type(bench([slot(87.5, 5, { logged: 5 }), slot(87.5, 5)]), first, 'weight', 85);

    expect(state.exercise.potentialSets.map((s) => s.weight.value.toNumber())).toEqual([85, 87.5]);
  });

  it('changes a logged set’s reps and keeps when it was logged', () => {
    const state = type(bench([slot(87.5, 5, { logged: 5, minute: 7 })]), first, 'reps', 3);

    expect(state.exercise.potentialSets[0]!.set!.repsCompleted).toBe(3);
    expect(state.exercise.potentialSets[0]!.set!.completionDateTime.toString()).toBe('2025-04-05T10:07Z');
  });

  it('types a warm-up’s weight for this session only', () => {
    const state = type(bench(), warmup, 'weight', 50);

    expect(state.exercise.warmupSets[0]!.weight.value.toNumber()).toBe(50);
    expect(state.exercise.blueprint.warmupSets[0]!.load).toEqual({ type: 'absolute', weight: kg(60) });
  });

  it('weighs a slot with no unit yet in the fallback unit', () => {
    const empty = bench([PotentialSet.of({ weight: Weight.NIL, target: { min: 5, max: 5 } })]);
    const state = withTypedValue(empty, first, 'weight', new BigNumber(135), 'pounds');

    expect(state.exercise.potentialSets[0]!.weight).toEqual(new Weight(135, 'pounds'));
  });
});

describe('logging a set with the check', () => {
  it('logs an untouched set at its placeholders in one tap', () => {
    const state = withSetToggled(bench(), first, at(3));
    const logged = state.exercise.potentialSets[0]!;

    expect(logged.set!.repsCompleted).toBe(5);
    expect(logged.set!.completionDateTime.toString()).toBe('2025-04-05T10:03Z');
    expect(logged.weight.value.toNumber()).toBe(87.5);
  });

  it('logs what was typed', () => {
    const state = withSetToggled(type(type(bench(), first, 'weight', 90), first, 'reps', 4), first, at(3));

    expect(state.exercise.potentialSets[0]!.set!.repsCompleted).toBe(4);
    expect(state.exercise.potentialSets[0]!.weight.value.toNumber()).toBe(90);
    expect(setRowAt(state, first)!.reps).toEqual({ value: 4, entered: true });
  });

  it('logs a warm-up at its own target', () => {
    const state = withSetToggled(bench(), warmup, at(1));

    expect(state.exercise.warmupSets[0]!.set!.repsCompleted).toBe(8);
  });

  it('never undoes a set when the pad’s check logs it', () => {
    const logged = withSetToggled(bench(), first, at(3));

    expect(withSetLogged(logged, first, at(5))).toBe(logged);
  });
});

describe('undoing a set with the check', () => {
  it('keeps typed values, so ticking it again logs the same set', () => {
    const typed = type(type(bench(), first, 'weight', 90), first, 'reps', 4);
    const undone = withSetToggled(withSetToggled(typed, first, at(3)), first, at(4));
    const row = setRowAt(undone, first)!;

    expect(undone.exercise.potentialSets[0]!.set).toBeUndefined();
    expect(row.reps).toEqual({ value: 4, entered: true });
    expect(row.weight.value.value.toNumber()).toBe(90);
    expect(row.weight.entered).toBe(true);
    expect(withSetToggled(undone, first, at(5)).exercise.potentialSets[0]!.set!.repsCompleted).toBe(4);
  });

  it('goes back to placeholders when the set was logged untouched', () => {
    const undone = withSetToggled(withSetToggled(bench(), first, at(3)), first, at(4));

    expect(setRowAt(undone, first)!.reps).toEqual({ value: 5, entered: false });
    expect(setRowAt(undone, first)!.weight.entered).toBe(false);
  });

  it('keeps reps that were logged short of the target even with nothing typed', () => {
    const undone = withSetToggled(bench([slot(87.5, 5, { logged: 3 })]), first, at(4));

    expect(setRowAt(undone, first)!.reps).toEqual({ value: 3, entered: true });
  });
});

describe('RPE', () => {
  it('picks the tapped chip, and clears it when the picked one is tapped again', () => {
    expect(rpeAfterTap(undefined, 8)).toBe(8);
    expect(rpeAfterTap(8, 9)).toBe(9);
    expect(rpeAfterTap(8, 8)).toBeUndefined();
  });

  it('sets and clears a working set’s RPE without logging it', () => {
    const picked = withSetRpe(bench(), first, 8.5);
    const cleared = withSetRpe(picked, first, rpeAfterTap(8.5, 8.5));

    expect(picked.exercise.potentialSets[0]!.rpe).toBe(8.5);
    expect(picked.exercise.potentialSets[0]!.set).toBeUndefined();
    expect(cleared.exercise.potentialSets[0]!.rpe).toBeUndefined();
  });

  it('keeps the RPE through logging and undoing', () => {
    const state = withSetToggled(withSetToggled(withSetRpe(bench(), first, 9), first, at(3)), first, at(4));

    expect(state.exercise.potentialSets[0]!.rpe).toBe(9);
  });

  it('gives a warm-up no RPE', () => {
    const state = withSetRpe(bench(), warmup, 7);

    expect(state.exercise.warmupSets[0]!.rpe).toBeUndefined();
  });
});

describe('adding a set', () => {
  it('copies the last set’s weight, target and type, in the session and its plan', () => {
    const state = withAddedSet(type(bench(), third, 'weight', 90), 'kilograms');
    const added = state.exercise.potentialSets[3]!;

    expect(added.weight.value.toNumber()).toBe(90);
    expect(added.target).toEqual({ min: 5, max: 5 });
    expect(added.kind).toBe('working');
    expect(added.set).toBeUndefined();
    expect(state.exercise.blueprint.plannedSets).toHaveLength(4);
    expect(state.exercise.blueprint.plannedSets[3]).toEqual({ reps: { min: 5, max: 5 }, kind: 'working' });
  });

  it('copies the reps the last row shows when they aren’t its target', () => {
    const missed = withSetToggled(type(bench(), third, 'reps', 4), third, at(5));
    const state = withAddedSet(missed, 'kilograms');
    const added = setRowAt(state, { list: 'working', index: 3 })!;

    expect(added.reps).toEqual({ value: 4, entered: true });
    expect(state.exercise.potentialSets[3]!.target).toEqual({ min: 5, max: 5 });
  });

  it('leaves the reps as the target placeholder when the last row shows its target', () => {
    const state = withAddedSet(withSetToggled(bench(), third, at(5)), 'kilograms');

    expect(setRowAt(state, { list: 'working', index: 3 })!.reps).toEqual({ value: 5, entered: false });
    expect(state.drafts).toEqual({});
  });

  it.each([
    ['working', 'working'],
    ['drop', 'drop'],
    ['myo', 'myo'],
    ['failure', 'working'],
  ] as const)('follows a %s set with a %s set', (kind, expected) => {
    const state = withAddedSet(bench([slot(87.5, 5), slot(60, 12, { kind, logged: 12 })]), 'kilograms');

    expect(state.exercise.potentialSets[2]!.kind).toBe(expected);
    expect(state.exercise.potentialSets[2]!.weight.value.toNumber()).toBe(60);
    expect(state.exercise.blueprint.plannedSets[2]!.kind).toBe(expected);
  });

  it('follows a warm-up with a working set', () => {
    const onlyWarmup = { ...bench(), exercise: bench().exercise.with({ potentialSets: [] }) };
    const state = withAddedSet(onlyWarmup, 'kilograms');

    expect(state.exercise.potentialSets.map((s) => [s.kind, s.weight.value.toNumber(), s.target.max])).toEqual([
      ['working', 60, 8],
    ]);
  });
});

describe('changing a set’s type', () => {
  it('changes a working set’s kind in the session and its plan', () => {
    const state = withSetKind(bench(), third, 'failure');

    expect(state.exercise.potentialSets.map((s) => s.kind)).toEqual(['working', 'working', 'failure']);
    expect(state.exercise.blueprint.plannedSets.map((s) => s.kind)).toEqual(['working', 'working', 'failure']);
  });

  it('moves a set that becomes a warm-up to the end of the warm-ups, with its draft', () => {
    const typed = withSetRpe(type(bench(), first, 'reps', 6), first, 8);
    const state = withSetKind(type(typed, second, 'reps', 4), first, 'warmup');

    expect(state.exercise.warmupSets.map((s) => [s.weight.value.toNumber(), s.rpe])).toEqual([
      [60, undefined],
      [87.5, undefined],
    ]);
    expect(state.exercise.potentialSets).toHaveLength(2);
    expect(state.exercise.blueprint.plannedSets).toHaveLength(2);
    expect(state.exercise.blueprint.warmupSets[1]).toEqual({ reps: 5, load: { type: 'absolute', weight: kg(87.5) } });
    expect(state.drafts).toEqual({ 'warmup:1': { reps: 6 }, 'working:0': { reps: 4 } });
  });

  it('makes a warm-up that stops being one the first working set', () => {
    const state = withSetKind(type(type(bench(), warmup, 'reps', 10), first, 'reps', 4), warmup, 'drop');

    expect(state.exercise.warmupSets).toHaveLength(0);
    expect(state.exercise.potentialSets.map((s) => [s.kind, s.weight.value.toNumber()])).toEqual([
      ['drop', 60],
      ['working', 87.5],
      ['working', 87.5],
      ['working', 87.5],
    ]);
    expect(state.exercise.blueprint.plannedSets[0]).toEqual({ reps: { min: 8, max: 8 }, kind: 'drop' });
    expect(state.exercise.blueprint.warmupSets).toHaveLength(0);
    expect(state.drafts).toEqual({ 'working:0': { reps: 10 }, 'working:1': { reps: 4 } });
  });

  it('keeps at least one set that isn’t a warm-up', () => {
    const single = bench([slot(87.5, 5)]);

    expect(canChangeSetKind(single.exercise, first, 'warmup')).toBe(false);
    expect(withSetKind(single, first, 'warmup')).toBe(single);
    expect(canChangeSetKind(single.exercise, first, 'drop')).toBe(true);
  });
});

describe('workingNumberFor', () => {
  it('numbers a set as it would be counted if it were a working set', () => {
    const state = withSetKind(withSetKind(bench(), first, 'drop'), third, 'failure');

    expect(workingNumberFor(state, first)).toBe(1);
    expect(workingNumberFor(state, second)).toBe(1);
    expect(workingNumberFor(state, third)).toBe(2);
    expect(workingNumberFor(state, warmup)).toBe(1);
  });
});

describe('weightUnitOf', () => {
  it('uses the exercise’s own unit, or the preferred one while it has none', () => {
    expect(weightUnitOf(bench().exercise, 'pounds')).toBe('kilograms');
    const unweighed = bench([PotentialSet.of({ weight: Weight.NIL, target: { min: 5, max: 5 } })]).exercise.with({
      warmupSets: [],
    });
    expect(weightUnitOf(unweighed, 'pounds')).toBe('pounds');
  });
});

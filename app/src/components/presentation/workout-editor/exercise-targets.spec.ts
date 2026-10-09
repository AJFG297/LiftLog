import { describe, expect, it } from 'vitest';
import { WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import {
  targetsModeOf,
  TargetsPadAction,
  targetsPadReducer,
  TargetsPadState,
  targetsSummaryOf,
  withAddedSet,
  withoutSet,
  withTargetsMode,
} from '@/components/presentation/workout-editor/exercise-targets';

const fixed = makeWeightedBlueprint({ sets: 3, repsConfig: { type: 'fixed', reps: 10 } });
const range = makeWeightedBlueprint({ sets: 3, repsConfig: { type: 'range', min: 10, max: 15 } });
const pyramid = makeWeightedBlueprint({
  sets: 3,
  repsConfig: {
    type: 'perSet',
    targets: [
      { min: 10, max: 10 },
      { min: 8, max: 8 },
      { min: 6, max: 6 },
    ],
  },
});

const reps = (exercise: WeightedExerciseBlueprint) => exercise.plannedSets.map((s) => [s.reps.min, s.reps.max]);

/** Runs the pad from closed over `exercise`, one action after another. */
function run(exercise: WeightedExerciseBlueprint, ...actions: TargetsPadAction[]): TargetsPadState {
  return actions.reduce(targetsPadReducer, { exercise, pad: undefined });
}

const digits = (typed: string): TargetsPadAction[] =>
  typed.split('').map((d) => ({ type: 'digit', digit: Number(d) }) as const);

describe('targetsModeOf', () => {
  it('reads the layout the targets came from', () => {
    expect(targetsModeOf(fixed)).toBe('fixed');
    expect(targetsModeOf(range)).toBe('range');
    expect(targetsModeOf(pyramid)).toBe('perSet');
  });
});

describe('withTargetsMode', () => {
  it('keeps the set count and seeds the new layout from the first set', () => {
    expect(reps(withTargetsMode(range, 'fixed'))).toEqual([
      [10, 10],
      [10, 10],
      [10, 10],
    ]);
    expect(reps(withTargetsMode(range, 'perSet'))).toEqual([
      [15, 15],
      [15, 15],
      [15, 15],
    ]);
    expect(reps(withTargetsMode(fixed, 'range'))).toEqual([
      [10, 10],
      [10, 10],
      [10, 10],
    ]);
  });
});

describe('targetsSummaryOf', () => {
  it('reads sets times reps, a range with its dash, and per set reps one by one', () => {
    expect(targetsSummaryOf(fixed, 'fixed')).toBe('3 × 10');
    expect(targetsSummaryOf(range, 'range')).toBe('3 × 10–15');
    expect(targetsSummaryOf(pyramid, 'perSet')).toBe('10 · 8 · 6');
  });
});

describe('adding and removing sets', () => {
  it('adds a set with the last set’s reps', () => {
    expect(reps(withAddedSet(pyramid))).toEqual([
      [10, 10],
      [8, 8],
      [6, 6],
      [6, 6],
    ]);
  });

  it('removes the set at an index but always keeps one', () => {
    expect(reps(withoutSet(pyramid, 1))).toEqual([
      [10, 10],
      [6, 6],
    ]);
    const single = makeWeightedBlueprint({ sets: 1 });
    expect(withoutSet(single, 0).plannedSets).toHaveLength(1);
  });
});

describe('targetsPadReducer', () => {
  describe('fixed', () => {
    it('replaces the value with the first key press and edits every set', () => {
      const state = run(fixed, { type: 'open', field: { kind: 'reps' }, mode: 'fixed' }, ...digits('8'));
      expect(reps(state.exercise)).toEqual([
        [8, 8],
        [8, 8],
        [8, 8],
      ]);
      expect(state.pad?.value).toBe(8);
    });

    it('types several digits into one value', () => {
      const state = run(fixed, { type: 'open', field: { kind: 'reps' }, mode: 'fixed' }, ...digits('12'));
      expect(state.exercise.plannedSets[0]!.reps).toEqual({ min: 12, max: 12 });
    });

    it('edits the set count, keeping each set’s reps', () => {
      const state = run(pyramid, { type: 'open', field: { kind: 'sets' }, mode: 'fixed' }, ...digits('5'));
      expect(reps(state.exercise)).toEqual([
        [10, 10],
        [8, 8],
        [6, 6],
        [6, 6],
        [6, 6],
      ]);
    });

    it('does not lose sets while a longer count is typed', () => {
      const state = run(pyramid, { type: 'open', field: { kind: 'sets' }, mode: 'fixed' }, ...digits('12'));
      expect(state.exercise.plannedSets).toHaveLength(12);
      expect(state.exercise.plannedSets[1]!.reps).toEqual({ min: 8, max: 8 });
    });

    it('keeps at least one set and one rep, even while 0 is on the pad', () => {
      const state = run(fixed, { type: 'open', field: { kind: 'sets' }, mode: 'fixed' }, ...digits('0'));
      expect(state.pad?.value).toBe(0);
      expect(state.exercise.plannedSets).toHaveLength(1);
      const repsState = run(fixed, { type: 'open', field: { kind: 'reps' }, mode: 'fixed' }, ...digits('0'));
      expect(repsState.exercise.plannedSets[0]!.reps).toEqual({ min: 1, max: 1 });
    });

    it('starts again from the digit when a value would pass the cap', () => {
      const state = run(fixed, { type: 'open', field: { kind: 'sets' }, mode: 'fixed' }, ...digits('25'));
      expect(state.exercise.plannedSets).toHaveLength(5);
    });

    it('nudges by one with − and +, and types afresh after a nudge', () => {
      const open: TargetsPadAction = { type: 'open', field: { kind: 'reps' }, mode: 'fixed' };
      expect(run(fixed, open, { type: 'step', by: 1 }).exercise.plannedSets[0]!.reps.max).toBe(11);
      expect(run(fixed, open, { type: 'step', by: -1 }).exercise.plannedSets[0]!.reps.max).toBe(9);
      expect(run(fixed, open, { type: 'step', by: 1 }, ...digits('6')).exercise.plannedSets[0]!.reps.max).toBe(6);
      const one = makeWeightedBlueprint({ sets: 1, repsConfig: { type: 'fixed', reps: 1 } });
      expect(run(one, open, { type: 'step', by: -1 }).exercise.plannedSets[0]!.reps.max).toBe(1);
    });

    it('sets the value with a chip in one tap', () => {
      const state = run(
        fixed,
        { type: 'open', field: { kind: 'reps' }, mode: 'fixed' },
        {
          type: 'chip',
          reps: { min: 12, max: 12 },
        },
      );
      expect(state.exercise.plannedSets[0]!.reps).toEqual({ min: 12, max: 12 });
      expect(
        run(
          fixed,
          { type: 'open', field: { kind: 'reps' }, mode: 'fixed' },
          { type: 'chip', reps: { min: 12, max: 12 } },
          ...digits('5'),
        ).exercise.plannedSets[0]!.reps.max,
      ).toBe(5);
    });

    it('walks Sets, then Reps, then closes', () => {
      const atSets = run(fixed, { type: 'open', field: { kind: 'sets' }, mode: 'fixed' });
      const atReps = targetsPadReducer(atSets, { type: 'next' });
      expect(atReps.pad?.field).toEqual({ kind: 'reps' });
      expect(atReps.pad?.value).toBe(10);
      expect(targetsPadReducer(atReps, { type: 'next' }).pad).toBeUndefined();
    });

    it('closes with Done', () => {
      expect(
        run(fixed, { type: 'open', field: { kind: 'sets' }, mode: 'fixed' }, { type: 'close' }).pad,
      ).toBeUndefined();
    });
  });

  describe('range', () => {
    const openReps: TargetsPadAction = { type: 'open', field: { kind: 'reps' }, mode: 'range' };

    it('starts on the bottom of the range', () => {
      expect(run(range, openReps).pad?.field).toEqual({ kind: 'bottom' });
    });

    it('types 8, the dash and 12 into 8–12, then the top alone into 8–15', () => {
      const typed = run(range, openReps, ...digits('8'), { type: 'dash' }, ...digits('12'));
      expect(reps(typed.exercise)).toEqual([
        [8, 12],
        [8, 12],
        [8, 12],
      ]);
      const top = run(typed.exercise, openReps, { type: 'pick', field: { kind: 'top' } }, ...digits('15'));
      expect(top.exercise.plannedSets[0]!.reps).toEqual({ min: 8, max: 15 });
    });

    it('raises the top to the bottom when the top is typed below it', () => {
      const state = run(range, openReps, { type: 'pick', field: { kind: 'top' } }, ...digits('6'));
      expect(state.pad?.value).toBe(6);
      expect(state.exercise.plannedSets[0]!.reps).toEqual({ min: 10, max: 10 });
    });

    it('raises the top past a bottom typed above it, and gives it back while the bottom is still being typed', () => {
      const above = run(range, openReps, ...digits('20'));
      expect(above.exercise.plannedSets[0]!.reps).toEqual({ min: 20, max: 20 });
      const back = targetsPadReducer(above, { type: 'backspace' });
      expect(back.exercise.plannedSets[0]!.reps).toEqual({ min: 2, max: 15 });
    });

    it('keeps the bottom at least 1', () => {
      const state = run(range, openReps, ...digits('0'));
      expect(state.exercise.plannedSets[0]!.reps).toEqual({ min: 1, max: 15 });
    });

    it('sets both ends with a chip and moves to the top', () => {
      const state = run(range, openReps, { type: 'chip', reps: { min: 8, max: 12 } });
      expect(state.exercise.plannedSets[0]!.reps).toEqual({ min: 8, max: 12 });
      expect(state.pad?.field).toEqual({ kind: 'top' });
    });

    it('walks Sets, the bottom, the top, then closes', () => {
      const atSets = run(range, { type: 'open', field: { kind: 'sets' }, mode: 'range' });
      const atBottom = targetsPadReducer(atSets, { type: 'next' });
      expect(atBottom.pad?.field).toEqual({ kind: 'bottom' });
      const atTop = targetsPadReducer(atBottom, { type: 'next' });
      expect(atTop.pad?.field).toEqual({ kind: 'top' });
      expect(atTop.pad?.value).toBe(15);
      expect(targetsPadReducer(atTop, { type: 'next' }).pad).toBeUndefined();
    });

    it('ignores the dash anywhere but the bottom', () => {
      const atTop = run(range, openReps, { type: 'dash' });
      expect(targetsPadReducer(atTop, { type: 'dash' })).toBe(atTop);
    });
  });

  describe('per set', () => {
    it('edits only the set it is open on', () => {
      const state = run(pyramid, { type: 'open', field: { kind: 'set', index: 1 }, mode: 'perSet' }, ...digits('5'));
      expect(reps(state.exercise)).toEqual([
        [10, 10],
        [5, 5],
        [6, 6],
      ]);
    });

    it('steps set by set with Next and closes after the last', () => {
      const first = run(pyramid, { type: 'open', field: { kind: 'set', index: 0 }, mode: 'perSet' });
      const second = targetsPadReducer(first, { type: 'next' });
      expect(second.pad?.field).toEqual({ kind: 'set', index: 1 });
      expect(second.pad?.value).toBe(8);
      const third = targetsPadReducer(second, { type: 'next' });
      expect(third.pad?.field).toEqual({ kind: 'set', index: 2 });
      expect(targetsPadReducer(third, { type: 'next' }).pad).toBeUndefined();
    });
  });

  it('keeps edits made elsewhere while the pad is open', () => {
    const open = run(fixed, { type: 'open', field: { kind: 'reps' }, mode: 'fixed' });
    const typed = targetsPadReducer(
      { ...open, exercise: open.exercise.with({ notes: 'Pause' }) },
      {
        type: 'digit',
        digit: 8,
      },
    );
    expect(typed.exercise.notes).toBe('Pause');
    expect(typed.exercise.plannedSets[0]!.reps.max).toBe(8);
  });

  it('keeps the kind of each set', () => {
    const withDrop = fixed.with({
      plannedSets: fixed.plannedSets.map((s, i) => (i === 2 ? { ...s, kind: 'drop' as const } : s)),
    });
    const state = run(withDrop, { type: 'open', field: { kind: 'reps' }, mode: 'fixed' }, ...digits('8'));
    expect(state.exercise.plannedSets.map((s) => s.kind)).toEqual(['working', 'working', 'drop']);
  });
});

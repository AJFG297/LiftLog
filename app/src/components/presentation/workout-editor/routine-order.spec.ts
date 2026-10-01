import { describe, expect, it } from 'vitest';
import { ExerciseBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import {
  canMoveExercise,
  canToggleSuperset,
  routineBlocksOf,
  routineExerciseLabel,
  withExerciseMoved,
  withExerciseRemoved,
  withSupersetToggled,
} from '@/components/presentation/workout-editor/routine-order';
import { makeCardioBlueprint, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';

// Bench, Press, then Triceps + Fly as superset A, then Curl.
function push(): ExerciseBlueprint[] {
  return [
    makeWeightedBlueprint({ name: 'Bench' }),
    makeWeightedBlueprint({ name: 'Press' }),
    makeWeightedBlueprint({ name: 'Triceps', supersetWithNext: true }),
    makeWeightedBlueprint({ name: 'Fly' }),
    makeWeightedBlueprint({ name: 'Curl' }),
  ];
}

const names = (exercises: readonly ExerciseBlueprint[]) => exercises.map((e) => e.name);
const flags = (exercises: readonly ExerciseBlueprint[]) =>
  exercises.map((e) => (e instanceof WeightedExerciseBlueprint ? e.supersetWithNext : false));

describe('routineBlocksOf', () => {
  it('groups a superset chain into one lettered block', () => {
    expect(routineBlocksOf(push())).toEqual([
      { indices: [0], supersetLetter: undefined },
      { indices: [1], supersetLetter: undefined },
      { indices: [2, 3], supersetLetter: 'A' },
      { indices: [4], supersetLetter: undefined },
    ]);
  });

  it('ignores a superset flag on the last exercise', () => {
    const exercises = [makeWeightedBlueprint({ name: 'Bench' }), makeWeightedBlueprint({ supersetWithNext: true })];
    expect(routineBlocksOf(exercises)).toEqual([
      { indices: [0], supersetLetter: undefined },
      { indices: [1], supersetLetter: undefined },
    ]);
  });

  it('labels exercises by position, and superset members by letter', () => {
    expect([0, 1, 2, 3, 4].map((i) => routineExerciseLabel(push(), i))).toEqual(['1', '2', 'A1', 'A2', '5']);
  });
});

describe('withExerciseMoved', () => {
  it('moves a superset as one unit', () => {
    const moved = withExerciseMoved(push(), 3, 'up');
    expect(names(moved)).toEqual(['Bench', 'Triceps', 'Fly', 'Press', 'Curl']);
    expect(flags(moved)).toEqual([false, true, false, false, false]);
  });

  it('hops a single exercise over a whole superset', () => {
    const down = withExerciseMoved(push(), 1, 'down');
    expect(names(down)).toEqual(['Bench', 'Triceps', 'Fly', 'Press', 'Curl']);
    expect(flags(down)).toEqual([false, true, false, false, false]);

    const up = withExerciseMoved(push(), 4, 'up');
    expect(names(up)).toEqual(['Bench', 'Press', 'Curl', 'Triceps', 'Fly']);
    expect(flags(up)).toEqual([false, false, false, true, false]);
  });

  it('never splits a superset, whichever member is moved', () => {
    expect(names(withExerciseMoved(push(), 2, 'down'))).toEqual(['Bench', 'Press', 'Curl', 'Triceps', 'Fly']);
  });

  it('clears a stray superset flag on the last exercise once something follows it', () => {
    const exercises = [
      makeWeightedBlueprint({ name: 'Bench' }),
      makeWeightedBlueprint({ name: 'Curl', supersetWithNext: true }),
    ];
    const moved = withExerciseMoved(exercises, 1, 'up');
    expect(names(moved)).toEqual(['Curl', 'Bench']);
    expect(flags(moved)).toEqual([false, false]);
  });

  it('does nothing at either end', () => {
    expect(canMoveExercise(push(), 0, 'up')).toBe(false);
    expect(canMoveExercise(push(), 4, 'down')).toBe(false);
    expect(canMoveExercise(push(), 2, 'up')).toBe(true);
    expect(names(withExerciseMoved(push(), 0, 'up'))).toEqual(['Bench', 'Press', 'Triceps', 'Fly', 'Curl']);
  });
});

describe('withSupersetToggled', () => {
  it('links a lone exercise to the next one', () => {
    const linked = withSupersetToggled(push(), 0);
    expect(flags(linked)).toEqual([true, false, true, false, false]);
    expect(routineBlocksOf(linked).map((b) => b.supersetLetter)).toEqual(['A', 'B', undefined]);
  });

  it('joins an existing superset when the next exercise is in one', () => {
    const linked = withSupersetToggled(push(), 1);
    expect(routineBlocksOf(linked)).toEqual([
      { indices: [0], supersetLetter: undefined },
      { indices: [1, 2, 3], supersetLetter: 'A' },
      { indices: [4], supersetLetter: undefined },
    ]);
  });

  it('unlinks the whole superset from any member', () => {
    expect(flags(withSupersetToggled(push(), 3))).toEqual([false, false, false, false, false]);
  });

  it('cannot link the last exercise or a cardio one', () => {
    expect(canToggleSuperset(push(), 4)).toBe(false);
    expect(canToggleSuperset([makeCardioBlueprint(), makeWeightedBlueprint()], 0)).toBe(false);
    expect(canToggleSuperset(push(), 3)).toBe(true);
  });
});

describe('withExerciseRemoved', () => {
  it('removing the last member of a superset keeps it from joining the next exercise', () => {
    const removed = withExerciseRemoved(push(), 3);
    expect(names(removed)).toEqual(['Bench', 'Press', 'Triceps', 'Curl']);
    expect(flags(removed)).toEqual([false, false, false, false]);
  });

  it('removing the first member leaves the rest of the chain alone', () => {
    const exercises = [
      makeWeightedBlueprint({ name: 'A', supersetWithNext: true }),
      makeWeightedBlueprint({ name: 'B', supersetWithNext: true }),
      makeWeightedBlueprint({ name: 'C' }),
    ];
    const removed = withExerciseRemoved(exercises, 0);
    expect(names(removed)).toEqual(['B', 'C']);
    expect(flags(removed)).toEqual([true, false]);
  });

  it('removes by position when the same exercise appears twice', () => {
    const exercises = [makeWeightedBlueprint({ name: 'Squat' }), makeWeightedBlueprint({ name: 'Squat' })];
    expect(withExerciseRemoved(exercises, 1)).toHaveLength(1);
  });
});

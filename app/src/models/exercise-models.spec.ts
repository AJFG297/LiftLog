import { describe, expect, it } from 'vitest';
import {
  ExerciseDescriptor,
  fromExerciseDescriptorJSON,
  musclesOf,
  toExerciseDescriptorJSON,
  withMuscles,
} from '@/models/exercise-models';

const squat: ExerciseDescriptor = {
  name: 'Squat',
  force: 'push',
  level: 'beginner',
  mechanic: 'compound',
  equipment: 'barbell',
  primaryMuscles: ['quadriceps'],
  secondaryMuscles: ['glutes', 'hamstrings'],
  instructions: '',
  category: 'strength',
};

describe('musclesOf', () => {
  it('lists the primary muscles, then the secondary ones, each once', () => {
    expect(musclesOf(squat)).toEqual(['quadriceps', 'glutes', 'hamstrings']);
    expect(musclesOf({ ...squat, secondaryMuscles: ['quadriceps'] })).toEqual(['quadriceps']);
  });
});

describe('withMuscles', () => {
  it('keeps the role of every muscle it already had', () => {
    const edited = withMuscles(squat, ['glutes', 'quadriceps']);

    expect(edited.primaryMuscles).toEqual(['quadriceps']);
    expect(edited.secondaryMuscles).toEqual(['glutes']);
  });

  it('adds a new muscle as primary', () => {
    const edited = withMuscles(squat, ['quadriceps', 'glutes', 'hamstrings', 'calves']);

    expect(edited.primaryMuscles).toEqual(['quadriceps', 'calves']);
    expect(edited.secondaryMuscles).toEqual(['glutes', 'hamstrings']);
  });

  it('drops a removed muscle from either list', () => {
    const edited = withMuscles(squat, ['glutes']);

    expect(edited.primaryMuscles).toEqual([]);
    expect(edited.secondaryMuscles).toEqual(['glutes']);
  });
});

describe('toExerciseDescriptorJSON', () => {
  it('also writes the joined muscle list older app versions read, and reads back without it', () => {
    const json = toExerciseDescriptorJSON(squat);

    expect(json.muscles).toEqual(['quadriceps', 'glutes', 'hamstrings']);
    expect(fromExerciseDescriptorJSON(json)).toEqual(squat);
  });
});

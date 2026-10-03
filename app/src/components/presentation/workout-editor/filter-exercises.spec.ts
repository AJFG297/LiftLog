import { describe, expect, it } from 'vitest';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { filterExercises, searchSeedFor } from './filter-exercises';

function exercise(name: string, primaryMuscles: string[] = [], secondaryMuscles: string[] = []): ExerciseDescriptor {
  return {
    name,
    primaryMuscles,
    secondaryMuscles,
    force: null,
    level: '',
    mechanic: null,
    equipment: null,
    instructions: '',
    category: '',
  };
}

const exercises = {
  situp: exercise('3/4 Sit-Up', ['abdominals']),
  incline: exercise('Incline Dumbbell Press', ['chest']),
  bench: exercise('Bench Press', ['chest']),
  squat: exercise('Squat', ['quadriceps']),
};

describe('filterExercises', () => {
  it('lists every exercise by name when there is no query or filter', () => {
    expect(filterExercises(exercises, '', [])).toEqual({
      ids: ['situp', 'bench', 'incline', 'squat'],
      suggestion: 'NONE',
    });
  });

  it('narrows the list to a prefilled exercise name, with that exercise first', () => {
    const result = filterExercises(exercises, 'Incline Dumbbell Press', []);

    expect(result.ids[0]).toBe('incline');
    expect(result.ids).not.toContain('situp');
    expect(result.suggestion).toBe('NONE');
  });

  it('keeps only exercises that work a filtered muscle', () => {
    expect(filterExercises(exercises, '', ['chest']).ids).toEqual(['bench', 'incline']);
  });

  it('suggests a new exercise when no name matches the query exactly', () => {
    const result = filterExercises(exercises, '  Cable Fly ', ['chest']);

    expect(result.suggestion).toMatchObject({ name: 'Cable Fly', primaryMuscles: ['chest'] });
  });
});

describe('searchSeedFor', () => {
  it('opens on the name of an exercise in the list, whatever its case', () => {
    expect(searchSeedFor(exercises, 'Incline Dumbbell Press')).toBe('Incline Dumbbell Press');
    expect(searchSeedFor(exercises, 'bench press')).toBe('bench press');
  });

  it('opens empty for a placeholder name that names no exercise', () => {
    expect(searchSeedFor(exercises, 'New Exercise')).toBe('');
    expect(searchSeedFor(exercises, 'Exercise 4')).toBe('');
    expect(searchSeedFor(exercises, '')).toBe('');
  });
});

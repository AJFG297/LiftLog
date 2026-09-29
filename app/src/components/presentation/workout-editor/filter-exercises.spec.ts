import { describe, expect, it } from 'vitest';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { filterExercises } from './filter-exercises';

function exercise(name: string, muscles: string[] = []): ExerciseDescriptor {
  return { name, muscles, force: null, level: '', mechanic: null, equipment: null, instructions: '', category: '' };
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

    expect(result.suggestion).toMatchObject({ name: 'Cable Fly', muscles: ['chest'] });
  });
});

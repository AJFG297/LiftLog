import { describe, expect, it } from 'vitest';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { muscleGroupOf, musclesForGroup } from '@/models/muscle-groups';

function exercise(name: string, primaryMuscles: string[], secondaryMuscles: string[] = []): ExerciseDescriptor {
  return {
    name,
    primaryMuscles,
    secondaryMuscles,
    equipment: null,
    force: null,
    level: '',
    mechanic: null,
    instructions: '',
    category: '',
  };
}

describe('muscleGroupOf', () => {
  it('files an exercise under its first muscle', () => {
    expect(muscleGroupOf(exercise('Bench Press', ['chest', 'triceps']))).toBe('chest');
    expect(muscleGroupOf(exercise('Barbell Row', ['middle back', 'biceps']))).toBe('back');
    expect(muscleGroupOf(exercise('Squat', ['Quadriceps']))).toBe('legs');
  });

  it('files an exercise by its primary muscles only', () => {
    expect(muscleGroupOf(exercise('Close-Grip Bench Press', ['triceps'], ['chest']))).toBe('arms');
    expect(muscleGroupOf(exercise('Helper only', [], ['chest']))).toBeUndefined();
  });

  it('files neck and no muscle under no chip', () => {
    expect(muscleGroupOf(exercise('Neck Bridge', ['neck']))).toBeUndefined();
    expect(muscleGroupOf(exercise('Mystery', []))).toBeUndefined();
  });
});

describe('musclesForGroup', () => {
  it('starts with the muscle only when the chip has one', () => {
    expect(musclesForGroup('chest')).toEqual(['chest']);
    expect(musclesForGroup('core')).toEqual(['abdominals']);
    expect(musclesForGroup('legs')).toEqual([]);
    expect(musclesForGroup(undefined)).toEqual([]);
  });
});

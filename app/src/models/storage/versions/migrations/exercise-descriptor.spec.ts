import { describe, expect, it } from 'vitest';
import { ExerciseDescriptorJSON as InitialExerciseDescriptorJSON } from '@/models/storage/versions/initial';
import { exerciseDescriptorMigrations } from './exercise-descriptor';

const stored: InitialExerciseDescriptorJSON = {
  name: 'Zercher Squat',
  force: 'push',
  level: 'beginner',
  mechanic: 'compound',
  equipment: 'barbell',
  muscles: ['quadriceps', 'glutes'],
  instructions: 'Hold the bar in your elbows',
  category: 'strength',
};

describe('exerciseDescriptorMigrations', () => {
  it('splits a stored muscle list into primary muscles, since it no longer says which were secondary', () => {
    expect(exerciseDescriptorMigrations.migrate(stored)).toEqual({
      version: 2,
      name: 'Zercher Squat',
      force: 'push',
      level: 'beginner',
      mechanic: 'compound',
      equipment: 'barbell',
      primaryMuscles: ['quadriceps', 'glutes'],
      secondaryMuscles: [],
      instructions: 'Hold the bar in your elbows',
      category: 'strength',
    });
  });

  it('keeps a custom exercise with no muscles at none', () => {
    const migrated = exerciseDescriptorMigrations.migrate({ ...stored, muscles: [] });

    expect(migrated.primaryMuscles).toEqual([]);
    expect(migrated.secondaryMuscles).toEqual([]);
  });

  it('leaves the latest shape as it is', () => {
    const latest = exerciseDescriptorMigrations.migrate(stored);

    expect(exerciseDescriptorMigrations.migrate({ ...latest, secondaryMuscles: ['glutes'] })).toEqual({
      ...latest,
      secondaryMuscles: ['glutes'],
    });
  });
});

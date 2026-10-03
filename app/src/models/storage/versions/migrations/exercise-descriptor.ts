import { createMigrations } from '@/models/storage/versions/migrations/migrator';
import { splitPrimaryMuscles } from '@/models/storage/versions/migrations/steps/split-primary-muscles';
import { ExerciseDescriptorJSON as InitialExerciseDescriptorJSON } from '@/models/storage/versions/initial';
import { ExerciseDescriptorJSON } from '@/models/storage/versions/latest/exercise-descriptor';

export const exerciseDescriptorMigrations = createMigrations<InitialExerciseDescriptorJSON>()
  .add((value) => ({ ...splitPrimaryMuscles(value), version: 2 as const }))
  .build<ExerciseDescriptorJSON>();

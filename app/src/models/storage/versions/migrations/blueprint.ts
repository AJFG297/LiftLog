import {
  ProgramBlueprintJSON as InitialProgramBlueprintJSON,
  SessionBlueprintJSON as InitialSessionBlueprintJSON,
} from '@/models/storage/versions/initial';
import { ProgramBlueprintJSON, SessionBlueprintJSON } from '@/models/storage/versions/latest/blueprint';
import { createMigrations } from './migrator';
import { addProgressiveOverloadToExercise } from '@/models/storage/versions/migrations/steps/add-progressive-overload';
import { repsPerSetToRepsConfig } from '@/models/storage/versions/migrations/steps/reps-per-set-to-reps-config';
import { addUsesBodyweight } from '@/models/storage/versions/migrations/steps/add-uses-bodyweight';
import { repsConfigToPlannedSets } from '@/models/storage/versions/migrations/steps/reps-config-to-planned-sets';
import { progressiveOverloadToRules } from '@/models/storage/versions/migrations/steps/progressive-overload-to-rules';
import { addPlannedWarmupSets } from '@/models/storage/versions/migrations/steps/add-warmup-sets';
import { addPlannedSetKinds } from '@/models/storage/versions/migrations/steps/add-set-kinds';

export const sessionBlueprintMigrations = createMigrations<InitialSessionBlueprintJSON>()
  .add((value) => ({
    version: 2 as const,
    exercises: value.exercises.map((x) =>
      x.type === 'WeightedExerciseBlueprint' ? addProgressiveOverloadToExercise(x) : x,
    ),
    name: value.name,
    notes: value.notes,
  }))
  .add((value) => ({
    version: 3 as const,
    exercises: value.exercises.map((x) => (x.type === 'WeightedExerciseBlueprint' ? repsPerSetToRepsConfig(x) : x)),
    name: value.name,
    notes: value.notes,
  }))
  .add((value) => ({
    version: 4 as const,
    exercises: value.exercises.map((x) => (x.type === 'WeightedExerciseBlueprint' ? addUsesBodyweight(x) : x)),
    name: value.name,
    notes: value.notes,
  }))
  .add((value) => ({
    version: 5 as const,
    exercises: value.exercises.map((x) => (x.type === 'WeightedExerciseBlueprint' ? repsConfigToPlannedSets(x) : x)),
    name: value.name,
    notes: value.notes,
  }))
  .add((value) => ({
    version: 6 as const,
    exercises: value.exercises.map((x) => (x.type === 'WeightedExerciseBlueprint' ? progressiveOverloadToRules(x) : x)),
    name: value.name,
    notes: value.notes,
  }))
  .add((value) => ({
    version: 7 as const,
    exercises: value.exercises.map((x) => (x.type === 'WeightedExerciseBlueprint' ? addPlannedWarmupSets(x) : x)),
    name: value.name,
    notes: value.notes,
  }))
  .add((value) => ({
    version: 8 as const,
    exercises: value.exercises.map((x) => (x.type === 'WeightedExerciseBlueprint' ? addPlannedSetKinds(x) : x)),
    name: value.name,
    notes: value.notes,
  }))
  // `exerciseId` is optional, so older blueprints already fit. They come out unlinked, and the
  // LINK_EXERCISE_IDS data migration or the importer that read them links them by name.
  .add((value) => ({
    ...value,
    version: 9 as const,
  }))
  .build<SessionBlueprintJSON>();

export const programBlueprintMigrations = createMigrations<InitialProgramBlueprintJSON>({ pseudoMigrateUntil: 3 })
  .dependsOn({
    sessions: sessionBlueprintMigrations,
  })
  .build<ProgramBlueprintJSON>();

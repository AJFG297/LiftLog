import { ExerciseDescriptorJSON } from './storage/versions/latest';

export interface ExerciseDescriptor {
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  /** The muscles it mainly works. A custom exercise's muscles are all primary. */
  primaryMuscles: string[];
  /** The muscles it helps; a set counts as half for these in sets per muscle. */
  secondaryMuscles: string[];
  instructions: string;
  category: string;
}

export function fromExerciseDescriptorJSON(json: ExerciseDescriptorJSON): ExerciseDescriptor {
  return {
    name: json.name,
    force: json.force,
    level: json.level,
    mechanic: json.mechanic,
    equipment: json.equipment,
    primaryMuscles: json.primaryMuscles,
    secondaryMuscles: json.secondaryMuscles,
    instructions: json.instructions,
    category: json.category,
  };
}

export function toExerciseDescriptorJSON(value: ExerciseDescriptor): ExerciseDescriptorJSON {
  return { version: 2, ...value, muscles: musclesOf(value) };
}

/** Every muscle an exercise works, primary ones first, each once. */
export function musclesOf(exercise: ExerciseDescriptor): string[] {
  return [...new Set([...exercise.primaryMuscles, ...exercise.secondaryMuscles])];
}

/**
 * The exercise with `muscles` as its whole list, as the muscle editor gives it: a muscle it already had keeps
 * its role, and one added is primary.
 */
export function withMuscles(exercise: ExerciseDescriptor, muscles: readonly string[]): ExerciseDescriptor {
  const secondary = new Set(exercise.secondaryMuscles);
  const primary = new Set(exercise.primaryMuscles);
  return {
    ...exercise,
    primaryMuscles: muscles.filter((muscle) => primary.has(muscle) || !secondary.has(muscle)),
    secondaryMuscles: muscles.filter((muscle) => !primary.has(muscle) && secondary.has(muscle)),
  };
}

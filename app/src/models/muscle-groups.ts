import { ExerciseDescriptor } from '@/models/exercise-models';

/** The muscle chips, in the order they're shown after All. */
export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

// Keyed by the catalog's muscle vocabulary. Neck belongs to no chip, so it only shows under All.
const MUSCLE_GROUP_OF: Record<string, MuscleGroup> = {
  chest: 'chest',
  lats: 'back',
  'middle back': 'back',
  'lower back': 'back',
  traps: 'back',
  shoulders: 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  quadriceps: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  adductors: 'legs',
  abductors: 'legs',
  abdominals: 'core',
};

/**
 * The chip an exercise files under, from its first primary muscle. Filing by any muscle would put every press
 * and row under Arms through their secondary muscles.
 */
export function muscleGroupOf(exercise: ExerciseDescriptor): MuscleGroup | undefined {
  const first = exercise.primaryMuscles[0]?.trim().toLowerCase();
  return first === undefined ? undefined : MUSCLE_GROUP_OF[first];
}

/** The muscle a new exercise starts with when the Create was reached through a one-muscle chip. */
export function musclesForGroup(group: MuscleGroup | undefined): string[] {
  const muscles = Object.entries(MUSCLE_GROUP_OF)
    .filter(([, of]) => of === group)
    .map(([muscle]) => muscle);
  return muscles.length === 1 ? muscles : [];
}

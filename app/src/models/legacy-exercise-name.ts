import { ExerciseId, STUB_EXERCISE_NAMESPACE } from '@/models/blueprint-models';
import { uuidFromName } from '@/utils/uuid';

/**
 * The name fold before PM-5, frozen: it stripped a trailing "es", or else a trailing "s", so `Lunges`
 * became `lung` and `Bench Press` became `bench pres`. Stubs stored before the fix carry ids derived
 * from it, which is how the merge migration tells a stub from a user's own exercise. Never change it.
 */
export function legacyNormalizeExerciseName(name: string): string {
  if (!name) {
    return '';
  }
  const lowerName = name.toLowerCase().trim().replace(/flies/g, 'flys').replace(/flyes/g, 'flys');
  return lowerName.endsWith('es')
    ? lowerName.slice(0, -2)
    : lowerName.endsWith('s')
      ? lowerName.slice(0, -1)
      : lowerName;
}

/** `stubExerciseId` as it was derived before PM-5. */
export function legacyStubExerciseId(name: string): ExerciseId {
  return uuidFromName(legacyNormalizeExerciseName(name), STUB_EXERCISE_NAMESPACE);
}


import { ExerciseId, STUB_EXERCISE_NAMESPACE } from '@/models/blueprint-models';
import { uuidFromName } from '@/utils/uuid';

/**
 * The old name fold, frozen: it stripped a trailing "es", or else a trailing "s", so `Lunges` became `lung`
 * and `Bench Press` became `bench pres`. Stubs made under it carry ids derived from it, which is how the
 * plural merge (`planExerciseMerges`) tells a stub from a user's own exercise. Never change it.
 *
 * Only data from before `MERGE_PLURAL_EXERCISE_NAMES` holds such ids: a phone that hasn't run it yet, or a
 * backup taken before it ran, which a restore merges on the device. Delete this file, with the old-fold
 * checks in `planExerciseMerges` and the dry run's legacy linking, once neither can reach the app: when
 * restores refuse backups from before the merge (as `importDataSql` refuses pre-relational ones) and no
 * supported build predates it.
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

/** `stubExerciseId` under the old fold: the id a stub made before the plural merge has. */
export function legacyStubExerciseId(name: string): ExerciseId {
  return uuidFromName(legacyNormalizeExerciseName(name), STUB_EXERCISE_NAMESPACE);
}

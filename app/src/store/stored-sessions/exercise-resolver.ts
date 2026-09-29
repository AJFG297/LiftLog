import { ExerciseDescriptor } from '@/models/exercise-models';
import { ExerciseResolver } from '@/models/exercise-resolver';
import { loadBuiltInExerciseNames } from '@/services/exercise-catalog';
import { Logger } from '@/services/logger';
import type { RootState } from '@/store';

interface StoreAccess {
  getState: () => RootState;
  condition: (predicate: (action: unknown, state: RootState) => boolean) => Promise<boolean>;
}

/**
 * A resolver over the user's exercises as they stand, once they have loaded - before that, every one of
 * their names would get a stub. `alsoSaved` adds exercises arriving alongside the names being resolved,
 * such as the ones in a backup being restored.
 */
export async function createExerciseResolver(
  { getState, condition }: StoreAccess,
  logger: Logger,
  alsoSaved: Record<string, ExerciseDescriptor> = {},
): Promise<ExerciseResolver> {
  if (!getState().storedSessions.isHydrated) {
    await condition((_, state) => state.storedSessions.isHydrated);
  }
  return new ExerciseResolver({
    savedExercises: { ...getState().storedSessions.savedExercises, ...alsoSaved },
    builtInNames: await loadBuiltInExerciseNames(),
    onAmbiguous: logAmbiguousInDev(logger),
  });
}

export function logAmbiguousInDev(logger: Logger) {
  return __DEV__
    ? (name: string, candidates: string[], chosen: string) =>
        logger.warn(`Exercise name "${name}" matches ${candidates.length} exercises; linked to ${chosen}`, {
          candidates,
        })
    : undefined;
}

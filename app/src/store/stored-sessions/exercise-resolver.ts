import { ExerciseDescriptor } from '@/models/exercise-models';
import { ExerciseResolver, logAmbiguousInDev } from '@/models/exercise-resolver';
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
  const builtInNames = await loadBuiltInExerciseNames();
  // Read after the catalog loads, so an exercise added meanwhile is matched rather than stubbed.
  return new ExerciseResolver({
    savedExercises: { ...getState().storedSessions.savedExercises, ...alsoSaved },
    builtInNames,
    onAmbiguous: logAmbiguousInDev(logger),
  });
}

import type { ExerciseId } from '@/models/blueprint-models';
import type { KeyValueStore } from '@/services/key-value-store';

// Built-ins the user deleted, so they stay hidden across restarts and locale switches. Kept on the device
// only: a backup doesn't carry it.
const storageKey = 'HiddenBuiltInExerciseIdList';

/** The built-ins the user deleted. The one reader of the stored list. */
export async function readHiddenBuiltInIds(keyValueStore: Pick<KeyValueStore, 'getItem'>): Promise<ExerciseId[]> {
  return JSON.parse((await keyValueStore.getItem(storageKey)) ?? '[]') as ExerciseId[];
}

export function writeHiddenBuiltInIds(
  keyValueStore: Pick<KeyValueStore, 'setItem'>,
  ids: readonly ExerciseId[],
): Promise<void> {
  return keyValueStore.setItem(storageKey, JSON.stringify(ids));
}

import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { KeyValueStore } from '../key-value-store';
import { writeAtomically } from '@/db/helpers';
import { dataMigrationsSchema, exercisesSchema } from '@/db/schema';
import { descriptorsEqual } from '@/models/exercise-models';
import { exerciseDescriptorMigrations } from '@/models/storage/versions/migrations';
import { loadCanonicalBuiltInExercises } from '@/services/exercise-catalog';
import { writeHiddenBuiltInIds } from '@/services/hidden-built-in-exercises';

export const dedupeBuiltInExercisesDataMigration = 'DEDUPE_BUILTIN_EXERCISES';

// Legacy list of every built-in that was ever imported into the DB.
const addedBuiltInExerciseIdsStorageKey = 'AddedBuiltInExerciseIdList';

/**
 * Older versions copied all built-in exercises into the DB. Built-ins are now served from the bundled
 * catalog, so remove the un-edited copies (keeping user edits as overrides) and tombstone the ones the
 * user had deleted so they don't reappear from the catalog.
 */
export async function dedupeBuiltInExercises(db: ExpoSQLiteDatabase, keyValueStore: KeyValueStore) {
  const canonical = await loadCanonicalBuiltInExercises();
  const rows = await db.select().from(exercisesSchema);
  const presentIds = new Set(rows.map((r) => r.id));

  const idsToDelete = rows
    .filter((row) => {
      const canonicalDescriptor = canonical[row.id];
      return (
        canonicalDescriptor && descriptorsEqual(exerciseDescriptorMigrations.migrate(row.payload), canonicalDescriptor)
      );
    })
    .map((row) => row.id);

  const added = JSON.parse((await keyValueStore.getItem(addedBuiltInExerciseIdsStorageKey)) ?? '[]') as string[];
  const hidden = added.filter((id) => canonical[id] && !presentIds.has(id));

  await writeAtomically(db, (tx) => [
    ...idsToDelete.map((id) => tx.delete(exercisesSchema).where(eq(exercisesSchema.id, id))),
    tx.insert(dataMigrationsSchema).values({ id: dedupeBuiltInExercisesDataMigration }),
  ]);
  await writeHiddenBuiltInIds(keyValueStore, hidden);
}

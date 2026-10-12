import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import type { RootState } from '@/store';
import type { KeyValueStore } from '@/services/key-value-store';
import { exercisesSchema } from '@/db/schema';
import { writeAtomically } from '@/db/helpers';
import { toExerciseDescriptorJSON } from '@/models/exercise-models';
import { writeHiddenBuiltInIds } from '@/services/hidden-built-in-exercises';

export class DescriptorWriter {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly db: ExpoSQLiteDatabase,
    private readonly getState: () => RootState,
    private readonly keyValueStore: KeyValueStore,
  ) {}

  run<T>(operation: (flush: () => Promise<void>) => Promise<T>): Promise<T> {
    const run = this.tail.then(() => operation(() => this.flushCurrent()));
    this.tail = run.catch(() => undefined);
    return run;
  }

  flush(): Promise<void> {
    return this.run((flush) => flush());
  }

  private async flushCurrent(): Promise<void> {
    await writeAtomically(this.db, (tx) => {
      const { savedExercises } = this.getState().storedSessions;
      const rows = Object.entries(savedExercises).map(([id, exercise]) => ({
        id,
        payload: toExerciseDescriptorJSON(exercise),
      }));
      return [tx.delete(exercisesSchema), ...(rows.length ? [tx.insert(exercisesSchema).values(rows)] : [])];
    });
    await writeHiddenBuiltInIds(this.keyValueStore, this.getState().storedSessions.hiddenBuiltInIds);
  }
}

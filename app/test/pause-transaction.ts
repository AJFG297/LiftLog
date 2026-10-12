import { vi } from 'vitest';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

export function pauseNextTransaction(
  db: ExpoSQLiteDatabase,
  {
    entered,
    release,
  }: {
    entered: PromiseWithResolvers<void>;
    release: PromiseWithResolvers<void>;
  },
): void {
  const transaction = db.transaction.bind(db);
  vi.spyOn(db, 'transaction').mockImplementationOnce(async (...args) => {
    entered.resolve();
    await release.promise;
    return transaction(...args);
  });
}

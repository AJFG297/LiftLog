import { describe, expect, it } from 'vitest';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { writeAtomically } from '@/db/helpers';

/** The expo-sqlite driver's shape: `transaction()` commits as soon as its callback returns. */
function syncDriver(log: string[]) {
  return {
    transaction(callback: (tx: unknown) => unknown) {
      log.push('begin');
      const result = callback({});
      log.push('commit');
      return result;
    },
  } as unknown as ExpoSQLiteDatabase;
}

/** The libsql driver's shape: `transaction()` awaits its callback before committing. */
function asyncDriver(log: string[]) {
  return {
    async transaction(callback: (tx: unknown) => Promise<unknown>) {
      log.push('begin');
      await callback({});
      log.push('commit');
    },
  } as unknown as ExpoSQLiteDatabase;
}

describe('writeAtomically', () => {
  it('runs every statement before a synchronous driver commits', async () => {
    const log: string[] = [];

    await writeAtomically(syncDriver(log), () => [{ run: () => log.push('a') }, { run: () => log.push('b') }]);

    expect(log).toEqual(['begin', 'a', 'b', 'commit']);
  });

  it('runs statements in order before an async driver commits', async () => {
    const log: string[] = [];
    const slow = (name: string, ms: number) => ({
      run: () => new Promise<void>((resolve) => setTimeout(() => resolve(void log.push(name)), ms)),
    });

    await writeAtomically(asyncDriver(log), () => [slow('a', 10), slow('b', 0), slow('c', 5)]);

    expect(log).toEqual(['begin', 'a', 'b', 'c', 'commit']);
  });
});

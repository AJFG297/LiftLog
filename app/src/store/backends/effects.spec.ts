import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { eq } from 'drizzle-orm';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { applyBackendsEffects } from '@/store/backends/effects';
import { putBackend, removeBackend } from '@/store/backends';
import { createAddEffectTestBed } from '@/utils/__test__/add-effect-testbed';
import { backendAssignmentsSchema, backendHeadersSchema, backendsSchema } from '@/db/schema';
import type { Backend } from '@/models/backend';

async function createTestDb(): Promise<ExpoSQLiteDatabase> {
  const db = drizzle(await openDatabaseAsync(':memory:'));
  await new DatabaseMigrationService(db, { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never, {
    importOldData: async () => {},
  }).migrate();
  return db;
}

function backend(overrides: Partial<Backend> = {}): Backend {
  return { id: 'custom', name: 'Custom', url: 'https://example.test', kind: 'liftlog', headers: [], ...overrides };
}

describe('backends effects persistence', () => {
  let db: ExpoSQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  function bed() {
    const testBed = createAddEffectTestBed({ initialState: { backends: { isHydrated: true } }, services: { db } });
    applyBackendsEffects(testBed.addEffect);
    return testBed;
  }

  const storedBackend = async () => (await db.select().from(backendsSchema).where(eq(backendsSchema.id, 'custom')))[0];
  const storedHeaders = async () =>
    (await db.select().from(backendHeadersSchema).where(eq(backendHeadersSchema.backendId, 'custom'))).map(
      ({ name, value }) => ({ name, value }),
    );

  describe('putBackend', () => {
    it('replaces the headers, dropping blank names and trimming the rest', async () => {
      const testBed = bed();
      await testBed.dispatchHandled(putBackend(backend({ headers: [{ name: 'Old', value: '1' }] })));

      await testBed.dispatchHandled(
        putBackend(
          backend({
            name: 'Renamed',
            headers: [
              { name: ' Authorization ', value: 'token' },
              { name: '  ', value: 'ignored' },
            ],
          }),
        ),
      );

      expect((await storedBackend())?.name).toBe('Renamed');
      expect(await storedHeaders()).toEqual([{ name: 'Authorization', value: 'token' }]);
    });

    it('keeps the old backend and headers when the new headers cannot be written', async () => {
      const testBed = bed();
      await testBed.dispatchHandled(putBackend(backend({ headers: [{ name: 'Old', value: '1' }] })));

      // Both trim to `X`, which violates the (backendId, name) primary key after the old headers are deleted.
      await testBed.dispatchHandled(
        putBackend(
          backend({
            name: 'Renamed',
            headers: [
              { name: 'X', value: 'a' },
              { name: ' X ', value: 'b' },
            ],
          }),
        ),
      );

      expect((await storedBackend())?.name).toBe('Custom');
      expect(await storedHeaders()).toEqual([{ name: 'Old', value: '1' }]);
    });
  });

  describe('removeBackend', () => {
    it('removes the backend, its headers and its assignments', async () => {
      const testBed = bed();
      await testBed.dispatchHandled(putBackend(backend({ headers: [{ name: 'Old', value: '1' }] })));
      await db.insert(backendAssignmentsSchema).values({ feature: 'backup', backendId: 'custom' });

      await testBed.dispatchHandled(removeBackend('custom'));

      expect(await storedBackend()).toBeUndefined();
      expect(await storedHeaders()).toEqual([]);
      expect(
        await db.select().from(backendAssignmentsSchema).where(eq(backendAssignmentsSchema.backendId, 'custom')),
      ).toEqual([]);
    });
  });
});

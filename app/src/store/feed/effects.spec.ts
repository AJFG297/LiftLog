import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { applyFeedEffects } from '@/store/feed/effects';
import { putFollowedUser, setFollowRequests } from '@/store/feed';
import { createAddEffectTestBed } from '@/utils/__test__/add-effect-testbed';
import { feedFollowedUsersSchema, feedFollowRequestsSchema, feedPendingUsersSchema } from '@/db/schema';
import { FollowedFeedUser, FollowRequest, FollowRequestInboxMessage, PendingFeedUser } from '@/models/feed-models';
import type { RsaPublicKey } from '@/models/encryption-models';

const publicKey: RsaPublicKey = { spkiPublicKeyBytes: new Uint8Array([1, 2, 3]) };
const aesKey = { value: new Uint8Array([4, 5, 6]) };

async function createTestDb(): Promise<ExpoSQLiteDatabase> {
  const db = drizzle(await openDatabaseAsync(':memory:'));
  await new DatabaseMigrationService(db, { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never, {
    importOldData: async () => {},
  }).migrate();
  return db;
}

function followRequest(senderUserId: string, name: string) {
  return new FollowRequestInboxMessage(senderUserId, new Uint8Array(), new FollowRequest(name));
}

describe('feed effects persistence', () => {
  let db: ExpoSQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  function bed() {
    const testBed = createAddEffectTestBed({ services: { db } });
    applyFeedEffects(testBed.addEffect);
    return testBed;
  }

  describe('setFollowRequests', () => {
    it('replaces the stored follow requests', async () => {
      const testBed = bed();
      await testBed.dispatchHandled(setFollowRequests([followRequest('a', 'Ann'), followRequest('b', 'Bob')]));

      await testBed.dispatchHandled(setFollowRequests([followRequest('b', 'Bobby'), followRequest('c', 'Cat')]));

      const rows = await db.select().from(feedFollowRequestsSchema);
      expect(rows.map((r) => r.id).sort()).toEqual(['b', 'c']);
      const bob = FollowRequestInboxMessage.fromJSON(rows.find((r) => r.id === 'b')!.payload);
      expect(bob.payload.name).toBe('Bobby');
    });

    it('clears the stored follow requests when given none', async () => {
      const testBed = bed();
      await testBed.dispatchHandled(setFollowRequests([followRequest('a', 'Ann')]));

      await testBed.dispatchHandled(setFollowRequests([]));

      expect(await db.select().from(feedFollowRequestsSchema)).toHaveLength(0);
    });
  });

  describe('putFollowedUser', () => {
    it('moves a user from pending to followed once they accept', async () => {
      const testBed = bed();
      await testBed.dispatchHandled(putFollowedUser(new PendingFeedUser('u1', publicKey, 'Bob')));

      expect((await db.select().from(feedPendingUsersSchema)).map((r) => r.id)).toEqual(['u1']);
      expect(await db.select().from(feedFollowedUsersSchema)).toHaveLength(0);

      await testBed.dispatchHandled(
        putFollowedUser(new FollowedFeedUser('u1', publicKey, 'Bob', undefined, aesKey, 'secret')),
      );

      expect(await db.select().from(feedPendingUsersSchema)).toHaveLength(0);
      const followed = await db.select().from(feedFollowedUsersSchema);
      expect(followed.map((r) => r.id)).toEqual(['u1']);
      expect(followed[0]?.payload).toMatchObject({ followSecret: 'secret' });
    });

    it('overwrites a followed user that is already stored', async () => {
      const testBed = bed();
      await testBed.dispatchHandled(
        putFollowedUser(new FollowedFeedUser('u1', publicKey, 'Bob', undefined, aesKey, 'old-secret')),
      );

      await testBed.dispatchHandled(
        putFollowedUser(new FollowedFeedUser('u1', publicKey, 'Bob', undefined, aesKey, 'new-secret')),
      );

      const followed = await db.select().from(feedFollowedUsersSchema);
      expect(followed).toHaveLength(1);
      expect(followed[0]?.payload).toMatchObject({ followSecret: 'new-secret' });
    });
  });
});

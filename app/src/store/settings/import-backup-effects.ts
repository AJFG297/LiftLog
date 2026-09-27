import { Logger } from '@/services/logger';
import { showSnackbar } from '@/store/app';
import { AddEffectFn } from '@/store/store';
import { upsertSavedPlans } from '@/store/program';
import { beginFeedImport, importBackupData, importData, importDataSql } from '@/store/settings';
import { upsertExercises, upsertStoredSessions } from '@/store/stored-sessions';
import { streamToUint8Array, writeInChunks } from '@/utils/stream';
import { sleep } from '@/utils/sleep';
import { ProgramBlueprint } from '@/models/blueprint-models';
import {
  FeedIdentity,
  FollowerFeedUser,
  FollowRequestInboxMessage,
  fromFeedUserJSON,
  SessionUserEvent,
} from '@/models/feed-models';
import { deserializeDatabaseAsync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { FeedBackupData } from '@/models/backup';
import {
  exercisesSchema,
  feedFollowedUsersSchema,
  feedFollowerUsersSchema,
  feedFollowRequestsSchema,
  feedIdentitySchema,
  feedItemsSchema,
  feedPendingUsersSchema,
  programsSchema,
} from '@/db/schema';
import { WorkoutRepository } from '@/services/workout-repository';
import { toRecord } from '@/utils/reduce';
import {
  sessionUserEventMigrations,
  exerciseDescriptorMigrations,
  programBlueprintMigrations,
} from '@/models/storage/versions/migrations';
import { FeedUserJSON } from '@/models/storage/versions/latest';
import { fromExerciseDescriptorJSON } from '@/models/exercise-models';

export function addImportBackupEffects(addEffect: AddEffectFn) {
  addEffect(importData, async (_, { dispatch, extra: { filePickerService, logger, tolgee } }) => {
    const file = await filePickerService.pickFile();
    if (!file) {
      return;
    }
    dispatch(
      showSnackbar({
        text: tolgee.t('Beginning restore'),
      }),
    );
    await sleep(200);
    const gunzipped = await unGzipIfZipped(file.bytes, logger);
    try {
      const db = await deserializeDatabaseAsync(gunzipped);
      dispatch(importDataSql({ db }));
    } catch (err) {
      logger.warn('Failed to deserialize sql', { err });
      dispatch(
        showSnackbar({
          text: 'Could not import data: Unexpected format.',
        }),
      );
    }
  });

  addEffect(importBackupData, async ({ payload }, { dispatch }) => {
    const { workouts, programs, exercises, feed, successMessage } = payload;
    dispatch(upsertStoredSessions(workouts));
    dispatch(upsertSavedPlans(programs));
    if (exercises) {
      dispatch(upsertExercises(exercises));
    }
    dispatch(
      showSnackbar({
        text: successMessage,
      }),
    );
    if (feed) {
      dispatch(beginFeedImport(feed));
    }
  });

  addEffect(importDataSql, async (action, { dispatch, extra: { logger, tolgee } }) => {
    try {
      const {
        payload: { db: backupDb },
      } = action;
      // Backups from before workouts went relational keep them in `session`, which migration 0009
      // drops. Old formats are unsupported (ADR-0001), so refuse rather than restore everything else
      // with no workouts.
      const legacySessionTable = await backupDb.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
        ['session'],
      );
      if (legacySessionTable.length) {
        logger.warn('Rejected a pre-relational backup', { reason: 'it has a session table' });
        dispatch(
          showSnackbar({
            text: tolgee.t("This backup is from an older version of LiftLog and can't be restored."),
          }),
        );
        return;
      }
      const drizzleBackupDb = drizzle(backupDb);
      const migrator = new DatabaseMigrationService(drizzleBackupDb, logger, {
        importOldData: async () => {},
      });

      await migrator.migrate();
      // A backup's in-progress workout comes back as history: restoring never resumes a workout.
      const { workouts } = await new WorkoutRepository(drizzleBackupDb).loadAll();
      const programs = (await drizzleBackupDb.select().from(programsSchema)).reduce(
        toRecord(
          (x) => x.id,
          (x) => ProgramBlueprint.fromJSON(programBlueprintMigrations.migrate(x.payload)),
        ),
        {},
      );
      const exercises = (await drizzleBackupDb.select().from(exercisesSchema)).reduce(
        toRecord(
          (x) => x.id,
          (x) => fromExerciseDescriptorJSON(exerciseDescriptorMigrations.migrate(x.payload)),
        ),
        {},
      );
      const feedIdentityDb = (await drizzleBackupDb.select().from(feedIdentitySchema)).at(0);

      let feed: FeedBackupData | undefined;
      if (feedIdentityDb) {
        feed = {
          identity: FeedIdentity.fromJSON(feedIdentityDb.payload),
          feedItems: (await drizzleBackupDb.select().from(feedItemsSchema)).map((x) =>
            SessionUserEvent.fromJSON(sessionUserEventMigrations.migrate(x.payload)),
          ),
          followRequests: (await drizzleBackupDb.select().from(feedFollowRequestsSchema)).map((x) =>
            FollowRequestInboxMessage.fromJSON(x.payload),
          ),
          followed: (
            (await drizzleBackupDb.select().from(feedFollowedUsersSchema)) as {
              payload: FeedUserJSON;
            }[]
          )
            .concat(await drizzleBackupDb.select().from(feedPendingUsersSchema))
            .map((x) => fromFeedUserJSON(x.payload)),
          followers: (await drizzleBackupDb.select().from(feedFollowerUsersSchema)).map((x) =>
            FollowerFeedUser.fromJSON(x.payload),
          ),
        };
      }

      dispatch(
        importBackupData({
          programs,
          exercises,
          workouts,
          feed,
          successMessage: tolgee.t('Restore complete!'),
        }),
      );
    } finally {
      await action.payload.db.closeAsync();
    }
  });
}

async function unGzipIfZipped(bytes: Uint8Array, logger: Logger): Promise<Uint8Array> {
  try {
    const stream = new DecompressionStream('gzip');

    const writer = stream.writable.getWriter();

    // Start reading from the stream immediately
    const decompressPromise = streamToUint8Array(stream.readable);
    await writeInChunks(writer, bytes);
    await writer.close();
    const gunzipped = await decompressPromise;
    return gunzipped;
  } catch (e) {
    logger.warn('Could not unzip bytes', e);
    return bytes;
  }
}

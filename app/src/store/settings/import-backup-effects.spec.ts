import {
  beginFeedImport,
  importBackupData,
  importData,
  importDataProto,
  importDataSql,
  setUseImperialUnits,
} from '@/store/settings';
import { addImportBackupEffects } from '@/store/settings/import-backup-effects';
import { createAddEffectTestBed } from '@/utils/__test__/add-effect-testbed';
import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'path';
import { FeedBackupData } from '@/models/backup';
import { FeedIdentity } from '@/models/feed-models';
import { ProgramBlueprint } from '@/models/blueprint-models';
import { EmptySession, Session } from '@/models/session-models';
import { uuid } from '@/utils/uuid';
import { selectSession, upsertExercises, upsertStoredSessions } from '@/store/stored-sessions';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import { createEffectStore } from '@/utils/__test__/effect-store';
import { openDatabaseAsync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { OffsetDateTime } from '@js-joda/core';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import {
  migrateNilWeightUnits,
  migrateNilWeightUnitsDataMigration,
} from '@/services/data-migrations/migrate-nil-weight-units';
import { dataMigrationsSchema, sessionsSchema } from '@/db/schema';
import { RecordedWeightedExerciseJSON, SessionJSON } from '@/models/storage/versions/latest';
import { RecordedWeightedExercise } from '@/models/session-models';
import { Weight } from '@/models/weight';
import { sleep } from '@/utils/sleep';
import { filledPotentialSet, makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { upsertSavedPlans } from '@/store/program';
import { showSnackbar } from '@/store/app';

describe('import-backup-effects', () => {
  it('dispatches a valid import when the sqlite db is there', async () => {
    const realBytes = await readFile(resolve(__dirname, '../../utils/__test__/export.liftlogbackup.sqlite.gz'));
    const testBed = createAddEffectTestBed({
      services: {
        filePickerService: {
          pickFile: vi.fn().mockResolvedValue({ bytes: realBytes }),
        },
        tolgee: { t: (s: string) => s },
      },
    });

    addImportBackupEffects(testBed.addEffect);
    await testBed.dispatchHandled(importData());
    const importDataSqlAction = testBed.getDispatchedAction(importDataSql);

    await testBed.dispatchHandled(importDataSqlAction);

    const dispatchedImport = testBed.getDispatchedAction(importBackupData);
    expect(dispatchedImport.payload.workouts).toHaveLength(420);
    expect(dispatchedImport.payload.feed).toBeDefined();
    expect(Object.values(dispatchedImport.payload.programs)).toHaveLength(13);
    expect(Object.values(dispatchedImport.payload.exercises ?? {})).toHaveLength(962);
    expect(dispatchedImport.payload.successMessage).toBe('Restore complete!');
  });

  it('dispatches a valid import when it is a proto', async () => {
    const realBytes = await readFile(resolve(__dirname, '../../utils/__test__/export.liftlogbackup.protobuf.gz'));
    const testBed = createAddEffectTestBed({
      services: {
        filePickerService: {
          pickFile: vi.fn().mockResolvedValue({ bytes: realBytes }),
        },
        tolgee: { t: (s: string) => s },
      },
    });

    addImportBackupEffects(testBed.addEffect);
    await testBed.dispatchHandled(importData());
    const importDataSqlAction = testBed.getDispatchedAction(importDataProto);

    await testBed.dispatchHandled(importDataSqlAction);

    const dispatchedImport = testBed.getDispatchedAction(importBackupData);
    expect(dispatchedImport.payload.workouts).toHaveLength(85);
    expect(dispatchedImport.payload.feed).toBeUndefined();
    expect(Object.values(dispatchedImport.payload.programs)).toHaveLength(0);
    expect(dispatchedImport.payload.successMessage).toBe('Restore complete!');
  });
  it('dispatches the appropriate actions when importing', async () => {
    const testBed = createAddEffectTestBed({
      initialState: { settings: { useImperialUnits: false } },
      services: {
        tolgee: { t: (s: string) => s },
      },
    });
    addImportBackupEffects(testBed.addEffect);

    const mockWorkouts = [EmptySession, EmptySession.with({ id: uuid() })] as Session[];
    const mockPrograms = {} as Record<string, ProgramBlueprint>;
    const mockExercises = {
      custom: {
        name: 'Custom exercise',
        force: null,
        level: '',
        mechanic: null,
        equipment: null,
        muscles: [],
        instructions: '',
        category: '',
      },
    };
    const mockFeed: FeedBackupData = {
      identity: {} as FeedIdentity,
      feedItems: [],
      followRequests: [],
      followed: [],
      followers: [],
    };

    await testBed.dispatchHandled(
      importBackupData({
        workouts: mockWorkouts,
        programs: mockPrograms,
        exercises: mockExercises,
        feed: mockFeed,
        successMessage: 'Restore complete!',
      }),
    );

    expect(testBed.getDispatchedAction(upsertStoredSessions).payload).toEqual(mockWorkouts);
    expect(testBed.getDispatchedAction(upsertSavedPlans).payload).toBe(mockPrograms);
    expect(testBed.getDispatchedAction(upsertExercises).payload).toBe(mockExercises);
    expect(testBed.getDispatchedAction(showSnackbar).payload.text).toBe('Restore complete!');
    expect(testBed.getDispatchedAction(beginFeedImport).payload).toBe(mockFeed);
  });

  it('shows the provided successMessage', async () => {
    const testBed = createAddEffectTestBed({
      initialState: { settings: { useImperialUnits: false } },
      services: {
        tolgee: { t: (s: string) => s },
      },
    });
    addImportBackupEffects(testBed.addEffect);

    await testBed.dispatchHandled(
      importBackupData({
        workouts: [],
        programs: {},
        successMessage: 'Imported 3 workout(s)',
      }),
    );

    expect(testBed.getDispatchedAction(showSnackbar).payload.text).toBe('Imported 3 workout(s)');
  });

  it('does not dispatch beginFeedImport when feed is absent', async () => {
    const testBed = createAddEffectTestBed({
      initialState: { settings: { useImperialUnits: false } },
      services: {
        tolgee: { t: (s: string) => s },
      },
    });
    addImportBackupEffects(testBed.addEffect);

    await testBed.dispatchHandled(
      importBackupData({
        workouts: [],
        programs: {},
        feed: undefined,
        successMessage: 'Restore complete!',
      }),
    );

    testBed.expectNotDispatched(beginFeedImport);
  });
});

describe('importBackupData against a real database', () => {
  async function setup() {
    const expoDb = await openDatabaseAsync(':memory:');
    const db = drizzle(expoDb);
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      // A write that takes a moment, as it does on a device with a real history.
      time: async (_: string, action: () => unknown) => {
        await sleep(5);
        return action();
      },
    };
    const preferenceService = { getUseImperialUnits: () => Promise.resolve(false) };
    const databaseMigrationService = new DatabaseMigrationService(db, logger as never, {
      // The one data migration an import can re-trigger, run the way DatabaseImportService does.
      importOldData: async () => {
        const run = (await db.select().from(dataMigrationsSchema)).map((x) => x.id);
        if (!run.includes(migrateNilWeightUnitsDataMigration)) {
          await migrateNilWeightUnits(db, preferenceService as never);
        }
      },
    });
    await databaseMigrationService.migrate();

    const harness = createEffectStore({
      db,
      logger: logger as never,
      databaseMigrationService,
      preferenceService: preferenceService as never,
      tolgee: { t: (s: string) => s } as never,
      healthExportService: { canExport: () => false } as never,
    });
    applyStoredSessionsEffects(harness.addEffect);
    addImportBackupEffects(harness.addEffect);
    return { db, harness };
  }

  function sessionWithNilWeight() {
    const blueprint = makeWeightedBlueprint({ name: 'Squat' });
    return makeSession([blueprint]).with({
      recordedExercises: [
        new RecordedWeightedExercise(
          blueprint,
          [filledPotentialSet(5, OffsetDateTime.parse('2025-04-05T10:00:00Z'), new Weight(100, 'nil'))],
          undefined,
        ),
      ],
    });
  }

  it('stores imported sessions with nil weights coalesced to the preferred unit', async () => {
    const { db, harness } = await setup();
    const session = sessionWithNilWeight();

    harness.store.dispatch(importBackupData({ workouts: [session], programs: {}, successMessage: 'done' }));
    await harness.settle();

    const [row] = await db.select().from(sessionsSchema).where(eq(sessionsSchema.id, session.id));
    const storedSet = (row!.payload as SessionJSON).recordedExercises[0] as RecordedWeightedExerciseJSON;
    expect(storedSet.potentialSets[0]!.weight.unit).toBe('kilograms');
    const inMemory = selectSession(harness.getState(), session.id)!.recordedExercises[0] as RecordedWeightedExercise;
    expect(inMemory.potentialSets[0]!.weight.unit).toBe('kilograms');
  });

  it('uses pounds for nil weights when the user lifts in pounds', async () => {
    const { harness } = await setup();
    harness.store.dispatch(setUseImperialUnits(true));
    const session = sessionWithNilWeight();

    harness.store.dispatch(importBackupData({ workouts: [session], programs: {}, successMessage: 'done' }));
    await harness.settle();

    const inMemory = selectSession(harness.getState(), session.id)!.recordedExercises[0] as RecordedWeightedExercise;
    expect(inMemory.potentialSets[0]!.weight.unit).toBe('pounds');
  });
});

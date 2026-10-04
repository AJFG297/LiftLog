import { beginFeedImport, importBackupData, importData, importDataSql } from '@/store/settings';
import { addImportBackupEffects } from '@/store/settings/import-backup-effects';
import { createAddEffectTestBed } from '@/utils/__test__/add-effect-testbed';
import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'path';
import { gzipSync } from 'node:zlib';
import { FeedBackupData } from '@/models/backup';
import { FeedIdentity } from '@/models/feed-models';
import { ProgramBlueprint } from '@/models/blueprint-models';
import { EmptySession, Session } from '@/models/session-models';
import { uuid } from '@/utils/uuid';
import { setIsHydrated, upsertExercises, upsertStoredSessions } from '@/store/stored-sessions';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import { createEffectStore } from '@/utils/__test__/effect-store';
import { openDatabaseAsync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { exercisesSchema, programsSchema } from '@/db/schema';
import { upsert } from '@/db/helpers';
import { makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { upsertSavedPlans } from '@/store/program';
import { showSnackbar } from '@/store/app';
import { getBackupBytes } from '@/store/settings/util';
import { loadHistoryFixture } from '@/utils/__test__/history-fixture';

vi.stubEnv('TZ', 'UTC');

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  time: async (_: string, action: () => unknown) => action(),
};

/** Picks `bytes` as the backup file and runs the restore up to the `importBackupData` it dispatches. */
async function restore(bytes: Uint8Array) {
  const testBed = createAddEffectTestBed({
    initialState: { storedSessions: { hiddenBuiltInIds: [] } },
    services: {
      filePickerService: { pickFile: vi.fn().mockResolvedValue({ bytes }) },
      logger: silentLogger,
      tolgee: { t: (s: string) => s },
    },
  });
  addImportBackupEffects(testBed.addEffect);
  await testBed.dispatchHandled(importData());
  await testBed.dispatchHandled(testBed.getDispatchedAction(importDataSql));
  return testBed.getDispatchedAction(importBackupData).payload;
}

describe('import-backup-effects', () => {
  it('restores the workouts, programs, exercises and feed of a backup', async () => {
    // Made by this app's own export (`getBackupBytes`): the 420-session history written through the
    // repository, beside 13 programs, 962 exercises and a feed identity.
    const bytes = await readFile(resolve(__dirname, '../../utils/__test__/backup.liftlogbackup.sqlite.gz'));

    const restored = await restore(bytes);

    expect(restored.workouts).toHaveLength(420);
    expect(Object.values(restored.programs)).toHaveLength(13);
    // Two of its 962 exercises only differed from another by a plural, and are merged before the restore
    // reads them: Lateral Raise into Lateral Raises, and Standing Calf Raise into the built-in.
    expect(Object.values(restored.exercises ?? {})).toHaveLength(960);
    expect(
      Object.entries(restored.exercises ?? {})
        .filter(([, x]) => /^(lateral|standing calf) raises?$/i.test(x.name))
        .map(([id, x]) => `${id} ${x.name}`),
    ).toEqual(['Standing Calf Raises Standing Calf Raises', '4BCD892E-8A72-41DF-AA95-3180A3EE0B17 Lateral Raises']);
    expect(restored.feed).toBeDefined();
    expect(restored.successMessage).toBe('Restore complete!');
    expect(restored.source).toBe('backup');
    // Workout ids are health-export record ids and the CSV-import dedupe key, so a restore must keep them.
    const expected = loadHistoryFixture();
    expect(restored.workouts.map((x) => x.id).toSorted()).toEqual(expected.map((x) => x.id).toSorted());
    const byId = new Map(restored.workouts.map((x) => [x.id, x]));
    for (const session of expected) {
      expect(byId.get(session.id)!.toJSON()).toEqual(session.toJSON());
    }
  });

  it('rejects a pre-relational backup instead of restoring it without workouts', async () => {
    const legacyDb = await openDatabaseAsync(':memory:');
    await legacyDb.execAsync(`
      CREATE TABLE session (id text PRIMARY KEY, active integer, payload text);
      CREATE TABLE program (id text PRIMARY KEY, active integer, payload text);
      INSERT INTO program (id, active, payload) VALUES ('program', 1, '{}');
    `);
    const bytes = gzipSync(await legacyDb.serializeAsync());
    await legacyDb.closeAsync();
    const testBed = createAddEffectTestBed({
      services: {
        filePickerService: { pickFile: vi.fn().mockResolvedValue({ bytes }) },
        logger: silentLogger,
        tolgee: { t: (s: string) => s },
      },
    });
    addImportBackupEffects(testBed.addEffect);

    await testBed.dispatchHandled(importData());
    await testBed.dispatchHandled(testBed.getDispatchedAction(importDataSql));

    testBed.expectNotDispatched(importBackupData);
    expect(testBed.dispatchedActions.filter(showSnackbar.match).at(-1)?.payload.text).toBe(
      "This backup is from an older version of LiftLog and can't be restored.",
    );
  });

  it('dispatches the appropriate actions when importing', async () => {
    const testBed = createAddEffectTestBed({
      initialState: { settings: { useImperialUnits: false }, storedSessions: { isHydrated: true } },
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
        primaryMuscles: [],
        secondaryMuscles: [],
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
        source: 'backup',
        workouts: mockWorkouts,
        programs: mockPrograms,
        exercises: mockExercises,
        feed: mockFeed,
        successMessage: 'Restore complete!',
      }),
    );

    expect(testBed.getDispatchedAction(upsertStoredSessions).payload).toEqual(mockWorkouts);
    expect(testBed.getDispatchedAction(upsertSavedPlans).payload).toEqual(mockPrograms);
    expect(testBed.getDispatchedAction(upsertExercises).payload).toEqual(mockExercises);
    expect(testBed.getDispatchedAction(showSnackbar).payload.text).toBe('Restore complete!');
    expect(testBed.getDispatchedAction(beginFeedImport).payload).toBe(mockFeed);
  });

  it('shows the provided successMessage', async () => {
    const testBed = createAddEffectTestBed({
      initialState: { settings: { useImperialUnits: false }, storedSessions: { isHydrated: true } },
      services: {
        tolgee: { t: (s: string) => s },
      },
    });
    addImportBackupEffects(testBed.addEffect);

    await testBed.dispatchHandled(
      importBackupData({
        source: 'external',
        workouts: [],
        programs: {},
        successMessage: 'Imported 3 workout(s)',
      }),
    );

    expect(testBed.getDispatchedAction(showSnackbar).payload.text).toBe('Imported 3 workout(s)');
  });

  it('does not dispatch beginFeedImport when feed is absent', async () => {
    const testBed = createAddEffectTestBed({
      initialState: { settings: { useImperialUnits: false }, storedSessions: { isHydrated: true } },
      services: {
        tolgee: { t: (s: string) => s },
      },
    });
    addImportBackupEffects(testBed.addEffect);

    await testBed.dispatchHandled(
      importBackupData({
        source: 'backup',
        workouts: [],
        programs: {},
        feed: undefined,
        successMessage: 'Restore complete!',
      }),
    );

    testBed.expectNotDispatched(beginFeedImport);
  });
});

describe('export then restore', () => {
  it('round-trips workouts, programs and exercises through a backup file', async () => {
    const expoDb = await openDatabaseAsync(':memory:');
    const db = drizzle(expoDb);
    await new DatabaseMigrationService(db, silentLogger as never, { importOldData: async () => {} }).migrate();
    const history = loadHistoryFixture().slice(0, 50);
    const inProgress = makeSession([makeWeightedBlueprint({ name: 'Bench' })]);
    const repository = new WorkoutRepository(db);
    await repository.putMany(history);
    await repository.setActive(inProgress);
    const program = ProgramBlueprint.fromJSON({
      version: 3,
      name: 'Program',
      sessions: [inProgress.blueprint.toJSON()],
      lastEdited: '2026-04-10' as never,
    });
    await db.insert(programsSchema).values({ id: 'program', active: true, payload: program.toJSON() });
    // Stored before primary and secondary muscles were split, so the restore migrates it.
    const exercise = {
      name: 'Custom exercise',
      force: null,
      level: '',
      mechanic: null,
      equipment: null,
      muscles: ['chest'],
      instructions: '',
      category: '',
    };
    await upsert(db, exercisesSchema, [{ id: 'custom', payload: exercise }]);

    const restored = await restore(await getBackupBytes({ expoDb, includeFeed: false }));

    const expected = [...history, inProgress];
    expect(restored.workouts.map((x) => x.toJSON())).toEqual(expect.arrayContaining(expected.map((x) => x.toJSON())));
    expect(restored.workouts).toHaveLength(expected.length);
    expect(restored.programs.program?.toJSON()).toEqual(program.toJSON());
    expect(restored.exercises?.custom).toEqual({
      name: 'Custom exercise',
      force: null,
      level: '',
      mechanic: null,
      equipment: null,
      primaryMuscles: ['chest'],
      secondaryMuscles: [],
      instructions: '',
      category: '',
    });
    expect(restored.feed).toBeUndefined();
  });

  it('stores restored workouts with their ids, and never resumes one', async () => {
    const db = drizzle(await openDatabaseAsync(':memory:'));
    await new DatabaseMigrationService(db, silentLogger as never, { importOldData: async () => {} }).migrate();
    const workoutRepository = new WorkoutRepository(db);
    const harness = createEffectStore({
      db,
      workoutRepository,
      logger: silentLogger as never,
      tolgee: { t: (s: string) => s } as never,
    });
    applyStoredSessionsEffects(harness.addEffect);
    addImportBackupEffects(harness.addEffect);
    harness.store.dispatch(setIsHydrated(true));
    const workouts = loadHistoryFixture().slice(0, 20);

    harness.store.dispatch(importBackupData({ source: 'backup', workouts, programs: {}, successMessage: 'done' }));
    await harness.settle();

    const stored = await workoutRepository.loadAll();
    expect(stored.activeWorkoutId).toBeUndefined();
    expect(stored.workouts.map((x) => x.id).toSorted()).toEqual(workouts.map((x) => x.id).toSorted());
  });
});

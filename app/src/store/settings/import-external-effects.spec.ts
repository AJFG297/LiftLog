import { applyHistoryImport } from '@/store/history-import-actions';
import { HistoryImport } from '@/services/history-import';
import { ProgramWriter } from '@/services/program-writer';
import { DescriptorWriter } from '@/services/descriptor-writer';
import { combineReducers } from '@reduxjs/toolkit';
import { settingsReducer } from '@/store/settings';
import { storedSessionsReducer } from '@/store/stored-sessions';
import programReducer from '@/store/program';
import { importFromExternal, ExternalImportFormat } from '@/store/settings';
import { addImportExternalEffects } from '@/store/settings/import-external-effects';
import { getImportForFitNotes, getImportForStrongLifts } from '@/services/csv-import';
import { csvImportFixtureBytes } from '@/services/csv-import/__test__/fixtures';
import { createAddEffectTestBed } from '@/utils/__test__/add-effect-testbed';
import { describe, expect, it, vi } from 'vitest';
import { showSnackbar } from '@/store/app';
import { setStatsIsDirty } from '@/store/stats';
import { Session } from '@/models/session-models';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';

type BedOpts = {
  format: ExternalImportFormat;
  bytes: Uint8Array;
  /** Workouts already in History, written to the tables the dedupe reads. */
  sessions?: Session[];
  imperial?: boolean;
  tolgee?: (key: string, params?: { count?: number; error?: string }) => string;
};

async function makeExternalImportBed({ format: _format, bytes, sessions = [], imperial = false, tolgee }: BedOpts) {
  const db = drizzle(await openDatabaseAsync(':memory:'));
  await new DatabaseMigrationService(db, { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never, {
    importOldData: async () => {},
  }).migrate();
  const workoutRepository = new WorkoutRepository(db);
  await workoutRepository.putMany(sessions);

  const defaultTolgee = (key: string, params?: { count?: number; error?: string }) => {
    if (key === 'backup.import_from_other_apps.complete.message') {
      return `Imported ${params?.count} workout(s)`;
    }
    if (key === 'backup.import_from_other_apps.already_imported.message') {
      return 'Those workouts are already in History';
    }
    if (key === 'backup.import_from_other_apps.failed.message') {
      return `Could not import: ${params?.error}`;
    }
    return key;
  };

  const keyValueStore = { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() };
  const testBed = createAddEffectTestBed({
    reducer: combineReducers({
      settings: settingsReducer,
      storedSessions: storedSessionsReducer,
      program: programReducer,
    }),
    initialState: {
      settings: { useImperialUnits: imperial, isHydrated: true },
      storedSessions: { isHydrated: true },
      program: { isHydrated: true },
    },
    services: {
      db,
      keyValueStore,
      workoutRepository,
      filePickerService: {
        pickFile: vi.fn().mockResolvedValue({
          name: 'import.csv',
          bytes,
        }),
      },
      tolgee: {
        t: tolgee ?? defaultTolgee,
      },
    },
  });
  testBed.mockServices.historyImport = new HistoryImport(
    { getState: testBed.getState, dispatch: testBed.dispatch, subscribe: () => () => {} },
    {
      db,
      workoutRepository,
      logger: testBed.mockServices.logger,
      programWriter: new ProgramWriter(db, testBed.getState),
      descriptorWriter: new DescriptorWriter(db, testBed.getState, keyValueStore as never),
    },
  );
  addImportExternalEffects(testBed.addEffect);
  return testBed;
}

describe('import-external-effects', () => {
  it('picks a FitNotes CSV and dispatches applyHistoryImport', async () => {
    const testBed = await makeExternalImportBed({
      format: 'FitNotes',
      bytes: csvImportFixtureBytes('fitnotes-android-export-kgs.csv'),
    });
    await testBed.dispatchHandled(importFromExternal({ format: 'FitNotes' }));

    const imported = testBed.getDispatchedAction(applyHistoryImport);
    expect(imported.payload.workouts).toHaveLength(2);
    expect(imported.payload.workouts[0]!.date.toString()).toBe('2026-08-04');
    expect(imported.payload.workouts[0]!.recordedExercises).toHaveLength(5);
    expect(imported.payload.programs).toEqual({});
    expect(testBed.getDispatchedAction(showSnackbar).payload.text).toBe('Imported 2 workout(s)');
    expect(testBed.getDispatchedAction(setStatsIsDirty).payload).toBe(true);
  });

  it.each([
    {
      name: 'FitNotes',
      format: 'FitNotes' as const,
      bytes: () => csvImportFixtureBytes('fitnotes-android-export-kgs.csv'),
      backup: () => getImportForFitNotes(csvImportFixtureBytes('fitnotes-android-export-kgs.csv')),
    },
    {
      name: 'StrongLifts',
      format: 'StrongLifts' as const,
      bytes: () => csvImportFixtureBytes('stronglifts-export-kg.csv'),
      backup: () => getImportForStrongLifts(csvImportFixtureBytes('stronglifts-export-kg.csv')),
    },
  ] as const)('skips import when all $name sessions already exist', async ({ format, bytes, backup }) => {
    const existing = backup().workouts;
    const testBed = await makeExternalImportBed({ format, bytes: bytes(), sessions: existing });
    await testBed.dispatchHandled(importFromExternal({ format }));

    expect(() => testBed.getDispatchedAction(applyHistoryImport)).toThrow();
    expect(() => testBed.getDispatchedAction(setStatsIsDirty)).toThrow();
    expect(testBed.getDispatchedAction(showSnackbar).payload.text).toBe('Those workouts are already in History');
  });

  it('skips a FitNotes day already in History even when sets changed', async () => {
    const original = `Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment
2026-08-08,Bench Press,Chest,60,kgs,8,,,,
`;
    const changedSets = `Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment
2026-08-08,Bench Press,Chest,65,kgs,8,,,,
`;
    const existing = getImportForFitNotes(new TextEncoder().encode(original)).workouts;
    const testBed = await makeExternalImportBed({
      format: 'FitNotes',
      bytes: new TextEncoder().encode(changedSets),
      sessions: existing,
    });
    await testBed.dispatchHandled(importFromExternal({ format: 'FitNotes' }));

    expect(() => testBed.getDispatchedAction(applyHistoryImport)).toThrow();
    expect(testBed.getDispatchedAction(showSnackbar).payload.text).toBe('Those workouts are already in History');
  });

  it('imports only sessions not already in History', async () => {
    const all = getImportForFitNotes(csvImportFixtureBytes('fitnotes-android-export-kgs.csv'));
    const firstOnly = [all.workouts[0]!];

    const testBed = await makeExternalImportBed({
      format: 'FitNotes',
      bytes: csvImportFixtureBytes('fitnotes-android-export-kgs.csv'),
      sessions: firstOnly,
    });
    await testBed.dispatchHandled(importFromExternal({ format: 'FitNotes' }));

    const imported = testBed.getDispatchedAction(applyHistoryImport);
    expect(imported.payload.workouts).toHaveLength(1);
    expect(imported.payload.workouts[0]!.id).toBe(all.workouts[1]!.id);
    expect(imported.payload.workouts[0]!.date.toString()).toBe('2026-08-05');
    expect(testBed.getDispatchedAction(showSnackbar).payload.text).toBe('Imported 1 workout(s)');
  });

  it('shows an error snackbar for invalid CSV and does not import', async () => {
    const testBed = await makeExternalImportBed({
      format: 'FitNotes',
      bytes: new TextEncoder().encode('not,a,valid,file\n1,2,3,4\n'),
    });
    await testBed.dispatchHandled(importFromExternal({ format: 'FitNotes' }));

    expect(() => testBed.getDispatchedAction(applyHistoryImport)).toThrow();
    expect(testBed.getDispatchedAction(showSnackbar).payload.text).toMatch(/Could not import:/);
  });

  it('no-ops when the user cancels the picker', async () => {
    const testBed = createAddEffectTestBed({
      reducer: combineReducers({
        settings: settingsReducer,
        storedSessions: storedSessionsReducer,
        program: programReducer,
      }),
      services: {
        filePickerService: {
          pickFile: vi.fn().mockResolvedValue(undefined),
        },
        tolgee: { t: (s: string) => s },
      },
    });

    addImportExternalEffects(testBed.addEffect);
    await testBed.dispatchHandled(importFromExternal({ format: 'FitNotes' }));

    expect(() => testBed.getDispatchedAction(applyHistoryImport)).toThrow();
    expect(() => testBed.getDispatchedAction(showSnackbar)).toThrow();
  });

  it('picks a StrongLifts CSV and dispatches applyHistoryImport', async () => {
    const testBed = await makeExternalImportBed({
      format: 'StrongLifts',
      bytes: csvImportFixtureBytes('stronglifts-export-kg.csv'),
    });
    await testBed.dispatchHandled(importFromExternal({ format: 'StrongLifts' }));

    const imported = testBed.getDispatchedAction(applyHistoryImport);
    expect(imported.payload.workouts).toHaveLength(5);
    expect(imported.payload.workouts[0]!.blueprint.name).toBe('Workout A');
    expect(imported.payload.workouts[0]!.recordedExercises).toHaveLength(3);
    expect(imported.payload.programs).toEqual({});
    expect(testBed.getDispatchedAction(showSnackbar).payload.text).toBe('Imported 5 workout(s)');
    expect(testBed.getDispatchedAction(setStatsIsDirty).payload).toBe(true);
  });
});

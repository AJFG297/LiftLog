import { afterEach, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import { ProgramBlueprint, SessionBlueprint, stubExerciseId } from '@/models/blueprint-models';
import type { BackupData } from '@/models/backup';
import type { ExerciseDescriptor } from '@/models/exercise-models';
import { toExerciseDescriptorJSON } from '@/models/exercise-models';
import { stubDescriptor } from '@/models/exercise-resolver';
import { legacyStubExerciseId } from '@/models/legacy-exercise-name';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { writeAtomically } from '@/db/helpers';
import { exercisesSchema, programsSchema, workoutExercisesSchema, workoutsSchema } from '@/db/schema';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { DescriptorWriter } from '@/services/descriptor-writer';
import { HistoryImport } from '@/services/history-import';
import type { ImportOutcome } from '@/services/history-import';
import { KeyValueStore } from '@/services/key-value-store';
import { Logger } from '@/services/logger';
import { ProgramWriter } from '@/services/program-writer';
import { SessionService } from '@/services/session-service';
import { WorkoutRepository } from '@/services/workout-repository';
import type { Services } from '@/services';
import { applyProgramEffects } from '@/store/program/effects';
import {
  initializeProgramStateSlice,
  setActivePlan,
  setIsHydrated as setProgramsHydrated,
  setSavedPlans,
  updateProgram,
} from '@/store/program';
import { setIsHydrated as setSettingsHydrated } from '@/store/settings';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import {
  deleteExercise,
  initializeStoredSessionsStateSlice,
  openSession,
  setActiveSession,
  setActiveSessionId,
  setExercises,
  setBuiltInExercises,
  setIsHydrated as setExercisesHydrated,
  setLatestExercises,
  updateExercise,
  updateStoredSession,
} from '@/store/stored-sessions';
import { setStatsIsDirty } from '@/store/stats';
import { applyStatsEffects } from '@/store/stats/effects';
import { createEffectStore } from '@/utils/__test__/effect-store';
import { pauseNextTransaction } from '../../test/pause-transaction';
import { getImportForFitNotes } from '@/services/csv-import/importers';
import { Weight } from '@/models/weight';
import { programBlueprintMigrations } from '@/models/storage/versions/migrations';

const close: (() => Promise<void>)[] = [];
const lunge = makeWeightedBlueprint({ name: 'Lunge', exerciseId: 'user-lunge', sets: 1 });
const lunges = makeWeightedBlueprint({ name: 'Lunges', exerciseId: 'user-lunges', sets: 1 });
const date = LocalDate.of(2026, 3, 23);
const at = OffsetDateTime.parse('2026-03-23T10:00:00Z');
const emptyData: BackupData = { workouts: [], programs: {} };

function workout(id: string, blueprint = lunge, reps = 10, weight = 42): Session {
  return new Session(
    id,
    new SessionBlueprint('Legs', [blueprint], ''),
    [makeRecordedExercise(blueprint, [reps], new Weight(weight, 'kilograms'), () => at)],
    date,
    undefined,
    undefined,
  );
}

function program(name: string, blueprint = lunges): ProgramBlueprint {
  return new ProgramBlueprint(name, [new SessionBlueprint('Legs', [blueprint], '')], date);
}

function descriptor(name: string, instructions = ''): ExerciseDescriptor {
  return { ...stubDescriptor(name), instructions };
}

function weighted(session: Session | undefined): RecordedWeightedExercise {
  const exercise = session?.recordedExercises[0];
  if (!(exercise instanceof RecordedWeightedExercise)) throw new Error('Expected a stored weighted exercise');
  return exercise;
}

function failed(outcome: ImportOutcome) {
  if (outcome.kind !== 'failed') throw new Error(`Expected failed import, received ${outcome.kind}`);
  return outcome;
}

async function fixture({
  hydrated = true,
  registerEffects = true,
  exercises = {},
  programs = {},
  workouts = [],
  active,
}: {
  hydrated?: boolean;
  registerEffects?: boolean;
  exercises?: Record<string, ExerciseDescriptor>;
  programs?: Record<string, ProgramBlueprint>;
  workouts?: Session[];
  active?: Session;
} = {}) {
  const raw = await openDatabaseAsync(':memory:');
  close.push(() => raw.closeAsync());
  const db = drizzle(raw);
  const logger = new Logger();
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'debug').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
  const keyValueStore = new KeyValueStore();
  const preferences = new Map<string, string>();
  vi.spyOn(keyValueStore, 'getItem').mockImplementation(async (key) => preferences.get(key));
  vi.spyOn(keyValueStore, 'setItem').mockImplementation(async (key, value) => {
    if (typeof value !== 'string') throw new Error('Expected text preference');
    preferences.set(key, value);
  });
  await new DatabaseMigrationService(db, logger, { importOldData: async () => {} }).migrate();
  const repository = new WorkoutRepository(db, (error) => logger.error('Workout commit subscriber failed', error));
  await repository.putMany(workouts);
  if (active) await repository.setActive(active);
  const exerciseRows = Object.entries(exercises).map(([id, exercise]) => ({
    id,
    payload: toExerciseDescriptorJSON(exercise),
  }));
  if (exerciseRows.length) await db.insert(exercisesSchema).values(exerciseRows);
  const programRows = Object.entries(programs).map(([id, plan]) => ({
    id,
    active: id === 'plan',
    payload: plan.toJSON(),
  }));
  if (programRows.length) await db.insert(programsSchema).values(programRows);
  const services: Partial<Services> = { db, workoutRepository: repository, logger, keyValueStore };
  const app = createEffectStore(services);
  app.store.dispatch(setExercises(exercises));
  app.store.dispatch(setSavedPlans(programs));
  if (programs.plan) app.store.dispatch(setActivePlan({ activePlanId: 'plan' }));
  if (active) app.store.dispatch(setActiveSession(active));
  app.store.dispatch(setLatestExercises(await repository.latestPerLineage()));
  if (hydrated) {
    app.store.dispatch(setSettingsHydrated(true));
    app.store.dispatch(setProgramsHydrated(true));
    app.store.dispatch(setExercisesHydrated(true));
  }
  const programWriter = new ProgramWriter(db, app.getState);
  const descriptorWriter = new DescriptorWriter(db, app.getState, keyValueStore);
  let subscriptions = 0;
  const owner = new HistoryImport(
    {
      getState: app.getState,
      dispatch: app.store.dispatch,
      subscribe: (listener) => {
        subscriptions++;
        const unsubscribe = app.store.subscribe(listener);
        return () => {
          subscriptions--;
          unsubscribe();
        };
      },
    },
    { db, workoutRepository: repository, programWriter, descriptorWriter, logger },
  );
  Object.assign(services, {
    programWriter,
    descriptorWriter,
    historyImport: owner,
    sessionService: new SessionService(repository, app.getState),
  });
  if (registerEffects) {
    applyProgramEffects(app.addEffect);
    applyStoredSessionsEffects(app.addEffect);
  }
  return {
    raw,
    db,
    repository,
    app,
    owner,
    programWriter,
    descriptorWriter,
    logger,
    keyValueStore,
    preferences,
    subscriptions: () => subscriptions,
  };
}

function splitFixture() {
  return fixture({
    exercises: {
      'user-lunge': descriptor('Lunge'),
      'user-lunges': descriptor('Lunges'),
      removed: descriptor('Never resurrect'),
    },
    programs: { plan: program('Plan') },
    workouts: [workout('survivor-1'), workout('survivor-2'), workout('loser', lunges)],
  });
}

async function storedPrograms(f: Awaited<ReturnType<typeof fixture>>) {
  return (await f.db.select().from(programsSchema)).map((row) => ({
    id: row.id,
    active: row.active,
    name: row.payload.name,
    exerciseIds: ProgramBlueprint.fromJSON(programBlueprintMigrations.migrate(row.payload)).sessions.flatMap(
      (session) => session.exercises.map((exercise) => exercise.exerciseId),
    ),
  }));
}

async function pauseMerge(f: Awaited<ReturnType<typeof fixture>>) {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const actual = f.repository.repointExercises.bind(f.repository);
  vi.spyOn(f.repository, 'repointExercises').mockImplementationOnce(async (...args) => {
    entered.resolve();
    await release.promise;
    await actual(...args);
  });
  const pending = f.owner.apply({ kind: 'external', data: emptyData });
  await entered.promise;
  return { pending, release };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(close.splice(0).map((dispose) => dispose()));
});

describe('deferred connection writes', () => {
  it.each(['program', 'descriptor', 'content', 'active'])(
    '%s reads current state only when the database transaction starts',
    async (entrypoint) => {
      const before = workout('before', lunges, 10, 42);
      const after = workout('after', lunge, 17, 88);
      const f = await fixture({
        registerEffects: false,
        active: before,
        programs: { plan: program('Before') },
        exercises: { custom: descriptor('Before', 'Before instructions') },
      });
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const prior = writeAtomically(f.db, () => [
        {
          run: () => {
            entered.resolve();
            return release.promise;
          },
        },
      ]);
      await entered.promise;
      const notifications: { workoutIds: readonly string[]; activeChanged: boolean }[] = [];
      const unsubscribe = f.repository.subscribe((write) => notifications.push(write));
      const read = vi.fn(() => {
        const state = f.app.getState().storedSessions;
        return state.activeSessionId === undefined ? undefined : state.sessions[state.activeSessionId];
      });
      const pending =
        entrypoint === 'program'
          ? f.programWriter.flush()
          : entrypoint === 'descriptor'
            ? f.descriptorWriter.flush()
            : entrypoint === 'content'
              ? f.repository.putCurrent(read)
              : f.repository.setActiveCurrent(read);
      await Promise.resolve();
      await Promise.resolve();
      expect(read).not.toHaveBeenCalled();
      f.app.store.dispatch(setSavedPlans({ plan: program('Latest', lunge), other: program('Other latest', lunge) }));
      f.app.store.dispatch(setActivePlan({ activePlanId: 'other' }));
      f.app.store.dispatch(setExercises({ custom: descriptor('Latest descriptor', 'Latest instructions') }));
      f.app.store.dispatch(setActiveSession(after));
      release.resolve();
      await prior;
      const result = await pending;
      unsubscribe();
      if (entrypoint === 'program') {
        expect(await storedPrograms(f)).toEqual([
          { id: 'plan', active: false, name: 'Latest', exerciseIds: ['user-lunge'] },
          { id: 'other', active: true, name: 'Other latest', exerciseIds: ['user-lunge'] },
        ]);
        expect(notifications).toEqual([]);
      } else if (entrypoint === 'descriptor') {
        expect(
          (await f.db.select().from(exercisesSchema)).map((row) => [
            row.id,
            row.payload.name,
            row.payload.instructions,
          ]),
        ).toEqual([['custom', 'Latest descriptor', 'Latest instructions']]);
        expect(notifications).toEqual([]);
      } else {
        expect(read).toHaveBeenCalledTimes(1);
        expect((await f.repository.get('after'))?.toJSON()).toEqual(after.toJSON());
        expect((await f.repository.get('before'))?.toJSON()).toEqual(before.toJSON());
        expect(notifications).toEqual([{ workoutIds: ['after'], activeChanged: entrypoint === 'active' }]);
        expect((await f.db.select().from(workoutsSchema)).map((row) => [row.id, row.active])).toEqual([
          ['before', entrypoint === 'content'],
          ['after', entrypoint === 'active'],
        ]);
        if (entrypoint === 'content') {
          if (!(result instanceof Session)) throw new Error('Expected the session that was written');
          expect(result.toJSON()).toEqual(after.toJSON());
        } else {
          expect((await f.repository.active())?.id).toBe('after');
        }
      }
    },
  );
});

describe('HistoryImport', () => {
  it('waits for all hydration flags and removes its waiting subscription', async () => {
    const f = await fixture({ hydrated: false });
    const insert = vi.spyOn(f.repository, 'putMany');
    const pending = f.owner.apply({ kind: 'backup', data: { workouts: [workout('restored')], programs: {} } });
    await Promise.resolve();
    expect(f.subscriptions()).toBe(1);
    f.app.store.dispatch(setSettingsHydrated(true));
    f.app.store.dispatch(setProgramsHydrated(true));
    await Promise.resolve();
    expect(insert).not.toHaveBeenCalled();
    expect(await f.db.select().from(exercisesSchema)).toEqual([]);
    f.app.store.dispatch(setExercisesHydrated(true));
    expect(await pending).toEqual({ kind: 'complete', count: 1 });
    expect(f.subscriptions()).toBe(0);
    await f.app.settle();
  });

  it('acknowledges only after the workout commit and carry-over refresh', async () => {
    const f = await fixture();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const actual = f.repository.putMany.bind(f.repository);
    vi.spyOn(f.repository, 'putMany').mockImplementationOnce(async (workouts) => {
      entered.resolve();
      await release.promise;
      await actual(workouts);
    });
    const cacheEntered = Promise.withResolvers<void>();
    const cacheRelease = Promise.withResolvers<void>();
    const actualCache = f.repository.latestPerLineage.bind(f.repository);
    vi.spyOn(f.repository, 'latestPerLineage').mockImplementationOnce(async (...args) => {
      cacheEntered.resolve();
      await cacheRelease.promise;
      return actualCache(...args);
    });
    let outcome: ImportOutcome | undefined;
    const pending = f.owner
      .apply({ kind: 'backup', data: { workouts: [workout('imported')], programs: {} } })
      .then((result) => {
        outcome = result;
        return result;
      });
    await entered.promise;
    expect(outcome).toBeUndefined();
    expect(await f.repository.existingIds(['imported'])).toEqual(new Set());
    release.resolve();
    await cacheEntered.promise;
    expect(outcome).toBeUndefined();
    expect(await f.repository.existingIds(['imported'])).toEqual(new Set(['imported']));
    cacheRelease.resolve();
    expect(await pending).toEqual({ kind: 'complete', count: 1 });
    expect(Object.values(f.app.getState().storedSessions.latestExerciseWorkoutIds)).toEqual(['imported']);
  });

  it('serializes duplicate lookup through insertion and keeps the first external contents', async () => {
    const f = await fixture();
    const bytes = new TextEncoder().encode(
      'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment\n2026-03-23,Lunge,Legs,42,kgs,10,,,,\n',
    );
    const first = getImportForFitNotes(bytes);
    const second = getImportForFitNotes(
      new TextEncoder().encode(new TextDecoder().decode(bytes).replace('42,kgs,10', '99,kgs,3')),
    );
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const actual = f.repository.putMany.bind(f.repository);
    const inserts = vi.spyOn(f.repository, 'putMany').mockImplementationOnce(async (workouts) => {
      entered.resolve();
      await release.promise;
      await actual(workouts);
    });
    const a = f.owner.apply({ kind: 'external', data: first });
    await entered.promise;
    const b = f.owner.apply({ kind: 'external', data: second });
    release.resolve();
    expect(await a).toEqual({ kind: 'complete', count: 1 });
    expect(await b).toEqual({ kind: 'unchanged' });
    expect(inserts).toHaveBeenCalledTimes(1);
    const rows = await f.repository.loadAll();
    expect(rows.workouts).toHaveLength(1);
    const exercise = weighted(rows.workouts[0]);
    expect(exercise.potentialSets[0]?.weight.value.toNumber()).toBe(42);
    expect(exercise.potentialSets[0]?.set?.repsCompleted).toBe(10);
  });

  it('preserves own-backup linked IDs and never resumes a restored workout', async () => {
    const active = workout('current');
    const f = await fixture({ active });
    const restored = workout(
      'restored',
      makeWeightedBlueprint({ name: 'Renamed custom lift', exerciseId: 'deleted-custom-id', sets: 1 }),
    );
    const restoredProgram = program(
      'Restored',
      makeWeightedBlueprint({ name: 'Renamed custom lift', exerciseId: 'deleted-custom-id', sets: 1 }),
    );
    expect(
      await f.owner.apply({
        kind: 'backup',
        data: { workouts: [restored], programs: { restored: restoredProgram }, exercises: {} },
      }),
    ).toEqual({ kind: 'complete', count: 1 });
    expect((await f.repository.get('restored'))?.toJSON()).toEqual(restored.toJSON());
    expect((await f.repository.active())?.id).toBe('current');
    expect(f.app.getState().storedSessions.activeSessionId).toBe('current');
    expect(f.app.getState().program.savedPrograms.restored?.toJSON()).toEqual(restoredProgram.toJSON());
    expect((await f.db.select().from(workoutsSchema)).map((row) => [row.id, row.active])).toEqual([
      ['current', true],
      ['restored', false],
    ]);
  });

  it('waits for program hydration even when settings and descriptors are already ready', async () => {
    const f = await fixture({ hydrated: false });
    f.app.store.dispatch(setSettingsHydrated(true));
    f.app.store.dispatch(setExercisesHydrated(true));
    const insert = vi.spyOn(f.repository, 'putMany');
    const pending = f.owner.apply({ kind: 'backup', data: { workouts: [workout('imported')], programs: {} } });
    await Promise.resolve();
    expect(f.subscriptions()).toBe(1);
    expect(insert).not.toHaveBeenCalled();
    f.app.store.dispatch(setProgramsHydrated(true));
    expect(await pending).toEqual({ kind: 'complete', count: 1 });
    expect(f.subscriptions()).toBe(0);
  });

  it('reports linking failure before imported data or workouts are written', async () => {
    const f = await fixture();
    const imported = workout('imported');
    const error = new Error('linking failed');
    vi.spyOn(imported, 'with').mockImplementationOnce(() => {
      throw error;
    });
    const outcome = failed(await f.owner.apply({ kind: 'backup', data: { workouts: [imported], programs: {} } }));
    expect(outcome).toMatchObject({ stage: 'linking', error, durableStages: [] });
    expect(await f.db.select().from(workoutsSchema)).toEqual([]);
    expect(f.app.getState().storedSessions.savedExercises).toEqual({});
  });

  it('reports descriptor write failure and recovers on retry', async () => {
    const f = await fixture();
    await f.raw.execAsync(
      "CREATE TRIGGER reject_descriptor BEFORE INSERT ON exercise WHEN NEW.id = 'custom' BEGIN SELECT RAISE(ABORT, 'descriptor failed'); END;",
    );
    const data = { workouts: [workout('imported')], programs: {}, exercises: { custom: descriptor('Custom lift') } };
    const outcome = failed(await f.owner.apply({ kind: 'backup', data }));
    expect(outcome.stage).toBe('descriptors');
    expect(outcome.durableStages).toEqual([]);
    expect(await f.repository.existingIds(['imported'])).toEqual(new Set());
    await f.raw.execAsync('DROP TRIGGER reject_descriptor;');
    expect(await f.owner.apply({ kind: 'backup', data })).toEqual({ kind: 'complete', count: 1 });
    expect((await f.db.select().from(exercisesSchema)).map((row) => row.id)).toContain('custom');
  });

  it('reports program failure after descriptor durability and recovers', async () => {
    const f = await fixture();
    await f.raw.execAsync(
      "CREATE TRIGGER reject_program BEFORE INSERT ON program WHEN NEW.id = 'imported' BEGIN SELECT RAISE(ABORT, 'program failed'); END;",
    );
    const data = {
      workouts: [workout('imported')],
      programs: { imported: program('Imported') },
      exercises: { custom: descriptor('Custom lift') },
    };
    const outcome = failed(await f.owner.apply({ kind: 'backup', data }));
    expect(outcome.stage).toBe('programs');
    expect(outcome.durableStages).toEqual(['descriptors']);
    expect((await f.db.select().from(exercisesSchema)).map((row) => row.id)).toContain('custom');
    expect(await f.db.select().from(programsSchema)).toEqual([]);
    expect(await f.repository.existingIds(['imported'])).toEqual(new Set());
    await f.raw.execAsync('DROP TRIGGER reject_program;');
    expect(await f.owner.apply({ kind: 'backup', data })).toEqual({ kind: 'complete', count: 1 });
  });

  it('reports workout transaction failure and leaves no partial workout rows', async () => {
    const f = await fixture();
    await f.raw.execAsync(
      "CREATE TRIGGER reject_workout BEFORE INSERT ON weighted_set BEGIN SELECT RAISE(ABORT, 'set failed'); END;",
    );
    const data = { workouts: [workout('imported')], programs: { imported: program('Imported') } };
    const outcome = failed(await f.owner.apply({ kind: 'backup', data }));
    expect(outcome.stage).toBe('workouts');
    expect(outcome.durableStages).toEqual(['descriptors', 'programs']);
    expect(await f.db.select().from(workoutsSchema)).toEqual([]);
    expect(await f.db.select().from(workoutExercisesSchema)).toEqual([]);
    await f.raw.execAsync('DROP TRIGGER reject_workout;');
    expect(await f.owner.apply({ kind: 'backup', data })).toEqual({ kind: 'complete', count: 1 });
  });

  it('reports dedupe read failure, then runs the next queued import', async () => {
    const f = await fixture();
    const error = new Error('dedupe unavailable');
    vi.spyOn(f.repository, 'existingIds').mockRejectedValueOnce(error);
    const first = f.owner.apply({ kind: 'external', data: { workouts: [workout('imported')], programs: {} } });
    const next = f.owner.apply({ kind: 'external', data: { workouts: [workout('imported')], programs: {} } });
    expect(failed(await first)).toMatchObject({ stage: 'dedupe', error, durableStages: [] });
    expect(await next).toEqual({ kind: 'complete', count: 1 });
  });

  it('repairs after a workout commit failure on a duplicate-only retry without replacing sets', async () => {
    const f = await splitFixture();
    const imported = workout('new', lunges, 8, 73);
    const error = new Error('repair unavailable');
    vi.spyOn(f.repository, 'repointExercises').mockRejectedValueOnce(error);
    const first = failed(await f.owner.apply({ kind: 'external', data: { workouts: [imported], programs: {} } }));
    expect(first).toMatchObject({ stage: 'repair', error, durableStages: ['descriptors', 'programs', 'workouts'] });
    expect(await f.repository.existingIds(['new'])).toEqual(new Set(['new']));
    const insert = vi.spyOn(f.repository, 'putMany');
    expect(
      await f.owner.apply({ kind: 'external', data: { workouts: [workout('new', lunges, 1, 999)], programs: {} } }),
    ).toEqual({ kind: 'unchanged' });
    expect(insert).not.toHaveBeenCalled();
    const exercise = weighted(await f.repository.get('new'));
    expect(exercise.blueprint.exerciseId).toBe('user-lunge');
    expect(exercise.potentialSets[0]?.weight.value.toNumber()).toBe(73);
    expect(exercise.potentialSets[0]?.set?.repsCompleted).toBe(8);
    expect((await f.db.select().from(workoutExercisesSchema)).map((row) => row.movementKey)).toEqual(
      Array(4).fill('user-lunge|WeightedExerciseBlueprint'),
    );
  });

  it('reconciles a committed round before the migration marker can fail', async () => {
    const f = await splitFixture();
    f.app.store.dispatch(openSession({ session: workout('loser', lunges), slot: 'editing' }));
    await f.raw.execAsync(
      "CREATE TRIGGER reject_merge_marker BEFORE INSERT ON data_migration WHEN NEW.id = 'MERGE_PLURAL_EXERCISE_NAMES' BEGIN SELECT RAISE(ABORT, 'marker failed'); END;",
    );
    const outcome = failed(await f.owner.apply({ kind: 'external', data: emptyData }));
    expect(outcome.stage).toBe('repair');
    expect(outcome.committedRounds).toHaveLength(1);
    expect(outcome.committedRounds[0]?.map((merge) => [merge.mergedIds, merge.survivor.id])).toEqual([
      [['user-lunges'], 'user-lunge'],
    ]);
    expect(f.app.getState().program.savedPrograms.plan?.sessions[0]?.exercises[0]?.exerciseId).toBe('user-lunge');
    expect(f.app.getState().storedSessions.savedExercises['user-lunges']).toBeUndefined();
    expect(weighted(f.app.getState().storedSessions.sessions.loser).blueprint.exerciseId).toBe('user-lunge');
    await f.raw.execAsync('DROP TRIGGER reject_merge_marker;');
    expect(await f.owner.apply({ kind: 'external', data: emptyData })).toEqual({ kind: 'unchanged' });
    await f.app.settle();
    expect(await storedPrograms(f)).toEqual([{ id: 'plan', active: true, name: 'Plan', exerciseIds: ['user-lunge'] }]);
  });

  it('keeps the first committed round when the next round rejects', async () => {
    const bench = makeWeightedBlueprint({
      name: 'Bench Press',
      exerciseId: legacyStubExerciseId('Bench Press'),
      sets: 1,
    });
    const typo = makeWeightedBlueprint({
      name: 'Bench Presss',
      exerciseId: legacyStubExerciseId('Bench Presss'),
      sets: 1,
    });
    const f = await fixture({
      exercises: { [bench.exerciseId]: descriptor('Bench Press'), [typo.exerciseId]: descriptor('Bench Presss') },
      programs: { plan: program('Plan', bench) },
      workouts: [workout('bench', bench), workout('typo', typo)],
    });
    const actual = f.repository.repointExercises.bind(f.repository);
    const error = new Error('next round failed');
    vi.spyOn(f.repository, 'repointExercises').mockImplementationOnce(actual).mockRejectedValueOnce(error);
    const outcome = failed(await f.owner.apply({ kind: 'external', data: emptyData }));
    expect(outcome).toMatchObject({ stage: 'repair', error });
    expect(outcome.committedRounds).toHaveLength(1);
    expect(weighted(await f.repository.get('typo')).blueprint.exerciseId).toBe(stubExerciseId('Bench Presss'));
    expect(f.app.getState().storedSessions.savedExercises[stubExerciseId('Bench Presss')]?.name).toBe('Bench Presss');
    expect(await f.owner.apply({ kind: 'external', data: emptyData })).toEqual({ kind: 'unchanged' });
    expect(weighted(await f.repository.get('bench')).blueprint.exerciseId).toBe(stubExerciseId('Bench Press'));
    expect(f.app.getState().program.savedPrograms.plan?.sessions[0]?.exercises[0]?.exerciseId).toBe(
      stubExerciseId('Bench Press'),
    );
  });

  it('reports latest-state flush failure after a committed round and repairs on retry', async () => {
    const f = await splitFixture();
    await f.raw.execAsync(
      "CREATE TRIGGER reject_repaired_program BEFORE INSERT ON program WHEN json_extract(NEW.payload, '$.sessions[0].exercises[0].exerciseId') = 'user-lunge' BEGIN SELECT RAISE(ABORT, 'flush failed'); END;",
    );
    const outcome = failed(await f.owner.apply({ kind: 'external', data: emptyData }));
    expect(outcome.stage).toBe('flush');
    expect(outcome.committedRounds).toHaveLength(1);
    expect(f.app.getState().program.savedPrograms.plan?.sessions[0]?.exercises[0]?.exerciseId).toBe('user-lunge');
    expect(weighted(await f.repository.get('loser')).blueprint.exerciseId).toBe('user-lunge');
    await f.raw.execAsync('DROP TRIGGER reject_repaired_program;');
    expect(await f.owner.apply({ kind: 'external', data: emptyData })).toEqual({ kind: 'unchanged' });
    expect(await storedPrograms(f)).toEqual([{ id: 'plan', active: true, name: 'Plan', exerciseIds: ['user-lunge'] }]);
  });

  it('contains postcommit subscriber errors and still reconciles committed identities', async () => {
    const f = await splitFixture();
    const subscriber = vi.fn(() => {
      throw new Error('view subscriber failed');
    });
    const unsubscribe = f.repository.subscribe(subscriber);
    expect(await f.owner.apply({ kind: 'external', data: emptyData })).toEqual({ kind: 'unchanged' });
    unsubscribe();
    expect(subscriber).toHaveBeenCalled();
    expect(f.logger.error).toHaveBeenCalledWith(
      'Workout commit subscriber failed',
      expect.objectContaining({ message: 'view subscriber failed' }),
    );
    expect(weighted(await f.repository.get('loser')).blueprint.exerciseId).toBe('user-lunge');
    expect(f.app.getState().program.savedPrograms.plan?.sessions[0]?.exercises[0]?.exerciseId).toBe('user-lunge');
    expect(f.app.getState().storedSessions.savedExercises['user-lunges']).toBeUndefined();
  });

  it('reports cache failure after durability and refreshes on a zero-row retry', async () => {
    const f = await fixture();
    const error = new Error('cache read unavailable');
    vi.spyOn(f.repository, 'latestPerLineage').mockRejectedValueOnce(error);
    const data = { workouts: [workout('imported')], programs: {} };
    const outcome = failed(await f.owner.apply({ kind: 'external', data }));
    expect(outcome).toMatchObject({
      stage: 'cache',
      error,
      pending: 'cache',
      durableStages: ['descriptors', 'programs', 'workouts', 'repair', 'flush'],
    });
    expect(await f.repository.existingIds(['imported'])).toEqual(new Set(['imported']));
    const insert = vi.spyOn(f.repository, 'putMany');
    expect(await f.owner.apply({ kind: 'external', data })).toEqual({ kind: 'unchanged' });
    expect(insert).not.toHaveBeenCalled();
    expect(Object.values(f.app.getState().storedSessions.latestExerciseWorkoutIds)).toEqual(['imported']);
  });

  it('preserves a newer logged performance when a cache refresh returns an older snapshot', async () => {
    const stored = workout('history');
    const f = await fixture({ workouts: [stored], exercises: { 'user-lunge': descriptor('Lunge') } });
    f.app.store.dispatch(openSession({ session: stored, slot: 'editing' }));
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const actual = f.repository.latestPerLineage.bind(f.repository);
    vi.spyOn(f.repository, 'latestPerLineage').mockImplementationOnce(async (...args) => {
      const snapshot = await actual(...args);
      entered.resolve();
      await release.promise;
      return snapshot;
    });
    const pending = f.owner.apply({ kind: 'external', data: emptyData });
    await entered.promise;
    f.app.store.dispatch(
      updateStoredSession({
        sessionId: 'history',
        update: (session) =>
          session.with({
            recordedExercises: [
              makeRecordedExercise(lunge, [20], new Weight(88, 'kilograms'), () => at.plusMinutes(1)),
            ],
          }),
      }),
    );
    await f.app.settle();
    release.resolve();
    expect(await pending).toEqual({ kind: 'unchanged' });
    const latest = Object.values(f.app.getState().storedSessions.latestExercises)[0];
    if (!(latest instanceof RecordedWeightedExercise)) throw new Error('Expected weighted cache entry');
    expect(latest.potentialSets[0]?.set?.repsCompleted).toBe(20);
    expect(latest.potentialSets[0]?.weight.value.toNumber()).toBe(88);
  });

  it('preserves program edits and active selection made while SQL repair awaits', async () => {
    const f = await splitFixture();
    const paused = await pauseMerge(f);
    f.app.store.dispatch(updateProgram({ programId: 'plan', update: (plan) => plan.withName('Latest during repair') }));
    f.app.store.dispatch(
      setSavedPlans({ plan: f.app.getState().program.savedPrograms.plan!, other: program('Other') }),
    );
    f.app.store.dispatch(setActivePlan({ activePlanId: 'other' }));
    expect(f.app.getState().program.savedPrograms.plan?.name).toBe('Latest during repair');
    paused.release.resolve();
    expect(await paused.pending).toEqual({ kind: 'unchanged' });
    await f.app.settle();
    expect(await storedPrograms(f)).toEqual([
      { id: 'plan', active: false, name: 'Latest during repair', exerciseIds: ['user-lunge'] },
      { id: 'other', active: true, name: 'Other', exerciseIds: ['user-lunge'] },
    ]);
  });

  it('keeps concurrent survivor edits and never resurrects descriptors removed during repair', async () => {
    const f = await splitFixture();
    const paused = await pauseMerge(f);
    f.app.store.dispatch(updateExercise({ id: 'user-lunges', exercise: descriptor('Lunges', 'Loser edit') }));
    f.app.store.dispatch(
      updateExercise({ id: 'user-lunge', exercise: descriptor('Latest survivor', 'Survivor edit') }),
    );
    f.app.store.dispatch(deleteExercise('removed'));
    paused.release.resolve();
    expect(await paused.pending).toEqual({ kind: 'unchanged' });
    await f.app.settle();
    expect(f.app.getState().storedSessions.savedExercises).toEqual({
      'user-lunge': descriptor('Latest survivor', 'Survivor edit'),
    });
    expect(
      (await f.db.select().from(exercisesSchema)).map((row) => [row.id, row.payload.name, row.payload.instructions]),
    ).toEqual([['user-lunge', 'Latest survivor', 'Survivor edit']]);
  });

  it('moves a loser-only edit to the survivor and preserves a hydrated replacement during repair', async () => {
    const f = await splitFixture();
    const paused = await pauseMerge(f);
    f.app.store.dispatch(
      setExercises({
        'user-lunge': f.app.getState().storedSessions.savedExercises['user-lunge']!,
        'user-lunges': descriptor('Lunges', 'Latest loser instructions'),
        replacement: descriptor('Replacement lift'),
      }),
    );
    paused.release.resolve();
    expect(await paused.pending).toEqual({ kind: 'unchanged' });
    await f.app.settle();
    expect(f.app.getState().storedSessions.savedExercises).toEqual({
      'user-lunge': descriptor('Lunges', 'Latest loser instructions'),
      replacement: descriptor('Replacement lift'),
    });
    expect((await f.db.select().from(exercisesSchema)).map((row) => [row.id, row.payload.instructions])).toEqual([
      ['user-lunge', 'Latest loser instructions'],
      ['replacement', ''],
    ]);
  });

  it('does not resurrect a survivor descriptor deleted while SQL repair awaits', async () => {
    const f = await splitFixture();
    const paused = await pauseMerge(f);
    f.app.store.dispatch(deleteExercise('user-lunge'));
    paused.release.resolve();
    expect(await paused.pending).toEqual({ kind: 'unchanged' });
    await f.app.settle();
    expect(f.app.getState().storedSessions.savedExercises).toEqual({ removed: descriptor('Never resurrect') });
    expect((await f.db.select().from(exercisesSchema)).map((row) => row.id)).toEqual(['removed']);
    expect(weighted(await f.repository.get('loser')).blueprint.exerciseId).toBe('user-lunge');
  });

  it('keeps active, editing and recent slots while queued logging writes consume repaired IDs', async () => {
    const active = workout('active', lunges);
    const editing = workout('editing', lunges);
    const recent = workout('recent', lunges);
    const f = await fixture({
      active,
      workouts: [
        workout('survivor-1'),
        workout('survivor-2'),
        workout('survivor-3'),
        workout('survivor-4'),
        editing,
        recent,
      ],
      exercises: { 'user-lunge': descriptor('Lunge'), 'user-lunges': descriptor('Lunges') },
    });
    f.app.store.dispatch(openSession({ session: editing, slot: 'editing' }));
    f.app.store.dispatch(openSession({ session: recent, slot: 'recent' }));
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const actualRepoint = f.repository.repointExercises.bind(f.repository);
    vi.spyOn(f.repository, 'repointExercises').mockImplementationOnce(async (...args) => {
      pauseNextTransaction(f.db, { entered, release });
      await actualRepoint(...args);
    });
    const pending = f.owner.apply({ kind: 'external', data: emptyData });
    await entered.promise;
    for (const id of ['active', 'editing', 'recent']) {
      f.app.store.dispatch(
        updateStoredSession({
          sessionId: id,
          update: (session) =>
            session.with({
              recordedExercises: [
                makeRecordedExercise(lunges, [17], new Weight(88, 'kilograms'), () => at.plusMinutes(1)),
              ],
            }),
        }),
      );
      expect(weighted(f.app.getState().storedSessions.sessions[id]).potentialSets[0]?.set?.repsCompleted).toBe(17);
    }
    f.app.store.dispatch(setActiveSessionId('active'));
    release.resolve();
    expect(await pending).toEqual({ kind: 'unchanged' });
    await f.app.settle();
    const state = f.app.getState().storedSessions;
    expect([state.activeSessionId, state.editingSessionId, state.recentSessionId]).toEqual([
      'active',
      'editing',
      'recent',
    ]);
    for (const id of ['active', 'editing', 'recent']) {
      const runtime = weighted(state.sessions[id]);
      const persisted = weighted(await f.repository.get(id));
      expect(runtime.blueprint.exerciseId).toBe('user-lunge');
      expect(persisted.blueprint.exerciseId).toBe('user-lunge');
      expect(persisted.potentialSets[0]?.weight.value.toNumber()).toBe(88);
      expect(persisted.potentialSets[0]?.set?.repsCompleted).toBe(17);
      expect(persisted.toJSON()).toEqual(runtime.toJSON());
    }
    expect((await f.repository.active())?.id).toBe('active');
  });

  it('replans when a built-in is hidden while the merge transaction waits', async () => {
    const plural = makeWeightedBlueprint({ name: 'Dumbbell Lunge', exerciseId: 'custom-plural', sets: 1 });
    const f = await fixture({
      exercises: { 'custom-plural': descriptor('Dumbbell Lunge') },
      workouts: [workout('plural', plural)],
    });
    f.app.store.dispatch(setBuiltInExercises({ 'Dumbbell Lunges': descriptor('Dumbbell Lunges') }));
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const actual = f.repository.repointExercises.bind(f.repository);
    vi.spyOn(f.repository, 'repointExercises').mockImplementationOnce(async (...args) => {
      pauseNextTransaction(f.db, { entered, release });
      await actual(...args);
    });
    const pending = f.owner.apply({ kind: 'external', data: emptyData });
    await entered.promise;
    f.app.store.dispatch(deleteExercise('Dumbbell Lunges'));
    release.resolve();
    expect(await pending).toEqual({ kind: 'unchanged' });
    await f.app.settle();
    expect(weighted(await f.repository.get('plural')).blueprint.exerciseId).toBe('custom-plural');
    expect(f.app.getState().storedSessions.savedExercises).toEqual({ 'custom-plural': descriptor('Dumbbell Lunge') });
    expect(f.app.getState().storedSessions.hiddenBuiltInIds).toEqual(['Dumbbell Lunges']);
    expect(f.preferences.get('HiddenBuiltInExerciseIdList')).toBe(JSON.stringify(['Dumbbell Lunges']));
  });

  it('repoints only a closed snapshot queued before the committed round', async () => {
    const f = await splitFixture();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const actual = f.repository.repointExercises.bind(f.repository);
    vi.spyOn(f.repository, 'repointExercises').mockImplementationOnce(async (...args) => {
      pauseNextTransaction(f.db, { entered, release });
      await actual(...args);
    });
    const pending = f.owner.apply({ kind: 'external', data: emptyData });
    await entered.promise;
    const closed = workout('closed-during-merge', lunges, 17, 88);
    const write = f.repository.putCurrent(() => undefined, closed);
    release.resolve();
    expect(await pending).toEqual({ kind: 'unchanged' });
    await write;
    const persisted = weighted(await f.repository.get(closed.id));
    expect(persisted.blueprint.exerciseId).toBe('user-lunge');
    expect(persisted.potentialSets[0]?.set?.repsCompleted).toBe(17);
    expect(persisted.potentialSets[0]?.weight.value.toNumber()).toBe(88);
  });

  it('keeps a later backup identity that reuses a previously merged ID under a distinct name', async () => {
    const f = await splitFixture();
    expect(await f.owner.apply({ kind: 'external', data: emptyData })).toEqual({ kind: 'unchanged' });
    const separate = makeWeightedBlueprint({ name: 'Separate lift', exerciseId: 'user-lunges', sets: 1 });
    const restored = workout('later-backup', separate, 13);
    expect(
      await f.owner.apply({
        kind: 'backup',
        data: { workouts: [restored], programs: {}, exercises: { 'user-lunges': descriptor('Separate lift') } },
      }),
    ).toEqual({ kind: 'complete', count: 1 });
    f.app.store.dispatch(openSession({ session: restored, slot: 'editing' }));
    f.app.store.dispatch(
      updateStoredSession({ sessionId: restored.id, update: (session) => session.withName('Edited later backup') }),
    );
    f.app.store.dispatch(setActiveSessionId(restored.id));
    await f.app.settle();
    expect(weighted(await f.repository.get(restored.id)).blueprint.exerciseId).toBe('user-lunges');
    expect((await f.repository.active())?.id).toBe(restored.id);
  });

  it('keeps import queues independent for two stores with matching IDs', async () => {
    const a = await fixture();
    const b = await fixture();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const actual = a.repository.putMany.bind(a.repository);
    vi.spyOn(a.repository, 'putMany').mockImplementationOnce(async (workouts) => {
      entered.resolve();
      await release.promise;
      await actual(workouts);
    });
    const pending = a.owner.apply({
      kind: 'external',
      data: { workouts: [workout('same', lunge, 8, 40)], programs: {} },
    });
    await entered.promise;
    expect(
      await b.owner.apply({ kind: 'external', data: { workouts: [workout('same', lunge, 5, 90)], programs: {} } }),
    ).toEqual({ kind: 'complete', count: 1 });
    expect(weighted(await b.repository.get('same')).potentialSets[0]?.weight.value.toNumber()).toBe(90);
    expect(await a.repository.existingIds(['same'])).toEqual(new Set());
    release.resolve();
    expect(await pending).toEqual({ kind: 'complete', count: 1 });
    expect(weighted(await a.repository.get('same')).potentialSets[0]?.weight.value.toNumber()).toBe(40);
  });

  it('does not write the startup seed marker while the shared writer is blocked', async () => {
    const f = await fixture({ hydrated: false });
    f.app.store.dispatch(setSettingsHydrated(true));
    f.app.store.dispatch(setExercisesHydrated(true));
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const actual = f.programWriter.flush.bind(f.programWriter);
    vi.spyOn(f.programWriter, 'flush').mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      await actual();
    });
    f.app.store.dispatch(initializeProgramStateSlice());
    await entered.promise;
    expect(f.preferences.has('hasSavedDefaultPlans2')).toBe(false);
    expect(await f.db.select().from(programsSchema)).toEqual([]);
    expect(f.app.getState().program.isHydrated).toBe(false);
    release.resolve();
    await f.app.settle();
    expect(f.preferences.get('hasSavedDefaultPlans2')).toBe('true');
    expect((await f.db.select().from(programsSchema)).length).toBeGreaterThan(0);
    expect(f.app.getState().program.isHydrated).toBe(true);
  });

  it('propagates ordinary writer rejections and lets each writer recover', async () => {
    const f = await splitFixture();
    vi.spyOn(f.db, 'transaction').mockRejectedValueOnce(new Error('ordinary program write failed'));
    await expect(f.programWriter.flush()).rejects.toThrow('ordinary program write failed');
    await expect(f.programWriter.flush()).resolves.toBeUndefined();
    expect(await storedPrograms(f)).toEqual([{ id: 'plan', active: true, name: 'Plan', exerciseIds: ['user-lunges'] }]);
    vi.spyOn(f.db, 'transaction').mockRejectedValueOnce(new Error('ordinary descriptor write failed'));
    await expect(f.descriptorWriter.flush()).rejects.toThrow('ordinary descriptor write failed');
    await expect(f.descriptorWriter.flush()).resolves.toBeUndefined();
    expect((await f.db.select().from(exercisesSchema)).map((row) => row.id)).toEqual([
      'user-lunge',
      'user-lunges',
      'removed',
    ]);
  });

  it('does not block another store when an ordinary writer is held', async () => {
    const a = await fixture({ programs: { plan: program('A') } });
    const b = await fixture({ programs: { plan: program('B') } });
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const held = a.programWriter.run(async (flush) => {
      entered.resolve();
      await release.promise;
      await flush();
    });
    await entered.promise;
    a.app.store.dispatch(updateProgram({ programId: 'plan', update: (plan) => plan.withName('A latest') }));
    b.app.store.dispatch(updateProgram({ programId: 'plan', update: (plan) => plan.withName('B latest') }));
    await b.app.settle();
    expect(await storedPrograms(b)).toEqual([
      { id: 'plan', active: true, name: 'B latest', exerciseIds: ['user-lunges'] },
    ]);
    expect(await storedPrograms(a)).toEqual([{ id: 'plan', active: true, name: 'A', exerciseIds: ['user-lunges'] }]);
    release.resolve();
    await held;
    await a.app.settle();
    expect(await storedPrograms(a)).toEqual([
      { id: 'plan', active: true, name: 'A latest', exerciseIds: ['user-lunges'] },
    ]);
  });

  it('writes the startup seed marker only after program durability', async () => {
    const f = await fixture({ hydrated: false });
    f.app.store.dispatch(setSettingsHydrated(true));
    f.app.store.dispatch(setExercisesHydrated(true));
    vi.spyOn(f.db, 'transaction').mockRejectedValueOnce(new Error('startup program write failed'));
    f.app.store.dispatch(initializeProgramStateSlice());
    await f.app.settle();
    expect(f.preferences.has('hasSavedDefaultPlans2')).toBe(false);
    expect(await f.db.select().from(programsSchema)).toEqual([]);
    expect(f.app.getState().program.isHydrated).toBe(false);
    f.app.store.dispatch(initializeProgramStateSlice());
    await f.app.settle();
    expect(f.preferences.get('hasSavedDefaultPlans2')).toBe('true');
    expect((await f.db.select().from(programsSchema)).length).toBeGreaterThan(0);
    expect(f.app.getState().program.isHydrated).toBe(true);
  });

  it('preserves stats commit notifications for a backup restore', async () => {
    const f = await fixture({ programs: { plan: program('Plan') } });
    applyStatsEffects(f.app.addEffect);
    f.app.store.dispatch(initializeStoredSessionsStateSlice());
    await f.app.settle();
    f.app.store.dispatch(setStatsIsDirty(false));
    expect(await f.owner.apply({ kind: 'backup', data: { workouts: [workout('imported')], programs: {} } })).toEqual({
      kind: 'complete',
      count: 1,
    });
    expect(f.app.getState().stats.isDirty).toBe(true);
  });
});

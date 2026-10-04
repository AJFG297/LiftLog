import { afterEach, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { LocalDate, OffsetDateTime, ZoneOffset } from '@js-joda/core';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { DatabaseImportService } from '@/services/database-import-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { SessionService } from '@/services/session-service';
import {
  dataMigrationsSchema,
  exercisesSchema,
  programsSchema,
  weightedSetsSchema,
  workoutExercisesSchema,
  workoutsSchema,
} from '@/db/schema';
import { toExerciseDescriptorJSON } from '@/models/exercise-models';
import { stubDescriptor } from '@/models/exercise-resolver';
import {
  exerciseIdOf,
  MovementKey,
  movementKeyFor,
  ProgramBlueprint,
  SessionBlueprint,
  stubExerciseId,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { programBlueprintMigrations } from '@/models/storage/versions/migrations';
import { RecordedExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import { Weight } from '@/models/weight';
import { legacyStubExerciseId } from '@/models/legacy-exercise-name';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { createEffectStore } from '@/utils/__test__/effect-store';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import { initializeStoredSessionsStateSlice, selectLatestExercises } from '@/store/stored-sessions';
import { setIsHydrated as setSettingsIsHydrated } from '@/store/settings';
import { calculateStats } from '@/store/stats/calculate-stats';
import type { RootState } from '@/store';
import {
  mergeExerciseNames,
  mergeExerciseNamesDataMigration,
  planStoredExerciseMerges,
} from '@/services/data-migrations/merge-exercise-names';
import { dedupeBuiltInExercisesDataMigration } from '@/services/data-migrations/dedupe-builtin-exercises';
import { restoreMuscleRolesDataMigration } from '@/services/data-migrations/restore-muscle-roles';
import { importBackendsDataMigration } from '@/services/data-migrations/import-backends';
import { seedBackendAssignmentsDataMigration } from '@/services/data-migrations/seed-backend-assignments';
import { linkExerciseIdsDataMigration } from '@/services/data-migrations/link-exercise-ids';
import { rekeyProgressionDataMigration } from '@/services/data-migrations/rekey-progression';

vi.stubEnv('TZ', 'UTC');

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  time: async (_: string, action: () => unknown) => action(),
};
const WEIGHTED = 'WeightedExerciseBlueprint';

// As linking left them before the fold was fixed: "Lunges", "Bench Press" and "Dumbbell Lunge" matched
// nothing, so each got a stub at the id the old fold derived.
const LUNGES = legacyStubExerciseId('Lunges');
const BENCH = legacyStubExerciseId('Bench Press');
const DUMBBELL_LUNGE = legacyStubExerciseId('Dumbbell Lunge');
const TYPO = legacyStubExerciseId('Bench Presss');

const lunge = makeWeightedBlueprint({ name: 'Lunge', exerciseId: 'user-lunge', sets: 2 });
const lunges = makeWeightedBlueprint({ name: 'Lunges', exerciseId: LUNGES, sets: 2 });
const bench = makeWeightedBlueprint({ name: 'Bench Press', exerciseId: BENCH, sets: 2 });
const dumbbellLunge = makeWeightedBlueprint({ name: 'Dumbbell Lunge', exerciseId: DUMBBELL_LUNGE, sets: 2 });

function workout(id: string, day: number, exercises: [WeightedExerciseBlueprint, number][]): Session {
  const at = (index: number) => OffsetDateTime.of(2026, 3, day, 10, 0, index, 0, ZoneOffset.UTC);
  return new Session(
    id,
    new SessionBlueprint(
      'Legs',
      exercises.map(([blueprint]) => blueprint),
      '',
    ),
    exercises.map(([blueprint, kg]) => makeRecordedExercise(blueprint, [10, 10], new Weight(kg, 'kilograms'), at)),
    LocalDate.of(2026, 3, day),
    undefined,
    undefined,
  );
}

/**
 * Lunge in the first two weeks, Lunges in the next two. Each Lunges week beats the one before it but not
 * the heaviest Lunge, so neither is a record once they are one exercise.
 */
const history = [
  workout('w1', 2, [
    [lunge, 40],
    [bench, 80],
  ]),
  workout('w2', 9, [
    [lunge, 42.5],
    [dumbbellLunge, 20],
  ]),
  workout('w3', 16, [[lunges, 41]]),
  workout('w4', 23, [[lunges, 42]]),
];

const descriptors = {
  'user-lunge': stubDescriptor('Lunge'),
  [LUNGES]: { ...stubDescriptor('Lunges'), equipment: 'bodyweight' },
  [BENCH]: stubDescriptor('Bench Press'),
  [DUMBBELL_LUNGE]: stubDescriptor('Dumbbell Lunge'),
};

/** A database as a build with the old fold left it, every earlier data migration already run. */
async function splitDb(): Promise<ExpoSQLiteDatabase> {
  const db = drizzle(await openDatabaseAsync(':memory:'));
  await new DatabaseMigrationService(db, logger as never, { importOldData: async () => {} }).migrate();
  await db
    .insert(dataMigrationsSchema)
    .values(
      [
        dedupeBuiltInExercisesDataMigration,
        restoreMuscleRolesDataMigration,
        importBackendsDataMigration,
        seedBackendAssignmentsDataMigration,
        linkExerciseIdsDataMigration,
        rekeyProgressionDataMigration,
      ].map((id) => ({ id })),
    );
  await db
    .insert(exercisesSchema)
    .values(Object.entries(descriptors).map(([id, x]) => ({ id, payload: toExerciseDescriptorJSON(x) })));
  await new WorkoutRepository(db).putMany(history);
  const plan = new ProgramBlueprint(
    'Plan',
    [new SessionBlueprint('Legs', [lunges, bench, dumbbellLunge, lunge], '')],
    LocalDate.of(2026, 3, 1),
  );
  await db.insert(programsSchema).values({ id: 'plan', active: true, payload: plan.toJSON() });
  return db;
}

/** Adds a stub of the typo "Bench Presss", which the old fold put at Bench Press's new stub id. */
async function withTypo(db: ExpoSQLiteDatabase) {
  const typo = makeWeightedBlueprint({ name: 'Bench Presss', exerciseId: TYPO, sets: 2 });
  await db
    .insert(exercisesSchema)
    .values({ id: TYPO, payload: toExerciseDescriptorJSON(stubDescriptor('Bench Presss')) });
  await new WorkoutRepository(db).putMany([workout('w5', 30, [[typo, 60]])]);
  return db;
}

/** Startup's data migrations, as `DatabaseMigrationService.migrate` runs them. */
async function runDataMigrations(db: ExpoSQLiteDatabase, hidden: string[] = []) {
  const keyValueStore = { getItem: () => Promise.resolve(JSON.stringify(hidden)), setItem: vi.fn() };
  await new DatabaseImportService(db, keyValueStore as never, {} as never).importOldData();
}

async function startApp(db: ExpoSQLiteDatabase) {
  const workoutRepository = new WorkoutRepository(db);
  let getState: () => RootState = () => {
    throw new Error('not started');
  };
  const sessionService = new SessionService(workoutRepository, () => getState());
  const harness = createEffectStore({
    db,
    workoutRepository,
    sessionService,
    logger: logger as never,
    keyValueStore: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() } as never,
  });
  getState = harness.getState;
  applyStoredSessionsEffects(harness.addEffect);
  harness.store.dispatch(setSettingsIsHydrated(true));
  harness.store.dispatch(initializeStoredSessionsStateSlice());
  await harness.settle();
  return { ...harness, sessionService, workoutRepository };
}

/** Every row the merge can touch, in a stable order. */
async function tables(db: ExpoSQLiteDatabase) {
  const sorted = <T>(rows: T[]) => rows.map((x) => JSON.stringify(x)).sort();
  return {
    exercises: sorted(await db.select().from(exercisesSchema)),
    programs: sorted(await db.select().from(programsSchema)),
    workouts: sorted(await db.select().from(workoutsSchema)),
    workoutExercises: sorted(await db.select().from(workoutExercisesSchema)),
    sets: sorted(await db.select().from(weightedSetsSchema)),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mergeExerciseNames', () => {
  it('makes Lunge and Lunges one exercise everywhere the user looks', async () => {
    const db = await splitDb();

    await runDataMigrations(db);
    const app = await startApp(db);
    const state = app.getState();

    // One exercise in manage-exercises; the plural's equipment filled in.
    expect(state.storedSessions.savedExercises).toEqual({
      'user-lunge': { ...stubDescriptor('Lunge'), equipment: 'bodyweight' },
      [stubExerciseId('Bench Press')]: stubDescriptor('Bench Press'),
    });
    expect(Object.values(state.storedSessions.savedExercises).filter((x) => /lunge/i.test(x.name))).toHaveLength(1);

    // One exercise history, newest first.
    const key = movementKeyFor('user-lunge', WEIGHTED);
    const performances = await app.workoutRepository.previousPerformances([key, movementKeyFor(LUNGES, WEIGHTED)]);
    const performed = (x: RecordedExercise) =>
      `${x.blueprint.name} ${(x as RecordedWeightedExercise).potentialSets[0]!.weight.value.toString()}`;
    expect(performances.get(key)!.map(performed)).toEqual(['Lunges 42', 'Lunges 41', 'Lunge 42.5', 'Lunge 40']);
    expect(performances.get(movementKeyFor(LUNGES, WEIGHTED)) ?? []).toEqual([]);

    // One stats row.
    const range = { from: LocalDate.of(2026, 3, 1), to: LocalDate.of(2026, 3, 31) };
    const stats = calculateStats(await app.workoutRepository.finishedBetween(range.from, range.to), 'kilograms', range);
    expect(
      stats.weightedExerciseStats
        .map((x) => `${x.exerciseId} ${x.maxLiftedPerSessionStatistics.maxValue.value.toString()}`)
        .sort(),
    ).toEqual([`${stubExerciseId('Bench Press')} 80`, 'Dumbbell Lunges 20', 'user-lunge 42.5'].sort());

    // Records across both: apart, the second Lunges week would be one.
    const records = await app.workoutRepository.personalRecords();
    expect(Object.fromEntries([...records].map(([id, x]) => [id, x.map((r) => r.exerciseName)]))).toEqual({
      w2: ['Lunge'],
    });

    // Carry-over continues from the latest of either.
    const lineage = `user-lunge_${WEIGHTED}`;
    expect(state.storedSessions.latestExerciseWorkoutIds[lineage as never]).toBe('w4');
    const upcoming = await app.sessionService
      .getUpcomingSessions([new SessionBlueprint('Legs', [lunge], '')], selectLatestExercises(state))
      .next();
    const carried = (upcoming.value as Session).recordedExercises[0] as ReturnType<typeof makeRecordedExercise>;
    expect(carried.potentialSets.map((x) => x.weight.value.toNumber())).toEqual([44.5, 44.5]);

    // Every stored key is the survivor's; the plan points at the survivors.
    const rows = await db.select().from(workoutExercisesSchema);
    expect(rows.map((x) => `${x.workoutId}/${x.position} ${x.movementKey} ${x.lineage}`).sort()).toEqual([
      `w1/0 user-lunge|${WEIGHTED} user-lunge_${WEIGHTED}`,
      `w1/1 ${stubExerciseId('Bench Press')}|${WEIGHTED} ${stubExerciseId('Bench Press')}_${WEIGHTED}`,
      `w2/0 user-lunge|${WEIGHTED} user-lunge_${WEIGHTED}`,
      `w2/1 Dumbbell Lunges|${WEIGHTED} Dumbbell Lunges_${WEIGHTED}`,
      `w3/0 user-lunge|${WEIGHTED} user-lunge_${WEIGHTED}`,
      `w4/0 user-lunge|${WEIGHTED} user-lunge_${WEIGHTED}`,
    ]);
    const [program] = await db.select().from(programsSchema);
    const plan = ProgramBlueprint.fromJSON(programBlueprintMigrations.migrate(program!.payload));
    expect(plan.sessions[0]!.exercises.map((x) => x.exerciseId)).toEqual([
      'user-lunge',
      stubExerciseId('Bench Press'),
      'Dumbbell Lunges',
      'user-lunge',
    ]);
    expect((await db.select().from(dataMigrationsSchema)).map((x) => x.id)).toContain(mergeExerciseNamesDataMigration);
  });

  it('keeps every stub at the id its name derives, so an unlinked blueprint finds its history', async () => {
    const db = await splitDb();
    await runDataMigrations(db);

    for (const row of await db.select().from(exercisesSchema)) {
      if (row.id !== 'user-lunge') {
        expect(row.id).toBe(stubExerciseId(row.payload.name));
      }
    }
    // A friend's feed item names the exercise without an id.
    const unlinked = WeightedExerciseBlueprint.of({ name: 'bench press' });
    const performances = await new WorkoutRepository(db).previousPerformances([unlinked.movementKey()]);
    expect(performances.get(unlinked.movementKey())!.map((x) => x.blueprint.name)).toEqual(['Bench Press']);
  });

  it('changes nothing the second time', async () => {
    const db = await splitDb();
    await runDataMigrations(db);
    const after = await tables(db);

    expect(await planStoredExerciseMerges(db, [])).toEqual([]);
    const repoint = vi.spyOn(WorkoutRepository.prototype, 'repointExercises');
    await mergeExerciseNames(db, []);

    expect(repoint).not.toHaveBeenCalled();
    expect(await tables(db)).toEqual(after);
  });

  it('writes none of the data of a user with no duplicates', async () => {
    const db = await splitDb();
    await db.delete(exercisesSchema);
    await db.insert(exercisesSchema).values([
      { id: 'user-lunge', payload: toExerciseDescriptorJSON(stubDescriptor('Lunge')) },
      { id: stubExerciseId('Sissy Squat'), payload: toExerciseDescriptorJSON(stubDescriptor('Sissy Squat')) },
    ]);
    const before = await tables(db);
    const repoint = vi.spyOn(WorkoutRepository.prototype, 'repointExercises');

    await runDataMigrations(db);

    expect(repoint).not.toHaveBeenCalled();
    expect(await tables(db)).toEqual(before);
    expect((await db.select().from(dataMigrationsSchema)).map((x) => x.id)).toContain(mergeExerciseNamesDataMigration);
  });

  it('never merges into a built-in the user deleted', async () => {
    const db = await splitDb();
    await runDataMigrations(db, ['Dumbbell Lunges']);

    expect((await db.select().from(exercisesSchema)).find((x) => x.id === DUMBBELL_LUNGE)?.payload.name).toBe(
      'Dumbbell Lunge',
    );
  });

  it('moves a stub out of the way before giving its id to another, leaving no workout on a deleted exercise', async () => {
    const db = await withTypo(await splitDb());

    const rounds = await mergeExerciseNames(db, []);

    expect(rounds.map((round) => round.map((x) => `${x.normalizedName} -> ${x.survivor.id}`))).toEqual([
      ['bench presss -> ' + stubExerciseId('Bench Presss'), 'dumbbell lunge -> Dumbbell Lunges', 'lunge -> user-lunge'],
      ['bench press -> ' + stubExerciseId('Bench Press')],
    ]);
    const exercises = new Set((await db.select().from(exercisesSchema)).map((x) => x.id));
    const rows = await db.select().from(workoutExercisesSchema);
    for (const row of rows) {
      const id = exerciseIdOf(row.movementKey as MovementKey);
      expect(exercises.has(id) || id === 'Dumbbell Lunges').toBe(true);
    }
    expect(
      rows.filter((x) => x.workoutId === 'w1' || x.workoutId === 'w5').map((x) => `${x.workoutId} ${x.movementKey}`),
    ).toEqual([
      `w1 user-lunge|${WEIGHTED}`,
      `w1 ${stubExerciseId('Bench Press')}|${WEIGHTED}`,
      `w5 ${stubExerciseId('Bench Presss')}|${WEIGHTED}`,
    ]);
  });

  it('numbers a workout that logged both exercises as a repeat, and carries each place on', async () => {
    const db = await splitDb();
    await new WorkoutRepository(db).putMany([
      workout('w5', 30, [
        [lunge, 43],
        [lunges, 30],
      ]),
    ]);

    await runDataMigrations(db);

    const rows = await db.select().from(workoutExercisesSchema);
    expect(rows.filter((x) => x.workoutId === 'w5').map((x) => x.lineage)).toEqual([
      `user-lunge_${WEIGHTED}`,
      `user-lunge_${WEIGHTED}#2`,
    ]);
    const app = await startApp(db);
    const latest = selectLatestExercises(app.getState());
    const weightOf = (lineage: string) =>
      (latest[lineage as never] as RecordedWeightedExercise | undefined)?.potentialSets[0]!.weight.value.toNumber();
    expect([weightOf(`user-lunge_${WEIGHTED}`), weightOf(`user-lunge_${WEIGHTED}#2`)]).toEqual([43, 30]);
    // As for an exercise logged twice in one workout: a routine with Lunge once carries from the first
    // place, and one with it twice carries each place on.
    const carried = async (exercises: WeightedExerciseBlueprint[]) => {
      const upcoming = await app.sessionService
        .getUpcomingSessions([new SessionBlueprint('Legs', exercises, '')], latest)
        .next();
      return (upcoming.value as Session).recordedExercises.map((x) =>
        (x as RecordedWeightedExercise).potentialSets[0]!.weight.value.toNumber(),
      );
    };
    expect(await carried([lunge])).toEqual([45.5]);
    expect(await carried([lunge, lunge])).toEqual([45.5, 32.5]);
  });

  it('leaves every row as it was when a round is killed, and finishes on the next run', async () => {
    const uninterrupted = await withTypo(await splitDb());
    await mergeExerciseNames(uninterrupted, []);

    const crashed = await withTypo(await splitDb());
    const before = await tables(crashed);
    const repoint = WorkoutRepository.prototype.repointExercises;
    vi.spyOn(WorkoutRepository.prototype, 'repointExercises').mockImplementation(
      function (this: WorkoutRepository, survivorOf, alsoWrite) {
        return repoint.call(this, survivorOf, (tx) => [
          ...alsoWrite!(tx),
          {
            run: () => {
              throw new Error('killed');
            },
          },
        ]);
      },
    );
    await expect(mergeExerciseNames(crashed, [])).rejects.toThrow('killed');
    vi.restoreAllMocks();
    expect(await tables(crashed)).toEqual(before);

    await mergeExerciseNames(crashed, []);

    expect(await tables(crashed)).toEqual(await tables(uninterrupted));
    expect(await planStoredExerciseMerges(crashed, [])).toEqual([]);
  });

  it('finishes the second round on the next run when killed between rounds', async () => {
    const uninterrupted = await withTypo(await splitDb());
    await mergeExerciseNames(uninterrupted, []);

    const crashed = await withTypo(await splitDb());
    const repoint = WorkoutRepository.prototype.repointExercises;
    let rounds = 0;
    vi.spyOn(WorkoutRepository.prototype, 'repointExercises').mockImplementation(
      function (this: WorkoutRepository, survivorOf, alsoWrite) {
        return ++rounds === 2 ? Promise.reject(new Error('killed')) : repoint.call(this, survivorOf, alsoWrite);
      },
    );
    await expect(mergeExerciseNames(crashed, [])).rejects.toThrow('killed');
    vi.restoreAllMocks();

    await mergeExerciseNames(crashed, []);

    expect(await tables(crashed)).toEqual(await tables(uninterrupted));
  });
});

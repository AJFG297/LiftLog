import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { eq, inArray, sql } from 'drizzle-orm';
import { dataMigrationsSchema, exercisesSchema, programsSchema } from '@/db/schema';
import { ExerciseBlueprint, ExerciseId, ProgramBlueprint } from '@/models/blueprint-models';
import { fromExerciseDescriptorJSON, toExerciseDescriptorJSON } from '@/models/exercise-models';
import { ExerciseMerge, planExerciseMerges } from '@/models/exercise-merge';
import { mapProgramExercises } from '@/models/map-exercise-blueprints';
import { exerciseDescriptorMigrations, programBlueprintMigrations } from '@/models/storage/versions/migrations';
import { loadBuiltInExerciseNames, loadCanonicalBuiltInExercises } from '@/services/exercise-catalog';
import { WorkoutRepository } from '@/services/workout-repository';

export const mergeExerciseNamesDataMigration = 'MERGE_PLURAL_EXERCISE_NAMES';

/**
 * The merges {@link mergeExerciseNames} would apply to `db`, read from the exercise table and one count of
 * workouts per exercise. Also what the dry run prints.
 */
export async function planStoredExerciseMerges(
  db: ExpoSQLiteDatabase,
  hiddenBuiltInIds: readonly ExerciseId[],
): Promise<ExerciseMerge[]> {
  const [rows, builtInNames, builtInExercises, usage] = await Promise.all([
    db.select().from(exercisesSchema),
    loadBuiltInExerciseNames(),
    loadCanonicalBuiltInExercises(),
    new WorkoutRepository(db).exerciseUsage(),
  ]);
  return planExerciseMerges({
    savedExercises: Object.fromEntries(
      rows.map((row) => [row.id, fromExerciseDescriptorJSON(exerciseDescriptorMigrations.migrate(row.payload))]),
    ),
    builtInNames,
    builtInExercises,
    hiddenBuiltInIds,
    usage,
  });
}

/**
 * A name fold that kept `Lunge` and `Lunges` apart gave each its own exercise when workouts were linked
 * (`LINK_EXERCISE_IDS`), splitting their history. Merge every group the fold now joins, and move each stub
 * to the id its name derives (see `planExerciseMerges`). Returns the merges applied, round by round: a
 * stub whose new id another stub is leaving waits a round for it.
 *
 * Each round is one transaction, so a run that stops part way leaves whole rounds and plans the rest
 * again. Workouts are rewritten in SQL (`WorkoutRepository.repointExercises`): reading and writing back
 * thousands of them took over a second at startup. A user with nothing to merge has none of their data
 * written. Also run after every restore or import, whatever `data_migrations` says: see `upsertStoredSessions`.
 */
export async function mergeExerciseNames(
  db: ExpoSQLiteDatabase,
  hiddenBuiltInIds: readonly ExerciseId[],
  workoutRepository = new WorkoutRepository(db),
): Promise<ExerciseMerge[][]> {
  const rounds: ExerciseMerge[][] = [];
  for (;;) {
    const merges = await planStoredExerciseMerges(db, hiddenBuiltInIds);
    if (!merges.length) {
      break;
    }
    await applyExerciseMerges(db, workoutRepository, merges);
    rounds.push(merges);
  }
  await db.insert(dataMigrationsSchema).values({ id: mergeExerciseNamesDataMigration }).onConflictDoNothing();
  return rounds;
}

async function applyExerciseMerges(
  db: ExpoSQLiteDatabase,
  workoutRepository: WorkoutRepository,
  merges: ExerciseMerge[],
) {
  const survivorOf = survivorsOf(merges);
  const survivors = merges.flatMap(({ survivor, survivorDescriptor }) =>
    survivorDescriptor ? [{ id: survivor.id, payload: toExerciseDescriptorJSON(survivorDescriptor) }] : [],
  );
  const programs = (await db.select().from(programsSchema)).flatMap((row) => {
    const program = ProgramBlueprint.fromJSON(programBlueprintMigrations.migrate(row.payload));
    const payload = repointProgram(program, [merges]).toJSON();
    return JSON.stringify(payload) === JSON.stringify(program.toJSON()) ? [] : [{ id: row.id, payload }];
  });

  await workoutRepository.repointExercises(survivorOf, (tx) => [
    tx.delete(exercisesSchema).where(inArray(exercisesSchema.id, [...survivorOf.keys()])),
    ...(survivors.length
      ? [
          tx
            .insert(exercisesSchema)
            .values(survivors)
            .onConflictDoUpdate({
              target: exercisesSchema.id,
              set: { payload: sql.raw(`excluded.${exercisesSchema.payload.name}`) },
            }),
        ]
      : []),
    ...programs.map(({ id, payload }) => tx.update(programsSchema).set({ payload }).where(eq(programsSchema.id, id))),
  ]);
}

/** `program` with each merged exercise pointed at its survivor, round after round. */
export function repointProgram(program: ProgramBlueprint, rounds: readonly ExerciseMerge[][]): ProgramBlueprint {
  return rounds.reduce((result, merges) => {
    const survivorOf = survivorsOf(merges);
    return mapProgramExercises(result, <T extends ExerciseBlueprint>(blueprint: T): T => {
      const survivor = survivorOf.get(blueprint.exerciseId);
      return survivor === undefined ? blueprint : (blueprint.with({ exerciseId: survivor }) as T);
    });
  }, program);
}

function survivorsOf(merges: readonly ExerciseMerge[]): Map<ExerciseId, ExerciseId> {
  return new Map(merges.flatMap((merge) => merge.mergedIds.map((id) => [id, merge.survivor.id] as const)));
}

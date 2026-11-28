import { eq } from 'drizzle-orm';
import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { dataMigrationsSchema, programsSchema } from '@/db/schema';
import { ProgramBlueprint, withAssignedRoutineIds } from '@/models/blueprint-models';
import { FREEFORM_WORKOUT_NAME } from '@/models/session-models';
import { programBlueprintMigrations } from '@/models/storage/versions/migrations';
import { WorkoutRepository } from '@/services/workout-repository';

export const linkRoutineIdsDataMigration = 'LINK_ROUTINE_IDS';

export interface RoutineStampCandidate {
  id: string;
  name: string;
  active: boolean;
  movementKeys: ReadonlySet<string>;
}

export interface UnstampedWorkout {
  id: string;
  name: string;
  movementKeys: ReadonlySet<string>;
}

export interface LinkRoutineIdsOptions {
  /** Assign missing ids onto saved programs in SQLite. False during runtime imports owned by `ProgramWriter`. */
  updatePrograms?: boolean;
  /** Record `LINK_ROUTINE_IDS` in `data_migration`. False during runtime imports. */
  recordMigration?: boolean;
}

/**
 * Picks a routine id for each unstamped workout that can be matched without guessing.
 *
 * A name owned by one routine id matches unconditionally. When several routines share a name
 * (such as the built-in Push, Pull, Legs, Workout A and Workout B routines), exercise overlap
 * picks the unique best match; a tie with overlap breaks in favour of a unique match in the
 * active program. Anything still ambiguous stays unstamped.
 */
export function planRoutineIdStamps(
  candidates: readonly RoutineStampCandidate[],
  workouts: readonly UnstampedWorkout[],
): Map<string, string> {
  const byName = new Map<string, RoutineStampCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.id || candidate.name === FREEFORM_WORKOUT_NAME) {
      continue;
    }
    const list = byName.get(candidate.name) ?? [];
    list.push(candidate);
    byName.set(candidate.name, list);
  }

  const stamps = new Map<string, string>();
  for (const workout of workouts) {
    if (workout.name === FREEFORM_WORKOUT_NAME) {
      continue;
    }
    const matches = byName.get(workout.name);
    if (!matches?.length) {
      continue;
    }
    const distinctIds = new Set(matches.map((candidate) => candidate.id));
    if (distinctIds.size === 1) {
      stamps.set(workout.id, matches[0]!.id);
      continue;
    }

    const scored = matches.map((candidate) => ({
      candidate,
      score: jaccard(workout.movementKeys, candidate.movementKeys),
    }));
    const best = scored.reduce((max, entry) => Math.max(max, entry.score), 0);
    if (best === 0) {
      continue;
    }
    const top = scored.filter((entry) => entry.score === best).map((entry) => entry.candidate);
    const topIds = new Set(top.map((candidate) => candidate.id));
    if (topIds.size === 1) {
      stamps.set(workout.id, top[0]!.id);
      continue;
    }
    const activeTopIds = new Set(top.filter((candidate) => candidate.active).map((candidate) => candidate.id));
    if (activeTopIds.size === 1) {
      stamps.set(workout.id, [...activeTopIds][0]!);
    }
  }
  return stamps;
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) {
    return 0;
  }
  let shared = 0;
  for (const key of a) {
    if (b.has(key)) {
      shared += 1;
    }
  }
  return shared === 0 ? 0 : shared / (a.size + b.size - shared);
}

/**
 * Plans stored before a routine had an id only name their workouts. Assigns missing routine ids
 * (when `updatePrograms` is true) and stamps each unstamped workout through `WorkoutRepository`
 * whenever its routine can be identified unambiguously. Safe to run repeatedly.
 */
export async function linkRoutineIds(
  db: ExpoSQLiteDatabase,
  workoutRepository = new WorkoutRepository(db),
  options: LinkRoutineIdsOptions = {},
): Promise<void> {
  const { updatePrograms = true, recordMigration = true } = options;
  const rows = await db.select().from(programsSchema);
  const changedPrograms: { id: string; payload: ReturnType<ProgramBlueprint['toJSON']> }[] = [];
  const candidates: RoutineStampCandidate[] = [];

  for (const row of rows) {
    const parsed = ProgramBlueprint.fromJSON(programBlueprintMigrations.migrate(row.payload));
    const program = updatePrograms ? withAssignedRoutineIds(parsed) : parsed;
    if (updatePrograms && program !== parsed) {
      changedPrograms.push({ id: row.id, payload: program.toJSON() });
    }
    for (const routine of program.sessions) {
      if (!routine.id || routine.name === FREEFORM_WORKOUT_NAME) {
        continue;
      }
      candidates.push({
        id: routine.id,
        name: routine.name,
        active: row.active,
        movementKeys: new Set(routine.exercises.map((exercise) => exercise.movementKey())),
      });
    }
  }

  const unstamped = await workoutRepository.unstampedRoutineWorkouts();
  const idsByName = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const ids = idsByName.get(candidate.name) ?? new Set<string>();
    ids.add(candidate.id);
    idsByName.set(candidate.name, ids);
  }
  const ambiguousIds = unstamped
    .filter((workout) => (idsByName.get(workout.name)?.size ?? 0) > 1)
    .map((workout) => workout.id);
  const movementKeysByWorkout: ReadonlyMap<string, ReadonlySet<string>> = ambiguousIds.length
    ? await workoutRepository.movementKeysOf(ambiguousIds)
    : new Map();
  const emptyKeys = new Set<string>();
  const stamps = planRoutineIdStamps(
    candidates,
    unstamped.map((workout) => ({
      id: workout.id,
      name: workout.name,
      movementKeys: movementKeysByWorkout.get(workout.id) ?? emptyKeys,
    })),
  );

  if (!stamps.size && !changedPrograms.length && !recordMigration) {
    return;
  }

  await workoutRepository.stampRoutineIds(stamps, (tx) => [
    ...changedPrograms.map(({ id, payload }) =>
      tx.update(programsSchema).set({ payload }).where(eq(programsSchema.id, id)),
    ),
    ...(recordMigration
      ? [tx.insert(dataMigrationsSchema).values({ id: linkRoutineIdsDataMigration }).onConflictDoNothing()]
      : []),
  ]);
}

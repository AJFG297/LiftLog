import { and, eq, isNull } from 'drizzle-orm';
import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { writeAtomically } from '@/db/helpers';
import { dataMigrationsSchema, programsSchema, workoutsSchema } from '@/db/schema';
import { ProgramBlueprint, withAssignedRoutineIds } from '@/models/blueprint-models';
import { FREEFORM_WORKOUT_NAME } from '@/models/session-models';
import { programBlueprintMigrations } from '@/models/storage/versions/migrations';

export const linkRoutineIdsDataMigration = 'LINK_ROUTINE_IDS';

/**
 * Plans stored before a routine had an id only name their workouts. Give each routine an id and, where
 * one name belongs to exactly one routine, stamp that id on the workouts that still have none.
 *
 * A name shared by two routines is left unstamped: either one could be the workout, and a later rename
 * of one of them still finds the workouts through the name. Safe to run twice. A routine that already
 * has an id keeps it, and a stamp is only written where `routine_id` is null.
 */
export async function linkRoutineIds(db: ExpoSQLiteDatabase) {
  const programs = (await db.select().from(programsSchema)).map((row) => ({
    id: row.id,
    program: withAssignedRoutineIds(ProgramBlueprint.fromJSON(programBlueprintMigrations.migrate(row.payload))),
  }));
  const idsByName = new Map<string, Set<string>>();
  for (const { program } of programs) {
    for (const routine of program.sessions) {
      if (!routine.id || routine.name === FREEFORM_WORKOUT_NAME) {
        continue;
      }
      const ids = idsByName.get(routine.name) ?? new Set<string>();
      ids.add(routine.id);
      idsByName.set(routine.name, ids);
    }
  }

  await writeAtomically(db, (tx) => [
    ...programs.map(({ id, program }) =>
      tx.update(programsSchema).set({ payload: program.toJSON() }).where(eq(programsSchema.id, id)),
    ),
    ...[...idsByName].flatMap(([name, ids]) =>
      ids.size === 1
        ? [
            tx
              .update(workoutsSchema)
              .set({ routineId: [...ids][0]! })
              .where(and(isNull(workoutsSchema.routineId), eq(workoutsSchema.name, name))),
          ]
        : [],
    ),
    tx.insert(dataMigrationsSchema).values({ id: linkRoutineIdsDataMigration }).onConflictDoNothing(),
  ]);
}

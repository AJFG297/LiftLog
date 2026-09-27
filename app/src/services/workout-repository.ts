import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { cardioSetsSchema, weightedSetsSchema, workoutExercisesSchema, workoutsSchema } from '@/db/schema';
import { Transaction, writeAtomically } from '@/db/helpers';
import { Session } from '@/models/session-models';
import {
  CardioSetRow,
  WeightedSetRow,
  WorkoutExerciseRow,
  WorkoutRows,
  fromWorkoutRows,
  toWorkoutRows,
} from '@/services/workout-rows';

type Statement = { run(): unknown };

// Keeps every statement under SQLite's historical 999 bound-parameter limit.
const MAX_PARAMETERS = 999;

/**
 * Owns every write to the workout tables. Each write is one transaction that touches only the rows of the
 * workouts it is given: the workout row is upserted, and its exercises and sets are replaced.
 *
 * The `active` flag has a single writer, {@link setActive}. Content writes never change it: a new row
 * starts inactive, and an existing one keeps its flag.
 */
export class WorkoutRepository {
  constructor(private readonly db: ExpoSQLiteDatabase) {}

  /** Every stored workout, and which one (if any) is in progress. */
  async loadAll(): Promise<{ workouts: Session[]; activeWorkoutId: string | undefined }> {
    const [workouts, exercises, weightedSets, cardioSets] = await Promise.all([
      this.db.select().from(workoutsSchema),
      this.db.select().from(workoutExercisesSchema),
      this.db.select().from(weightedSetsSchema),
      this.db.select().from(cardioSetsSchema),
    ]);
    const exercisesByWorkout = groupByWorkout(exercises);
    const weightedSetsByWorkout = groupByWorkout(weightedSets);
    const cardioSetsByWorkout = groupByWorkout(cardioSets);
    return {
      workouts: workouts.map(({ active: _, ...workout }) =>
        fromWorkoutRows({
          workout,
          exercises: exercisesByWorkout.get(workout.id) ?? [],
          weightedSets: weightedSetsByWorkout.get(workout.id) ?? [],
          cardioSets: cardioSetsByWorkout.get(workout.id) ?? [],
        }),
      ),
      activeWorkoutId: workouts.find((x) => x.active)?.id,
    };
  }

  /** Writes one workout's content. */
  put(session: Session): Promise<void> {
    return this.putMany([session]);
  }

  /**
   * Writes many workouts' content in one transaction, for backup restore and CSV import. Restored workouts
   * are never active, and a workout in progress on this device keeps its flag.
   */
  putMany(sessions: Session[]): Promise<void> {
    if (!sessions.length) {
      return Promise.resolve();
    }
    const rows = sessions.map(toWorkoutRows);
    return writeAtomically(this.db, (tx) => writeContent(tx, rows, { activate: false }));
  }

  delete(workoutId: string): Promise<void> {
    return writeAtomically(this.db, (tx) => [
      ...deleteChildren(tx, [workoutId]),
      tx.delete(workoutsSchema).where(eq(workoutsSchema.id, workoutId)),
    ]);
  }

  /**
   * Makes `session` the one active workout, or clears it. It writes the workout's content too rather than
   * only flipping the flag, so it doesn't depend on a content write having landed first: the two are
   * dispatched together and race.
   */
  setActive(session: Session | undefined): Promise<void> {
    return writeAtomically(this.db, (tx) => [
      tx.update(workoutsSchema).set({ active: false }).where(eq(workoutsSchema.active, true)),
      ...(session ? writeContent(tx, [toWorkoutRows(session)], { activate: true }) : []),
    ]);
  }
}

function writeContent(tx: Transaction, rows: WorkoutRows[], { activate }: { activate: boolean }): Statement[] {
  const workoutIds = rows.map((x) => x.workout.id);
  const { id: _, active: __, ...contentColumns } = getTableColumns(workoutsSchema);
  return [
    ...chunked(
      workoutsSchema,
      rows.map((x) => ({ ...x.workout, active: activate })),
    ).map((chunk) =>
      tx
        .insert(workoutsSchema)
        .values(chunk)
        .onConflictDoUpdate({
          target: workoutsSchema.id,
          set: {
            ...excludedValues(contentColumns),
            ...(activate ? { active: true } : {}),
          },
        }),
    ),
    ...deleteChildren(tx, workoutIds),
    ...insertAll(
      tx,
      workoutExercisesSchema,
      rows.flatMap((x): WorkoutExerciseRow[] => x.exercises),
    ),
    ...insertAll(
      tx,
      weightedSetsSchema,
      rows.flatMap((x): WeightedSetRow[] => x.weightedSets),
    ),
    ...insertAll(
      tx,
      cardioSetsSchema,
      rows.flatMap((x): CardioSetRow[] => x.cardioSets),
    ),
  ];
}

function deleteChildren(tx: Transaction, workoutIds: string[]): Statement[] {
  return chunkedValues(workoutIds, MAX_PARAMETERS).flatMap((ids) => [
    tx.delete(weightedSetsSchema).where(inArray(weightedSetsSchema.workoutId, ids)),
    tx.delete(cardioSetsSchema).where(inArray(cardioSetsSchema.workoutId, ids)),
    tx.delete(workoutExercisesSchema).where(inArray(workoutExercisesSchema.workoutId, ids)),
  ]);
}

function insertAll<TTable extends SQLiteTable>(
  tx: Transaction,
  table: TTable,
  values: TTable['$inferInsert'][],
): Statement[] {
  return chunked(table, values).map((chunk) => tx.insert(table).values(chunk));
}

function chunked<TTable extends SQLiteTable, T>(table: TTable, values: T[]): T[][] {
  const perRow = Object.keys(getTableColumns(table)).length;
  return chunkedValues(values, Math.max(1, Math.floor(MAX_PARAMETERS / perRow)));
}

function chunkedValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

/** `SET column = excluded.column` for each column, so an upsert takes the incoming row's values. */
function excludedValues(columns: Record<string, SQLiteColumn>) {
  return Object.fromEntries(
    Object.entries(columns).map(([key, column]) => [key, sql.raw(`excluded.${column.name}`)] as const),
  );
}

function groupByWorkout<T extends { workoutId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const group = grouped.get(row.workoutId);
    if (group) {
      group.push(row);
    } else {
      grouped.set(row.workoutId, [row]);
    }
  }
  return grouped;
}

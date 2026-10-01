import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { SQL, and, asc, count, desc, eq, getTableColumns, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { LocalDate } from '@js-joda/core';
import {
  cardioSetsSchema,
  warmupSetsSchema,
  weightedSetsSchema,
  workoutExercisesSchema,
  workoutsSchema,
} from '@/db/schema';
import { Transaction, writeAtomically } from '@/db/helpers';
import { Session } from '@/models/session-models';
import { effectiveLoad } from '@/models/session-models/recorded-weighted-exercise';
import { SET_KIND_RULES, SetKind } from '@/models/session-models/set-kind';
import { Resistance } from '@/models/blueprint-models';
import { Weight } from '@/models/weight';
import { BigNumberJSON, LocalDateJSON, WeightUnitJSON, fromBigNumberJSON } from '@/models/storage/versions/latest';
import { DailyActivity, VolumeScale } from '@/store/activity/activity-types';
import { volumeScaleOf } from '@/store/activity/volume';
import { PersonalRecord } from '@/store/stats/personal-records';
import { oneRepMaxOf } from '@/store/stats/calculate-stats';
import {
  CardioSetRow,
  WarmupSetRow,
  WeightedSetRow,
  WorkoutExerciseRow,
  WorkoutRows,
  fromWorkoutRows,
  readColumns,
  toWorkoutRows,
} from '@/services/workout-rows';

type Statement = { run(): unknown };

/** A workout row as `readColumns.workout` selects it: the query columns left out, `active` kept. */
type WorkoutReadRow = Omit<typeof workoutsSchema.$inferSelect, 'referenceTimeMs' | 'volumeKg'>;

// Keeps every statement under SQLite's historical 999 bound-parameter limit.
const MAX_PARAMETERS = 999;

/** What a write touched, for {@link WorkoutRepository.subscribe} listeners. */
export interface WorkoutWrite {
  /** The workouts whose rows were written or deleted. */
  workoutIds: readonly string[];
  /** True for `setActive`: the set of finished workouts changed even where no content did. */
  activeChanged: boolean;
}

/** Finished history: the workout in progress is left out of every read below. */
const finished = eq(workoutsSchema.active, false);

/**
 * `Session.isStarted`: a working set with reps, or a cardio set with a time. Warm-ups are in their own
 * table, so they don't count, as in the model.
 */
const started = sql`(exists (select 1 from ${weightedSetsSchema} where ${weightedSetsSchema.workoutId} = ${workoutsSchema.id} and ${isNotNull(weightedSetsSchema.reps)}) or exists (select 1 from ${cardioSetsSchema} where ${cardioSetsSchema.workoutId} = ${workoutsSchema.id} and ${isNotNull(cardioSetsSchema.completedAt)}))`;

const prSetKinds = (Object.keys(SET_KIND_RULES) as SetKind[]).filter((kind) => SET_KIND_RULES[kind].countsTowardsPrs);

/** One record from the running-max query: the set that set it, with what's needed to rebuild its exact 1RM. */
interface PersonalRecordRow {
  workoutId: string;
  exerciseName: string;
  resistance: Resistance | null;
  usesBodyweight: number | null;
  weightValue: BigNumberJSON;
  weightUnit: WeightUnitJSON;
  reps: number;
  bodyweightValue: BigNumberJSON | null;
  bodyweightUnit: WeightUnitJSON | null;
}

/**
 * Owns every read and write of the workout tables. Each write is one transaction that touches only the rows
 * of the workouts it is given: the workout row is upserted, and its exercises and sets are replaced.
 *
 * The `active` flag has a single writer, {@link setActive}. Content writes never change it: a new row
 * starts inactive, and an existing one keeps its flag.
 *
 * Reads other than {@link loadAll} cover finished history only, and leave the workout in progress out.
 * {@link subscribe} tells screens when any write has landed, so what they show can be re-queried.
 */
export class WorkoutRepository {
  private readonly listeners = new Set<(write: WorkoutWrite) => void>();

  constructor(private readonly db: ExpoSQLiteDatabase) {}

  /**
   * Calls `listener` after each write has landed, with what it touched. Returns the unsubscribe. A listener
   * that re-queries sees the written rows, since the transaction has committed by then.
   */
  subscribe(listener: (write: WorkoutWrite) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Every stored workout, and which one (if any) is in progress. */
  async loadAll(): Promise<{ workouts: Session[]; activeWorkoutId: string | undefined }> {
    const workouts = await this.db.select(readColumns.workout).from(workoutsSchema);
    return {
      workouts: await this.assemble(workouts, undefined),
      activeWorkoutId: workouts.find((x) => x.active)?.id,
    };
  }

  /** Finished workouts dated from `from` to `to`, both inclusive, latest first by reference time. */
  async finishedBetween(from: LocalDate, to: LocalDate): Promise<Session[]> {
    const workouts = await this.db
      .select(readColumns.workout)
      .from(workoutsSchema)
      .where(and(finished, gte(workoutsSchema.date, asDateJSON(from)), lte(workoutsSchema.date, asDateJSON(to))))
      .orderBy(desc(workoutsSchema.referenceTimeMs), asc(workoutsSchema.id));
    return this.assemble(
      workouts,
      workouts.map((x) => x.id),
    );
  }

  /** The last `limit` finished workouts named `name` that were started, latest first. */
  async latestNamed(name: string, limit: number): Promise<Session[]> {
    const workouts = await this.db
      .select(readColumns.workout)
      .from(workoutsSchema)
      .where(and(finished, eq(workoutsSchema.name, name), started))
      .orderBy(desc(workoutsSchema.referenceTimeMs), asc(workoutsSchema.id))
      .limit(limit);
    return this.assemble(
      workouts,
      workouts.map((x) => x.id),
    );
  }

  /** The date of the earliest finished workout, started or not: where all-time stats begin. */
  async earliestDate(): Promise<LocalDate | undefined> {
    const [row] = await this.db
      .select({ date: sql<string | null>`min(${workoutsSchema.date})` })
      .from(workoutsSchema)
      .where(finished);
    return row?.date ? LocalDate.parse(row.date) : undefined;
  }

  /** Each day with a started, finished workout, oldest first: how many, and the volume moved. */
  async dailyActivity(): Promise<DailyActivity[]> {
    const rows = await this.db
      .select({
        date: workoutsSchema.date,
        workouts: count(),
        volumeKg: sql<number>`sum(${workoutsSchema.volumeKg})`,
      })
      .from(workoutsSchema)
      .where(and(finished, started))
      .groupBy(workoutsSchema.date)
      .orderBy(asc(workoutsSchema.date));
    return rows.map((row) => ({ date: LocalDate.parse(row.date), workouts: row.workouts, volumeKg: row.volumeKg }));
  }

  /** The 10th and 90th percentile of volume over every started, finished workout; undefined with none. */
  async volumeScale(): Promise<VolumeScale | undefined> {
    const rows = await this.db
      .select({ volumeKg: workoutsSchema.volumeKg })
      .from(workoutsSchema)
      .where(and(finished, started))
      .orderBy(asc(workoutsSchema.volumeKg));
    return rows.length ? volumeScaleOf(rows.map((x) => x.volumeKg)) : undefined;
  }

  /**
   * Records per finished workout, as `findPersonalRecords` computes them: the best estimated 1RM of each
   * movement in a workout beats every earlier workout's. SQL scores each set as `effective_weight_kg *
   * (30 + reps)` (Epley without the division) and runs the max per movement in workout order; the few
   * rows that beat it come back with the set that did, and the exact 1RM is rebuilt from its stored
   * weight in JS, so a record reads in the unit it was lifted in.
   */
  async personalRecords(): Promise<Map<string, PersonalRecord[]>> {
    const rows = await Promise.resolve(
      this.db.all<PersonalRecordRow>(sql`
        with lifts as (
          -- Each weighted exercise of a finished workout that tracks a load: the blueprint is read once
          -- here, per exercise, rather than once per set below.
          select e.workout_id, e.position, e.movement_key, w.reference_time_ms, w.bodyweight_value, w.bodyweight_unit
          from ${workoutExercisesSchema} e
          join ${workoutsSchema} w on w.id = e.workout_id
          where w.active = 0 and e.kind = 'weighted' and json_extract(e.blueprint, '$.resistance') is not 'none'
        ),
        best_sets as (
          -- The best set of each exercise. With a lone max(), SQLite takes the other columns from the row
          -- that holds it, the first on a tie; the group walks the primary key, so nothing is sorted.
          select s.workout_id, s.exercise_position, max(s.effective_weight_kg * (30 + s.reps)) as score,
            s.weight_value, s.weight_unit, s.reps
          from ${weightedSetsSchema} s
          where s.reps > 0 and s.kind in ${prSetKinds}
          group by s.workout_id, s.exercise_position
        ),
        best as (
          -- The best per movement and workout, since a workout can hold the same movement twice.
          select b.workout_id, l.movement_key, l.reference_time_ms, l.bodyweight_value, l.bodyweight_unit,
            max(b.score) as score, b.exercise_position, b.weight_value, b.weight_unit, b.reps
          from best_sets b
          join lifts l on l.workout_id = b.workout_id and l.position = b.exercise_position
          group by b.workout_id, l.movement_key
        ),
        ranked as (
          select *, max(score) over (
            partition by movement_key
            order by reference_time_ms, workout_id
            rows between unbounded preceding and 1 preceding
          ) as previous_best
          from best
        )
        select
          r.workout_id as "workoutId",
          json_extract(e.blueprint, '$.name') as "exerciseName",
          json_extract(e.blueprint, '$.resistance') as "resistance",
          json_extract(e.blueprint, '$.usesBodyweight') as "usesBodyweight",
          r.weight_value as "weightValue",
          r.weight_unit as "weightUnit",
          r.reps as "reps",
          r.bodyweight_value as "bodyweightValue",
          r.bodyweight_unit as "bodyweightUnit"
        from ranked r
        join ${workoutExercisesSchema} e on e.workout_id = r.workout_id and e.position = r.exercise_position
        where r.previous_best is not null and r.score > r.previous_best
        -- Records of one workout read in exercise order, by the movement's first exercise.
        order by r.reference_time_ms, r.workout_id,
          (select min(f.position) from lifts f where f.workout_id = r.workout_id and f.movement_key = r.movement_key)
      `),
    );
    const records = new Map<string, PersonalRecord[]>();
    for (const row of rows) {
      const bodyweight =
        row.bodyweightValue !== null && row.bodyweightUnit !== null
          ? new Weight(fromBigNumberJSON(row.bodyweightValue), row.bodyweightUnit)
          : undefined;
      // Blueprints written before `resistance` existed carry `usesBodyweight`, as the migration reads it.
      const resistance: Resistance = row.resistance ?? (row.usesBodyweight ? 'bodyweight' : 'external');
      const load = effectiveLoad(
        resistance,
        new Weight(fromBigNumberJSON(row.weightValue), row.weightUnit),
        bodyweight,
      );
      const record: PersonalRecord = { exerciseName: row.exerciseName, oneRepMax: oneRepMaxOf(load, row.reps) };
      const existing = records.get(row.workoutId);
      if (existing) {
        existing.push(record);
      } else {
        records.set(row.workoutId, [record]);
      }
    }
    return records;
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
    return this.write((tx) => writeContent(tx, rows, { activate: false }), {
      workoutIds: sessions.map((x) => x.id),
      activeChanged: false,
    });
  }

  delete(workoutId: string): Promise<void> {
    return this.write(
      (tx) => [...deleteChildren(tx, [workoutId]), tx.delete(workoutsSchema).where(eq(workoutsSchema.id, workoutId))],
      { workoutIds: [workoutId], activeChanged: false },
    );
  }

  /**
   * Makes `session` the one active workout, or clears it. It writes the workout's content too rather than
   * only flipping the flag, so it doesn't depend on a content write having landed first: the two are
   * dispatched together and race.
   */
  setActive(session: Session | undefined): Promise<void> {
    return this.write(
      (tx) => [
        tx.update(workoutsSchema).set({ active: false }).where(eq(workoutsSchema.active, true)),
        ...(session ? writeContent(tx, [toWorkoutRows(session)], { activate: true }) : []),
      ],
      { workoutIds: session ? [session.id] : [], activeChanged: true },
    );
  }

  private async write(build: (tx: Transaction) => Statement[], write: WorkoutWrite): Promise<void> {
    await writeAtomically(this.db, build);
    this.listeners.forEach((listener) => listener(write));
  }

  /**
   * Rebuilds `workouts` from their child rows, in the order given. `workoutIds` limits the child reads to
   * those workouts; `undefined` reads every table whole, which is cheaper for hydration.
   */
  private async assemble(workouts: WorkoutReadRow[], workoutIds: string[] | undefined): Promise<Session[]> {
    const { db } = this;
    const [exercises, weightedSets, warmupSets, cardioSets] = await Promise.all([
      children(workoutIds, workoutExercisesSchema.workoutId, (where) =>
        db.select(readColumns.exercise).from(workoutExercisesSchema).where(where),
      ),
      children(workoutIds, weightedSetsSchema.workoutId, (where) =>
        db.select(readColumns.weightedSet).from(weightedSetsSchema).where(where),
      ),
      children(workoutIds, warmupSetsSchema.workoutId, (where) =>
        db.select(readColumns.warmupSet).from(warmupSetsSchema).where(where),
      ),
      children(workoutIds, cardioSetsSchema.workoutId, (where) =>
        db.select(readColumns.cardioSet).from(cardioSetsSchema).where(where),
      ),
    ]);
    const exercisesByWorkout = groupByWorkout(exercises);
    const weightedSetsByWorkout = groupByWorkout(weightedSets);
    const warmupSetsByWorkout = groupByWorkout(warmupSets);
    const cardioSetsByWorkout = groupByWorkout(cardioSets);
    return workouts.map(({ active: _, ...workout }) =>
      fromWorkoutRows({
        workout,
        exercises: exercisesByWorkout.get(workout.id) ?? [],
        weightedSets: weightedSetsByWorkout.get(workout.id) ?? [],
        warmupSets: warmupSetsByWorkout.get(workout.id) ?? [],
        cardioSets: cardioSetsByWorkout.get(workout.id) ?? [],
      }),
    );
  }
}

/**
 * Child rows of `workoutIds`, read in chunks that fit the parameter limit; `undefined` reads the whole
 * table, which is cheaper for hydration.
 */
async function children<T>(
  workoutIds: string[] | undefined,
  workoutIdColumn: SQLiteColumn,
  select: (where?: SQL) => PromiseLike<T[]>,
): Promise<T[]> {
  if (workoutIds === undefined) {
    return await select();
  }
  const chunks = await Promise.all(
    chunkedValues(workoutIds, MAX_PARAMETERS).map((ids) => select(inArray(workoutIdColumn, ids))),
  );
  return chunks.flat();
}

function asDateJSON(date: LocalDate): LocalDateJSON {
  return date.toString() as LocalDateJSON;
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
      warmupSetsSchema,
      rows.flatMap((x): WarmupSetRow[] => x.warmupSets),
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
    tx.delete(warmupSetsSchema).where(inArray(warmupSetsSchema.workoutId, ids)),
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

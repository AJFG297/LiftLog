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
import { FREEFORM_WORKOUT_NAME, RecordedExercise, Session } from '@/models/session-models';
import { effectiveLoad } from '@/models/session-models/recorded-weighted-exercise';
import { SET_KIND_RULES, SetKind } from '@/models/session-models/set-kind';
import { MovementKey, ProgressionKey, Resistance } from '@/models/blueprint-models';
import { Weight } from '@/models/weight';
import { BigNumberJSON, LocalDateJSON, WeightUnitJSON, fromBigNumberJSON } from '@/models/storage/versions/latest';
import { DailyActivity, VolumeScale } from '@/store/activity/activity-types';
import { volumeScaleOf } from '@/store/activity/volume';
import { PersonalRecord, PreviousBest, PreviousBests } from '@/store/stats/personal-records';
import { oneRepMaxOf } from '@/store/stats/calculate-stats';
import { getSessionReferenceTime } from '@/store/stored-sessions';
import { routinesDoneThisRoundOf } from '@/models/routine-rounds';
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

/** The latest performance of a lineage, and the workout it was done in. */
export interface LatestPerformance {
  workoutId: string;
  exercise: RecordedExercise;
}

/** One recorded exercise's place in the tables. */
interface ExerciseRef {
  workoutId: string;
  position: number;
}

/** Finished history: the workout in progress is left out of every read below. */
const finished = eq(workoutsSchema.active, false);

/**
 * `Session.isStarted`: a working set with reps, or a cardio set with a time. Warm-ups are in their own
 * table, so they don't count, as in the model.
 */
const started = sql`(exists (select 1 from ${weightedSetsSchema} where ${weightedSetsSchema.workoutId} = ${workoutsSchema.id} and ${isNotNull(weightedSetsSchema.reps)}) or exists (select 1 from ${cardioSetsSchema} where ${cardioSetsSchema.workoutId} = ${workoutsSchema.id} and ${isNotNull(cardioSetsSchema.completedAt)}))`;

/** `Session.hasLoggedAnySet`: {@link started}, or a warm-up logged. */
const loggedAnySet = sql`(${started} or exists (select 1 from ${warmupSetsSchema} where ${warmupSetsSchema.workoutId} = ${workoutsSchema.id} and ${isNotNull(warmupSetsSchema.reps)}))`;

/** The routines of a program as done so far, from {@link WorkoutRepository.routineHistory}. */
export interface RoutineHistory {
  /** The last day each routine was done, by name. */
  lastDone: Map<string, LocalDate>;
  workoutsDone: number;
  /** How many of the routines were done in the current round (`routinesDoneThisRoundOf`). */
  routinesDoneThisRound: number;
}

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

/** A movement's best set before a workout, from {@link WorkoutRepository.bestsBefore}'s query. */
interface BestSetRow {
  kind: 'oneRepMax' | 'heaviest';
  movementKey: MovementKey;
  weightValue: BigNumberJSON;
  weightUnit: WeightUnitJSON;
  reps: number;
  bodyweightValue: BigNumberJSON | null;
  bodyweightUnit: WeightUnitJSON | null;
  resistance: Resistance;
}

/**
 * The reference time a workout must fall short of to count as before `session`, in epoch milliseconds.
 * Compared to the second, as the selectors this replaces compared them, so a workout logged in the same
 * second is not before it.
 */
function beforeMs(session: Session): number {
  return getSessionReferenceTime(session).toEpochSecond() * 1000;
}

/** Workouts done before `session`: not itself, and with a reference time short of {@link beforeMs}. */
function earlierThan(session: Session): SQL[] {
  return [sql`${workoutsSchema.id} != ${session.id}`, sql`${workoutsSchema.referenceTimeMs} < ${beforeMs(session)}`];
}

function refKey({ workoutId, position }: ExerciseRef): string {
  return `${workoutId}\u0000${position}`;
}

/**
 * Owns every read and write of the workout tables. Each write is one transaction that touches only the rows
 * of the workouts it is given: the workout row is upserted, and its exercises and sets are replaced.
 *
 * The `active` flag has a single writer, {@link setActive}. Content writes never change it: a new row
 * starts inactive, and an existing one keeps its flag.
 *
 * Reads cover finished history only, and leave the workout in progress out, unless they say otherwise:
 * {@link active}, {@link get}, {@link existingIds}, {@link inExportOrder}, {@link latestPerLineage} and
 * {@link loadAll} include it.
 * {@link subscribe} tells screens when any write has landed, so what they show can be re-queried.
 */
export class WorkoutRepository {
  private readonly listeners = new Set<(write: WorkoutWrite) => void>();
  // Writes and the reads the store builds on ({@link latestPerLineage}, {@link latestPlanned}, the point
  // lookups) run one after another, in the order they were issued: a read issued after a write must see
  // it, awaited or not. The device driver queues statements that way itself; the async driver under test
  // does not.
  private queue: Promise<unknown> = Promise.resolve();

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

  /** The workout in progress, if there is one: all that startup loads of the history. */
  async active(): Promise<Session | undefined> {
    const workouts = await this.db
      .select(readColumns.workout)
      .from(workoutsSchema)
      .where(eq(workoutsSchema.active, true));
    return (
      await this.assemble(
        workouts,
        workouts.map((x) => x.id),
      )
    )[0];
  }

  /**
   * Every stored workout, and which one (if any) is in progress. For the jobs that must touch every
   * workout once - a data migration rewriting them all, reading a backup file to restore it - and never
   * for what a screen shows.
   */
  async loadAll(): Promise<{ workouts: Session[]; activeWorkoutId: string | undefined }> {
    const workouts = await this.db.select(readColumns.workout).from(workoutsSchema);
    return {
      workouts: await this.assemble(workouts, undefined),
      activeWorkoutId: workouts.find((x) => x.active)?.id,
    };
  }

  /**
   * One workout by id, finished or in progress, or undefined if there is none. Queued behind the writes
   * before it, so a workout written just before it is asked for (a finish, then the feed publishing it) is
   * read as written.
   */
  get(workoutId: string): Promise<Session | undefined> {
    return this.inOrder(async () => {
      const workouts = await this.db
        .select(readColumns.workout)
        .from(workoutsSchema)
        .where(eq(workoutsSchema.id, workoutId));
      return (await this.assemble(workouts, [workoutId]))[0];
    });
  }

  /**
   * Every workout, the one in progress included, latest first by reference time, `batchSize` at a time:
   * the plaintext export, which never holds the whole history at once. Workouts of the same time keep the
   * order they were first stored in, as hydration read them. The order is read once up front, so a write
   * during the export can't move a workout between batches; one deleted meanwhile is left out.
   */
  async *inExportOrder(batchSize: number): AsyncGenerator<Session[]> {
    const ordered = await this.db
      .select({ id: workoutsSchema.id })
      .from(workoutsSchema)
      .orderBy(desc(workoutsSchema.referenceTimeMs), sql`rowid`);
    for (const ids of chunkedValues(
      ordered.map((x) => x.id),
      batchSize,
    )) {
      const workouts = await children(ids, workoutsSchema.id, (where) =>
        this.db.select(readColumns.workout).from(workoutsSchema).where(where),
      );
      const byId = new Map(workouts.map((x) => [x.id, x]));
      const inOrder = ids.flatMap((id) => byId.get(id) ?? []);
      yield await this.assemble(inOrder, ids);
    }
  }

  /** Which of `workoutIds` are stored, finished or in progress. Queued behind the writes before it. */
  existingIds(workoutIds: readonly string[]): Promise<Set<string>> {
    return this.inOrder(async () => {
      const rows = await children([...workoutIds], workoutsSchema.id, (where) =>
        this.db.select({ id: workoutsSchema.id }).from(workoutsSchema).where(where),
      );
      return new Set(rows.map((x) => x.id));
    });
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

  /**
   * The last `limit` finished workouts named `name` that were started, latest first. With `before`, only
   * those done before that workout: the previous comparable workouts for a comparison or a summary.
   * `includeUnstarted` counts a workout with nothing logged too, as the post-workout comparison always has.
   */
  async latestNamed(
    name: string,
    limit: number,
    { before, includeUnstarted = false }: { before?: Session; includeUnstarted?: boolean } = {},
  ): Promise<Session[]> {
    const workouts = await this.db
      .select(readColumns.workout)
      .from(workoutsSchema)
      .where(
        and(
          finished,
          eq(workoutsSchema.name, name),
          includeUnstarted ? undefined : started,
          ...(before ? earlierThan(before) : []),
        ),
      )
      .orderBy(desc(workoutsSchema.referenceTimeMs), asc(workoutsSchema.id))
      .limit(limit);
    return this.assemble(
      workouts,
      workouts.map((x) => x.id),
    );
  }

  /**
   * The most recent finished workout that was not freeform: where the plan is up to. Queued behind the
   * writes before it, as finishing a workout asks for the next one as soon as it has dispatched the write.
   */
  latestPlanned(): Promise<Session | undefined> {
    return this.inOrder(async () => {
      const workouts = await this.db
        .select(readColumns.workout)
        .from(workoutsSchema)
        .where(and(finished, sql`${workoutsSchema.name} != ${FREEFORM_WORKOUT_NAME}`))
        .orderBy(desc(workoutsSchema.referenceTimeMs), asc(workoutsSchema.id))
        .limit(1);
      return (
        await this.assemble(
          workouts,
          workouts.map((x) => x.id),
        )
      )[0];
    });
  }

  /**
   * The latest performance of each lineage (see `lineageKeys`): what carry-over reads. Every workout
   * counts, the one in progress included, but only exercises with a working set logged. `progressionKeys`
   * limits it to those keys' lineages, and `excludeWorkoutId` leaves one workout out, for what that
   * workout's exercises carried on from.
   */
  latestPerLineage(
    options: { progressionKeys?: readonly ProgressionKey[]; excludeWorkoutId?: string } = {},
  ): Promise<Record<ProgressionKey, LatestPerformance>> {
    return this.inOrder(() => this.readLatestPerLineage(options));
  }

  private async readLatestPerLineage({
    progressionKeys,
    excludeWorkoutId,
  }: {
    progressionKeys?: readonly ProgressionKey[];
    excludeWorkoutId?: string;
  }): Promise<Record<ProgressionKey, LatestPerformance>> {
    if (progressionKeys?.length === 0) {
      return {};
    }
    const others = excludeWorkoutId === undefined ? sql`` : sql`and e.workout_id != ${excludeWorkoutId}`;
    // Every lineage stored, or those of `progressionKeys`. Unfiltered, as at startup, it skips from one
    // lineage to the next through the `lineage` index rather than reading every exercise ever logged.
    const lineages = progressionKeys
      ? sql`select distinct e.lineage from ${workoutExercisesSchema} e where e.progression_key in ${progressionKeys}`
      : sql`select lineage from walk where lineage is not null`;
    const refs = await Promise.resolve(
      this.db.all<ExerciseRef & { lineage: ProgressionKey }>(sql`
        with recursive walk(lineage) as (
          select min(lineage) from ${workoutExercisesSchema}
          union all
          select (select min(e.lineage) from ${workoutExercisesSchema} e where e.lineage > walk.lineage)
          from walk where walk.lineage is not null
        ),
        latest as (
          -- The index ends each lineage with its latest time, so this is a seek per lineage.
          select l.lineage, (
            select max(e.latest_time_ms) from ${workoutExercisesSchema} e where e.lineage = l.lineage ${others}
          ) as latest_time_ms
          from (${lineages}) l
        ),
        ranked as (
          select e.workout_id, e.position, e.lineage, row_number() over (
            partition by e.lineage order by w.reference_time_ms desc, w.id, e.position
          ) as rank
          from latest l
          join ${workoutExercisesSchema} e on e.lineage = l.lineage and e.latest_time_ms = l.latest_time_ms
          join ${workoutsSchema} w on w.id = e.workout_id
          where 1 = 1 ${others}
        )
        select workout_id as "workoutId", position, lineage from ranked where rank = 1
      `),
    );
    const exercises = await this.exercises(refs);
    return Object.fromEntries(
      refs.map((ref) => [ref.lineage, { workoutId: ref.workoutId, exercise: exercises.get(refKey(ref))! }]),
    );
  }

  /**
   * The previous performances of each of `movements`, newest first: exercises with a working set logged,
   * in finished workouts other than `excludeWorkoutId` (the one being viewed, which is not its own
   * previous). `limit` caps each movement's list.
   */
  async previousPerformances(
    movements: readonly MovementKey[],
    { excludeWorkoutId, limit }: { excludeWorkoutId?: string; limit?: number } = {},
  ): Promise<Map<MovementKey, RecordedExercise[]>> {
    const byMovement = new Map<MovementKey, RecordedExercise[]>();
    if (!movements.length) {
      return byMovement;
    }
    const refs = await Promise.resolve(
      this.db.all<ExerciseRef & { movementKey: MovementKey }>(sql`
        with ranked as (
          select e.workout_id, e.position, e.movement_key, row_number() over (
            partition by e.movement_key order by e.latest_time_ms desc, w.reference_time_ms desc, w.id, e.position
          ) as rank
          from ${workoutExercisesSchema} e
          join ${workoutsSchema} w on w.id = e.workout_id
          where w.active = 0 and e.latest_time_ms is not null and e.movement_key in ${movements}
          ${excludeWorkoutId === undefined ? sql`` : sql`and w.id != ${excludeWorkoutId}`}
        )
        select workout_id as "workoutId", position, movement_key as "movementKey" from ranked
        ${limit === undefined ? sql`` : sql`where rank <= ${limit}`}
        order by movement_key, rank
      `),
    );
    const exercises = await this.exercises(refs);
    for (const ref of refs) {
      const list = byMovement.get(ref.movementKey);
      const exercise = exercises.get(refKey(ref))!;
      if (list) {
        list.push(exercise);
      } else {
        byMovement.set(ref.movementKey, [exercise]);
      }
    }
    return byMovement;
  }

  /**
   * For each of `session`'s movements, the best it had done in the finished workouts before `session`:
   * the best estimated 1RM, and the heaviest set on an externally loaded exercise, as `RecordLedger`
   * keeps them. Sets are scored as in {@link personalRecords}, and the exact figure is rebuilt in JS from
   * the set that scored best.
   */
  async bestsBefore(session: Session): Promise<PreviousBests> {
    const bests = new Map<MovementKey, PreviousBest>();
    const movements = [...new Set(session.recordedExercises.map((x) => x.movementKey()))];
    if (!movements.length) {
      return bests;
    }
    const rows = await Promise.resolve(
      this.db.all<BestSetRow>(sql`
        with sets as (
          select e.movement_key,
            -- Blueprints written before resistance existed carry usesBodyweight, as the migration reads it.
            coalesce(json_extract(e.blueprint, '$.resistance'),
              case when json_extract(e.blueprint, '$.usesBodyweight') then 'bodyweight' else 'external' end) as resistance,
            w.bodyweight_value, w.bodyweight_unit,
            s.weight_value, s.weight_unit, s.weight_kg, s.reps, s.effective_weight_kg * (30 + s.reps) as score
          from ${weightedSetsSchema} s
          join ${workoutExercisesSchema} e on e.workout_id = s.workout_id and e.position = s.exercise_position
          join ${workoutsSchema} w on w.id = e.workout_id
          where w.active = 0 and w.id != ${session.id} and w.reference_time_ms < ${beforeMs(session)} and e.kind = 'weighted'
            and e.movement_key in ${movements} and s.reps > 0 and s.kind in ${prSetKinds}
        )
        select 'oneRepMax' as kind, movement_key as "movementKey", max(score) as best, weight_value as "weightValue",
          weight_unit as "weightUnit", reps, bodyweight_value as "bodyweightValue", bodyweight_unit as "bodyweightUnit",
          resistance
        from sets where resistance != 'none' group by movement_key
        union all
        select 'heaviest', movement_key, max(weight_kg), weight_value, weight_unit, reps, null, null, resistance
        from sets where resistance = 'external' group by movement_key
      `),
    );
    for (const row of rows) {
      const weight = new Weight(fromBigNumberJSON(row.weightValue), row.weightUnit);
      const best = bests.get(row.movementKey) ?? {};
      if (row.kind === 'heaviest') {
        best.heaviest = weight;
      } else {
        const bodyweight =
          row.bodyweightValue !== null && row.bodyweightUnit !== null
            ? new Weight(fromBigNumberJSON(row.bodyweightValue), row.bodyweightUnit)
            : undefined;
        best.oneRepMax = oneRepMaxOf(effectiveLoad(row.resistance, weight, bodyweight), row.reps);
      }
      bests.set(row.movementKey, best);
    }
    return bests;
  }

  /**
   * How far the routines named `names` have got: a finished workout counts as one done when it has any set
   * logged, a warm-up included, and is not freeform. The counts and dates are SQL aggregates. The round
   * is walked from the routine name of every done workout, oldest first by day and then by when it was
   * done: one short column per workout, since where a round ends depends on all of them.
   */
  async routineHistory(names: readonly string[]): Promise<RoutineHistory> {
    if (!names.length) {
      return { lastDone: new Map(), workoutsDone: 0, routinesDoneThisRound: 0 };
    }
    const done = and(
      finished,
      inArray(workoutsSchema.name, [...names]),
      sql`${workoutsSchema.name} != ${FREEFORM_WORKOUT_NAME}`,
      loggedAnySet,
    );
    const [perName, ordered] = await Promise.all([
      this.db
        .select({ name: workoutsSchema.name, lastDone: sql<LocalDateJSON>`max(${workoutsSchema.date})`, done: count() })
        .from(workoutsSchema)
        .where(done)
        .groupBy(workoutsSchema.name),
      this.db
        .select({ name: workoutsSchema.name })
        .from(workoutsSchema)
        .where(done)
        // To the second, as the model's activity times compared them.
        .orderBy(asc(workoutsSchema.date), sql`${workoutsSchema.referenceTimeMs} / 1000`, sql`rowid`),
    ]);
    return {
      lastDone: new Map(perName.map((x) => [x.name, LocalDate.parse(x.lastDone)])),
      workoutsDone: perName.reduce((total, x) => total + x.done, 0),
      routinesDoneThisRound: routinesDoneThisRoundOf(
        ordered.map((x) => x.name),
        names,
      ),
    };
  }

  /** The date of the earliest finished workout, started or not: where all-time stats begin. */
  async earliestDate(): Promise<LocalDate | undefined> {
    const [row] = await this.db
      .select({ date: sql<string | null>`min(${workoutsSchema.date})` })
      .from(workoutsSchema)
      .where(finished);
    return row?.date ? LocalDate.parse(row.date) : undefined;
  }

  /**
   * The finished workouts that were started (`Session.isStarted`): how many, and the date of the first. Both
   * describe the same workouts, so "N workouts since" never counts one it dates from or the other way round.
   */
  async startedWorkouts(): Promise<{ count: number; firstDate: LocalDate | undefined }> {
    const [row] = await this.db
      .select({ count: count(), firstDate: sql<string | null>`min(${workoutsSchema.date})` })
      .from(workoutsSchema)
      .where(and(finished, started));
    return { count: row?.count ?? 0, firstDate: row?.firstDate ? LocalDate.parse(row.firstDate) : undefined };
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
    await this.inOrder(() => writeAtomically(this.db, build));
    this.listeners.forEach((listener) => listener(write));
  }

  /** Runs `task` after everything queued before it, and makes what follows wait for it. */
  private inOrder<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Rebuilds `workouts` from their child rows, in the order given. `workoutIds` limits the child reads to
   * those workouts; `undefined` reads every table whole, which is cheaper for hydration.
   */
  private async assemble(
    workouts: WorkoutReadRow[],
    workoutIds: string[] | undefined,
    keep: (ref: { workoutId: string; exercisePosition: number }) => boolean = () => true,
  ): Promise<Session[]> {
    const { db } = this;
    const [exercises, weightedSets, warmupSets, cardioSets] = await Promise.all([
      children(workoutIds, workoutExercisesSchema.workoutId, (where) =>
        db.select(readColumns.exercise).from(workoutExercisesSchema).where(where),
      ).then((rows) => rows.filter((row) => keep({ workoutId: row.workoutId, exercisePosition: row.position }))),
      children(workoutIds, weightedSetsSchema.workoutId, (where) =>
        db.select(readColumns.weightedSet).from(weightedSetsSchema).where(where),
      ).then((rows) => rows.filter(keep)),
      children(workoutIds, warmupSetsSchema.workoutId, (where) =>
        db.select(readColumns.warmupSet).from(warmupSetsSchema).where(where),
      ).then((rows) => rows.filter(keep)),
      children(workoutIds, cardioSetsSchema.workoutId, (where) =>
        db.select(readColumns.cardioSet).from(cardioSetsSchema).where(where),
      ).then((rows) => rows.filter(keep)),
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

  /**
   * Rebuilds just the exercises at `refs`, keyed by {@link refKey}. Their workouts' rows are read, but a
   * workout is rebuilt with only the exercises asked for: the blueprint migration is per exercise, so each
   * comes out as it would from the whole workout.
   */
  private async exercises(refs: readonly ExerciseRef[]): Promise<Map<string, RecordedExercise>> {
    const exercises = new Map<string, RecordedExercise>();
    if (!refs.length) {
      return exercises;
    }
    const wanted = new Set(refs.map(refKey));
    const workoutIds = [...new Set(refs.map((x) => x.workoutId))];
    const workouts = await children(workoutIds, workoutsSchema.id, (where) =>
      this.db.select(readColumns.workout).from(workoutsSchema).where(where),
    );
    const sessions = await this.assemble(workouts, workoutIds, (row) =>
      wanted.has(refKey({ workoutId: row.workoutId, position: row.exercisePosition })),
    );
    for (const session of sessions) {
      // Positions are kept by `fromWorkoutRows`' sort, so the i-th exercise is the i-th wanted position.
      const positions = [...new Set(refs.filter((x) => x.workoutId === session.id).map((x) => x.position))].sort(
        (a, b) => a - b,
      );
      session.recordedExercises.forEach((exercise, index) => {
        exercises.set(refKey({ workoutId: session.id, position: positions[index]! }), exercise);
      });
    }
    return exercises;
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

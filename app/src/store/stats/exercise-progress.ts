import { LocalDate } from '@js-joda/core';
import { MovementKey } from '@/models/blueprint-models';
import { Weight, WeightUnit } from '@/models/weight';
import { primaryAxisFor } from '@/store/stats/calculate-stats';
import { AmountKind, shownChange, shownWeight } from '@/store/stats/progress-amounts';
import { ExerciseHistory, ExercisePoint, LiftedSet, ProgressHistory } from '@/store/stats/progress-history';
import { StatAxis } from '@/store/stats/quantity';
import { newestWorkoutFirst, RecordListRow, recordListRowOf } from '@/store/stats/records-list';

/**
 * What the exercise page charts. A movement that tracks load reads its estimated 1RM, its heaviest set and the
 * volume of each workout; one that tracks no load reads the most reps in a set and the reps in all.
 */
export type ExerciseMeasure = 'oneRepMax' | 'heaviest' | 'volume' | 'mostReps' | 'totalReps';

export const EXERCISE_RANGES = ['3m', '6m', '1y', 'all'] as const;
export type ExerciseRange = (typeof EXERCISE_RANGES)[number];
export const DEFAULT_EXERCISE_RANGE: ExerciseRange = '3m';

const RANGE_MONTHS: Record<Exclude<ExerciseRange, 'all'>, number> = { '3m': 3, '6m': 6, '1y': 12 };

/** How many sessions Last times lists, and how many records the timeline shows. */
export const RECENT_SESSIONS_SHOWN = 5;
export const EXERCISE_RECORDS_SHOWN = 4;
/** The rep counts Best weight by reps has a column for. */
export const REP_BEST_COUNTS = [5, 6, 7, 8] as const;

/** The first day `range` covers, counting back from `today`; undefined for all of it. */
export function rangeStart(range: ExerciseRange, today: LocalDate): LocalDate | undefined {
  return range === 'all' ? undefined : today.minusMonths(RANGE_MONTHS[range]);
}

/** The movement's axis: best reps for one that tracks no load, as on the Progress tab. */
export function axisOf(exercise: ExerciseHistory): StatAxis {
  return primaryAxisFor(exercise.blueprint);
}

/**
 * The measures the switch offers, the first being the default. Heaviest needs a weight on the bar: a bodyweight
 * movement that never had any added has nothing to chart there.
 */
export function measuresOf(exercise: ExerciseHistory): ExerciseMeasure[] {
  if (axisOf(exercise) === 'reps') {
    return ['mostReps', 'totalReps'];
  }
  return hasLoadOnTheBar(exercise) ? ['oneRepMax', 'heaviest', 'volume'] : ['oneRepMax', 'volume'];
}

function hasLoadOnTheBar(exercise: ExerciseHistory): boolean {
  return (
    exercise.blueprint.resistance === 'external' ||
    exercise.points.some((point) => point.sets.some((set) => !set.weight.value.isZero()))
  );
}

/** A set as shown: the weight as lifted, in the user's unit (undefined for a movement that tracks no load). */
export interface ShownSet {
  weight: Weight | undefined;
  reps: number;
}

/** One workout that did the exercise, on a measure. Amounts are in the user's unit and rounded as shown. */
export interface ExerciseSession {
  workoutId: string;
  date: LocalDate;
  /** Its value on the measure, as shown. */
  value: number;
  /** A new best on the measure, against every earlier workout: a dot on the chart. */
  best: boolean;
  /** The set behind the value: the estimate's set, or the heaviest set. On volume it is the estimate's set. */
  set: ShownSet | undefined;
  /**
   * The figure its Last times row closes on: the heaviest weight on Heaviest, the estimated 1RM on the other
   * measures (volume is already in the row), or the most reps for a movement that tracks no load.
   */
  rowValue: number | undefined;
  /** Sets that count towards volume. */
  sets: number;
  /** The volume to the whole in the user's unit, or the reps in all for a movement that tracks no load. */
  volume: number;
  /** The record ledger set a record for the exercise in this workout: the PR tag. */
  record: boolean;
}

export interface ExerciseChart {
  measure: ExerciseMeasure;
  /** The workouts in the range with a value on the measure, oldest first. */
  sessions: ExerciseSession[];
  /** The last value less the first, as shown; undefined with fewer than two. */
  change: number | undefined;
  /** Index into `sessions` of the one picked: the one asked for while it is in range, else the latest. */
  selected: number | undefined;
}

/**
 * The exercise's workouts on `measure` since `since` (all of them when undefined), what each shows, and the
 * change over them. `selectedWorkoutId` keeps a pick across a change of range or measure while it is still
 * there.
 */
export function exerciseChartOf(
  history: ProgressHistory,
  exercise: ExerciseHistory,
  measure: ExerciseMeasure,
  since: LocalDate | undefined,
  unit: WeightUnit,
  selectedWorkoutId?: string,
): ExerciseChart {
  const recordWorkouts = new Set(
    history.records.filter(({ record }) => record.key === exercise.key).map(({ workoutId }) => workoutId),
  );
  const bests = bestsOn(exercise, measure);
  const sessions: ExerciseSession[] = [];
  const raw: Weight[] = [];
  for (const point of exercise.points) {
    if (since && point.date.isBefore(since)) {
      continue;
    }
    const value = rawValueOf(point, measure);
    if (value === undefined) {
      continue;
    }
    if (value instanceof Weight) {
      raw.push(value);
    }
    sessions.push(sessionOf(point, measure, value, unit, bests.has(point.workoutId), recordWorkouts));
  }
  const selectedIndex = sessions.findIndex((session) => session.workoutId === selectedWorkoutId);
  return {
    measure,
    sessions,
    change: changeOver(sessions, raw, measure, unit),
    selected: sessions.length ? (selectedIndex >= 0 ? selectedIndex : sessions.length - 1) : undefined,
  };
}

/** A weight, or a count for volume and reps. Undefined when the workout has nothing on the measure. */
function rawValueOf(point: ExercisePoint, measure: ExerciseMeasure): Weight | number | undefined {
  switch (measure) {
    case 'oneRepMax':
      return point.oneRepMax;
    case 'heaviest':
      return heaviestSetOf(point.sets)?.weight;
    case 'volume':
      return point.workingSets ? point.volume : undefined;
    case 'mostReps':
      return point.bestReps || undefined;
    case 'totalReps':
      return point.totalReps || undefined;
  }
}

const KIND_OF: Partial<Record<ExerciseMeasure, AmountKind>> = { oneRepMax: 'estimate', heaviest: 'load' };

function shownNumber(value: Weight | number, measure: ExerciseMeasure, unit: WeightUnit): number {
  if (typeof value === 'number') {
    return value;
  }
  const kind = KIND_OF[measure];
  return kind ? shownWeight(value, kind, unit).value.toNumber() : Math.round(value.convertTo(unit).value.toNumber());
}

function sessionOf(
  point: ExercisePoint,
  measure: ExerciseMeasure,
  value: Weight | number,
  unit: WeightUnit,
  best: boolean,
  recordWorkouts: ReadonlySet<string>,
): ExerciseSession {
  const reps = measure === 'mostReps' || measure === 'totalReps';
  const estimateSet = point.oneRepMaxSet && shownSet(point.oneRepMaxSet, unit);
  const heaviest = heaviestSetOf(point.sets);
  const set = reps
    ? { weight: undefined, reps: point.bestReps }
    : measure === 'heaviest'
      ? heaviest && shownSet(heaviest, unit)
      : estimateSet;
  const rowValue = reps
    ? point.bestReps
    : measure === 'heaviest'
      ? heaviest && shownWeight(heaviest.weight, 'load', unit).value.toNumber()
      : point.oneRepMax && shownWeight(point.oneRepMax, 'estimate', unit).value.toNumber();
  return {
    workoutId: point.workoutId,
    date: point.date,
    value: shownNumber(value, measure, unit),
    best,
    set,
    rowValue,
    sets: point.workingSets,
    volume: reps ? point.totalReps : Math.round(point.volume.convertTo(unit).value.toNumber()),
    record: recordWorkouts.has(point.workoutId),
  };
}

function shownSet(set: LiftedSet, unit: WeightUnit): ShownSet {
  return { weight: shownWeight(set.weight, 'load', unit), reps: set.reps };
}

/** The heaviest set, and on a tie on weight the one with more reps, as the record ledger picks it. */
function heaviestSetOf(sets: readonly LiftedSet[]): LiftedSet | undefined {
  let heaviest: LiftedSet | undefined;
  for (const set of sets) {
    if (
      !heaviest ||
      set.weight.isGreaterThan(heaviest.weight) ||
      (set.weight.equals(heaviest.weight, true) && set.reps > heaviest.reps)
    ) {
      heaviest = set;
    }
  }
  return heaviest;
}

/**
 * The workouts that beat every earlier one on `measure`, over the whole history so a dot means the same in any
 * range; never the first. Estimated 1RM marks a better estimate whatever else the workout set, and Heaviest a
 * heavier weight on an externally loaded exercise, the record ledger's heaviest-weight rule. Volume and reps
 * have no records, so no dots.
 */
function bestsOn(exercise: ExerciseHistory, measure: ExerciseMeasure): Set<string> {
  const read =
    measure === 'oneRepMax'
      ? (point: ExercisePoint) => point.oneRepMax
      : measure === 'heaviest' && exercise.blueprint.resistance === 'external'
        ? (point: ExercisePoint) => heaviestSetOf(point.sets)?.weight
        : undefined;
  const bests = new Set<string>();
  if (!read) {
    return bests;
  }
  let best: Weight | undefined;
  for (const point of exercise.points) {
    const value = read(point);
    if (!value) {
      continue;
    }
    if (best && value.isGreaterThan(best)) {
      bests.add(point.workoutId);
    }
    if (!best || value.isGreaterThan(best)) {
      best = value;
    }
  }
  return bests;
}

function changeOver(
  sessions: readonly ExerciseSession[],
  raw: readonly Weight[],
  measure: ExerciseMeasure,
  unit: WeightUnit,
): number | undefined {
  if (sessions.length < 2) {
    return undefined;
  }
  const kind = KIND_OF[measure];
  const first = raw[0];
  const last = raw.at(-1);
  if (kind && first && last) {
    return shownChange(last, first, kind, unit).change.value.toNumber();
  }
  return sessions.at(-1)!.value - sessions[0]!.value;
}

/** The latest {@link RECENT_SESSIONS_SHOWN} of the chart's workouts, newest first. */
export function recentSessionsOf(chart: ExerciseChart): ExerciseSession[] {
  return chart.sessions.slice(-RECENT_SESSIONS_SHOWN).reverse();
}

/** The heaviest weight lifted for at least `reps` reps, as shown, and the first workout that lifted it. */
export interface RepBest {
  reps: number;
  weight: Weight | undefined;
  date: LocalDate | undefined;
}

/**
 * Best weight by reps over the whole history, one per {@link REP_BEST_COUNTS}: the heaviest set of at least
 * that many reps, dated by the first workout that did it. Undefined where it doesn't apply: on a movement that
 * tracks no load, or that never had weight on the bar.
 */
export function repBestsOf(exercise: ExerciseHistory, unit: WeightUnit): RepBest[] | undefined {
  if (!measuresOf(exercise).includes('heaviest')) {
    return undefined;
  }
  return REP_BEST_COUNTS.map((reps) => {
    let weight: Weight | undefined;
    let date: LocalDate | undefined;
    for (const point of exercise.points) {
      for (const set of point.sets) {
        if (set.reps >= reps && (!weight || set.weight.isGreaterThan(weight))) {
          weight = set.weight;
          date = point.date;
        }
      }
    }
    return { reps, weight: weight && shownWeight(weight, 'load', unit), date };
  });
}

/** The exercise's latest {@link EXERCISE_RECORDS_SHOWN} records, newest first, as the Records list shows them. */
export function exerciseRecordsOf(history: ProgressHistory, key: MovementKey, unit: WeightUnit): RecordListRow[] {
  return newestWorkoutFirst(history.records.filter(({ record }) => record.key === key))
    .slice(0, EXERCISE_RECORDS_SHOWN)
    .map((dated) => recordListRowOf(history, dated, unit));
}

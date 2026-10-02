import { LocalDate, YearMonth } from '@js-joda/core';
import { ExerciseId } from '@/models/blueprint-models';
import { Weight, WeightUnit } from '@/models/weight';
import { DatedRecord, ProgressHistory } from '@/store/stats/progress-history';
import { SessionRecord } from '@/store/stats/personal-records';

/** The Records screen's filter: every record, or one kind. */
export type RecordFilter = 'all' | SessionRecord['kind'];

export const RECORD_FILTERS = [
  'all',
  'heaviestWeight',
  'estimatedOneRepMax',
] as const satisfies readonly RecordFilter[];

/** One record as the list shows it. Weights are in the user's unit and rounded as shown. */
export interface RecordRow {
  /** Unique in the list: a workout sets at most one record per movement. */
  key: string;
  workoutId: string;
  exerciseId: ExerciseId | undefined;
  exerciseName: string;
  date: LocalDate;
  kind: SessionRecord['kind'];
  /** The heaviest weight, or the estimated 1RM. */
  value: Weight;
  /** The reps at the heaviest weight; undefined for an estimated 1RM. */
  reps: number | undefined;
  /** The set an estimated 1RM comes from, as lifted; undefined for a heaviest weight. */
  estimatedFrom: { weight: Weight; reps: number } | undefined;
  /** The best it beat. */
  previous: Weight;
  /** `value` less `previous`, so the row adds up as shown. Always positive. */
  gain: Weight;
}

export interface RecordMonth {
  month: YearMonth;
  /** The month is in an earlier year than today's, so its heading needs the year. */
  showYear: boolean;
  rows: RecordRow[];
}

export interface RecordsList {
  /** Records the filter lets through. */
  count: number;
  /** The month the history starts in: the count is "since" it. Undefined with no workouts. */
  since: YearMonth | undefined;
  sinceShowsYear: boolean;
  /** Newest month first, and in each the newest workout first. */
  months: RecordMonth[];
}

// A heaviest weight is what was on the bar, so it keeps the precision plates allow; an estimate is a
// derived number, shown to a tenth.
const HEAVIEST_DECIMALS = 2;
const ESTIMATE_DECIMALS = 1;

/** Every record in the history that `filter` lets through, grouped by month, newest first. */
export function recordsListOf(
  history: ProgressHistory,
  today: LocalDate,
  filter: RecordFilter,
  unit: WeightUnit,
): RecordsList {
  const rows = newestWorkoutFirst(history.records)
    .filter(({ record }) => filter === 'all' || record.kind === filter)
    .map((dated) => rowOf(history, dated, unit));

  const months: RecordMonth[] = [];
  for (const row of rows) {
    const month = YearMonth.from(row.date);
    const last = months.at(-1);
    if (last?.month.equals(month)) {
      last.rows.push(row);
    } else {
      months.push({ month, showYear: month.year() !== today.year(), rows: [row] });
    }
  }

  const since = history.firstDate && YearMonth.from(history.firstDate);
  return { count: rows.length, since, sinceShowsYear: !!since && since.year() !== today.year(), months };
}

/**
 * Reverses the workouts, which the history holds in the order they happened, but keeps each workout's
 * records in exercise order. A workout's records are contiguous, since one ledger step adds them all.
 */
function newestWorkoutFirst(records: readonly DatedRecord[]): DatedRecord[] {
  const result: DatedRecord[] = [];
  let end = records.length;
  while (end > 0) {
    let start = end - 1;
    while (start > 0 && records[start - 1]!.workoutId === records[end - 1]!.workoutId) {
      start--;
    }
    result.push(...records.slice(start, end));
    end = start;
  }
  return result;
}

function rowOf(history: ProgressHistory, { record, workoutId, date }: DatedRecord, unit: WeightUnit): RecordRow {
  const exercise = history.exercises.get(record.key);
  const base = {
    key: `${workoutId}|${record.key}`,
    workoutId,
    exerciseId: exercise?.blueprint.exerciseId,
    exerciseName: exercise?.name ?? record.exerciseName,
    date,
    kind: record.kind,
  };
  if (record.kind === 'heaviestWeight') {
    return {
      ...base,
      reps: record.reps,
      estimatedFrom: undefined,
      ...amounts(record.weight, record.previous, unit, HEAVIEST_DECIMALS),
    };
  }
  return {
    ...base,
    reps: undefined,
    estimatedFrom: { weight: rounded(record.weight, unit, HEAVIEST_DECIMALS), reps: record.reps },
    ...amounts(record.oneRepMax, record.previous, unit, ESTIMATE_DECIMALS),
  };
}

function amounts(value: Weight, previous: Weight, unit: WeightUnit, decimals: number) {
  let shown = rounded(value, unit, decimals);
  let was = rounded(previous, unit, decimals);
  // An estimate that rounds to its old best gets the extra place it needs, rather than reading "+0".
  if (decimals < HEAVIEST_DECIMALS && !shown.isGreaterThan(was)) {
    shown = rounded(value, unit, HEAVIEST_DECIMALS);
    was = rounded(previous, unit, HEAVIEST_DECIMALS);
  }
  return { value: shown, previous: was, gain: shown.minus(was) };
}

function rounded(weight: Weight, unit: WeightUnit, decimals: number): Weight {
  const converted = weight.convertTo(unit);
  return converted.with({ value: converted.value.decimalPlaces(decimals) });
}

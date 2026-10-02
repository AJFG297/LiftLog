import { LocalDate, YearMonth } from '@js-joda/core';
import { ExerciseId } from '@/models/blueprint-models';
import { Weight, WeightUnit } from '@/models/weight';
import { shownChange, shownWeight } from '@/store/stats/progress-amounts';
import { DatedRecord, ProgressHistory } from '@/store/stats/progress-history';
import { SessionRecord } from '@/store/stats/personal-records';

/** The Records screen's filter: every record, or one kind. */
export type RecordFilter = 'all' | SessionRecord['kind'];

export const RECORD_FILTERS = [
  'all',
  'heaviestWeight',
  'estimatedOneRepMax',
] as const satisfies readonly RecordFilter[];

interface RecordListRowBase {
  /** Unique in the list: a workout sets at most one record per movement. */
  key: string;
  workoutId: string;
  exerciseId: ExerciseId | undefined;
  exerciseName: string;
  date: LocalDate;
  /** The heaviest weight, or the estimated 1RM. */
  value: Weight;
  /** The best it beat. */
  previous: Weight;
  /** `value` less `previous`, so the row adds up as shown. Always positive. */
  gain: Weight;
}

/** One record as the list shows it. Weights are in the user's unit and rounded as shown (`progress-amounts`). */
export type RecordListRow =
  | (RecordListRowBase & {
      kind: 'heaviestWeight';
      /** The reps at the heaviest weight. */
      reps: number;
    })
  | (RecordListRowBase & {
      kind: 'estimatedOneRepMax';
      /** The set the estimate comes from, as lifted. */
      estimatedFrom: { weight: Weight; reps: number };
    });

export interface RecordMonth {
  month: YearMonth;
  /** The month is in an earlier year than today's, so its heading needs the year. */
  showYear: boolean;
  rows: RecordListRow[];
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

function rowOf(history: ProgressHistory, { record, workoutId, date }: DatedRecord, unit: WeightUnit): RecordListRow {
  const exercise = history.exercises.get(record.key);
  const base = {
    key: `${workoutId}|${record.key}`,
    workoutId,
    exerciseId: exercise?.blueprint.exerciseId,
    exerciseName: exercise?.name ?? record.exerciseName,
    date,
  };
  if (record.kind === 'heaviestWeight') {
    const shown = shownChange(record.weight, record.previous, 'load', unit);
    return {
      ...base,
      kind: record.kind,
      reps: record.reps,
      value: shown.value,
      previous: shown.previous,
      gain: shown.change,
    };
  }
  const shown = shownChange(record.oneRepMax, record.previous, 'estimate', unit);
  return {
    ...base,
    kind: record.kind,
    estimatedFrom: { weight: shownWeight(record.weight, 'load', unit), reps: record.reps },
    value: shown.value,
    previous: shown.previous,
    gain: shown.change,
  };
}

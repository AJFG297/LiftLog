import { describe, expect, it } from 'vitest';
import { LocalDate, OffsetDateTime, YearMonth } from '@js-joda/core';
import { movementKeyFor, SessionBlueprint, stubExerciseId, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { PotentialSet, RecordedSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight, WeightUnit } from '@/models/weight';
import { buildProgressHistory, ProgressHistory } from '@/store/stats/progress-history';
import { recordsListOf } from '@/store/stats/records-list';

const kg = (n: number) => new Weight(n, 'kilograms');
const lbs = (n: number) => new Weight(n, 'pounds');
const day = (month: number, n: number) => LocalDate.of(2026, month, n);
const today = day(10, 2);
const time = OffsetDateTime.parse('2026-07-01T10:00:00Z');

const bench = makeWeightedBlueprint({ name: 'Bench Press' });
const squat = makeWeightedBlueprint({ name: 'Squat' });
const benchKey = movementKeyFor(stubExerciseId('Bench Press'), 'WeightedExerciseBlueprint');

function lift(blueprint: WeightedExerciseBlueprint, weight: Weight, reps: number) {
  const set = PotentialSet.of({
    set: RecordedSet.of({ repsCompleted: reps, completionDateTime: time }),
    weight,
    target: { min: reps, max: reps },
    kind: 'working',
  });
  return new RecordedWeightedExercise(blueprint, [set], undefined);
}

function session(id: string, date: LocalDate, exercises: RecordedWeightedExercise[]) {
  return new Session(id, new SessionBlueprint('Day', [], ''), exercises, date, undefined, undefined);
}

const history = buildProgressHistory([
  // The first time each is done: no records.
  session('s1', day(7, 1), [lift(bench, kg(80), 8), lift(squat, kg(100), 5)]),
  // Bench: 85 kg beats 80 kg. Squat: no heavier, but 100 × 8 beats the 100 × 5 estimate.
  session('s2', day(7, 8), [lift(bench, kg(85), 3), lift(squat, kg(100), 8)]),
  // Logged in pounds against a best in kilograms.
  session('s3', day(8, 3), [lift(bench, lbs(225), 1)]),
  session('s4', day(9, 28), [lift(squat, kg(105), 8), lift(bench, kg(80), 10)]),
]);

// "102.06 kilograms": the value exactly as stored, so the rounding shows.
const text = (weight: Weight) => `${weight.value.toString()} ${weight.unit}`;

const summary = (unit: WeightUnit, list = recordsListOf(history, today, 'all', unit)) =>
  list.months.map(({ month, showYear, rows }) => ({
    month: month.toString(),
    showYear,
    rows: rows.map((row) => [
      row.date.toString(),
      row.exerciseName,
      row.kind,
      text(row.value),
      row.kind === 'heaviestWeight' ? row.reps : `${text(row.estimatedFrom.weight)} × ${row.estimatedFrom.reps}`,
      text(row.previous),
      text(row.gain),
    ]),
  }));

describe('recordsListOf', () => {
  it('groups every record by month, newest first, keeping exercise order within a workout', () => {
    expect(summary('kilograms')).toEqual([
      {
        month: '2026-09',
        showYear: false,
        rows: [
          ['2026-09-28', 'Squat', 'heaviestWeight', '105 kilograms', 8, '100 kilograms', '5 kilograms'],
          // 80 × 10 ≈ 106.67 beats 225 lb × 1 ≈ 105.46 kg.
          [
            '2026-09-28',
            'Bench Press',
            'estimatedOneRepMax',
            '106.7 kilograms',
            '80 kilograms × 10',
            '105.5 kilograms',
            '1.2 kilograms',
          ],
        ],
      },
      {
        month: '2026-08',
        showYear: false,
        rows: [
          ['2026-08-03', 'Bench Press', 'heaviestWeight', '102.06 kilograms', 1, '85 kilograms', '17.06 kilograms'],
        ],
      },
      {
        month: '2026-07',
        showYear: false,
        rows: [
          ['2026-07-08', 'Bench Press', 'heaviestWeight', '85 kilograms', 3, '80 kilograms', '5 kilograms'],
          [
            '2026-07-08',
            'Squat',
            'estimatedOneRepMax',
            '126.7 kilograms',
            '100 kilograms × 8',
            '116.7 kilograms',
            '10 kilograms',
          ],
        ],
      },
    ]);
  });

  it("shows a record and the best it beat in the user's unit, whatever they were lifted in", () => {
    const august = summary('pounds').find((month) => month.month === '2026-08');

    expect(august?.rows).toEqual([
      ['2026-08-03', 'Bench Press', 'heaviestWeight', '225 pounds', 1, '187.39 pounds', '37.61 pounds'],
    ]);
  });

  it('gives an estimate that rounds to its old best another decimal place', () => {
    const tiny: ProgressHistory = {
      exercises: new Map(),
      workouts: [],
      firstDate: day(9, 1),
      records: [
        {
          workoutId: 's9',
          date: day(9, 9),
          record: {
            kind: 'estimatedOneRepMax',
            key: benchKey,
            exerciseName: 'Bench Press',
            oneRepMax: kg(116.74),
            weight: kg(100),
            reps: 5,
            previous: kg(116.71),
          },
        },
      ],
    };

    expect(summary('kilograms', recordsListOf(tiny, today, 'all', 'kilograms'))[0]?.rows).toEqual([
      [
        '2026-09-09',
        'Bench Press',
        'estimatedOneRepMax',
        '116.74 kilograms',
        '100 kilograms × 5',
        '116.71 kilograms',
        '0.03 kilograms',
      ],
    ]);
  });

  it('filters to one kind and counts what it lets through', () => {
    const heaviest = recordsListOf(history, today, 'heaviestWeight', 'kilograms');
    const estimates = recordsListOf(history, today, 'estimatedOneRepMax', 'kilograms');

    expect(heaviest.count).toBe(3);
    expect(heaviest.months.flatMap((month) => month.rows.map((row) => row.kind))).toEqual([
      'heaviestWeight',
      'heaviestWeight',
      'heaviestWeight',
    ]);
    expect(estimates.count).toBe(2);
    expect(estimates.months.map((month) => month.month.toString())).toEqual(['2026-09', '2026-07']);
    expect(recordsListOf(history, today, 'all', 'kilograms').count).toBe(5);
  });

  it('counts since the month the history starts, with the year once it is an earlier one', () => {
    const now = recordsListOf(history, today, 'all', 'kilograms');
    const nextYear = recordsListOf(history, LocalDate.of(2027, 1, 5), 'all', 'kilograms');

    expect(now.since).toEqual(YearMonth.of(2026, 7));
    expect(now.sinceShowsYear).toBe(false);
    expect(nextYear.sinceShowsYear).toBe(true);
    expect(nextYear.months.map((month) => month.showYear)).toEqual([true, true, true]);
  });

  it('opens the exercise each record belongs to', () => {
    const rows = recordsListOf(history, today, 'all', 'kilograms').months.flatMap((month) => month.rows);

    expect(rows.map((row) => row.exerciseId)).toEqual([
      stubExerciseId('Squat'),
      stubExerciseId('Bench Press'),
      stubExerciseId('Bench Press'),
      stubExerciseId('Bench Press'),
      stubExerciseId('Squat'),
    ]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(5);
  });

  it('is empty with no records', () => {
    expect(recordsListOf(buildProgressHistory([]), today, 'all', 'kilograms')).toEqual({
      count: 0,
      since: undefined,
      sinceShowsYear: false,
      months: [],
    });
  });
});

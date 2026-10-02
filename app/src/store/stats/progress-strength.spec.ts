import { describe, expect, it } from 'vitest';
import { movementKeyFor, stubExerciseId } from '@/models/blueprint-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';
import { day, exerciseHistory, historyOf, kg, periodFor, point } from '@/store/stats/__test__/progress-fixtures';
import { DatedRecord } from '@/store/stats/progress-history';
import { mostTrainedLifts, recentRecords } from '@/store/stats/progress-strength';

const since = periodFor('4w').start; // Aug 31
const key = (name: string) => movementKeyFor(stubExerciseId(name), 'WeightedExerciseBlueprint');

describe('mostTrainedLifts', () => {
  const history = historyOf({
    exercises: [
      exerciseHistory('Bench', [
        // Before the range: left out of the sessions and the change.
        point(day(8, 20), 3, kg(90)),
        point(day(9, 1), 3, kg(100)),
        point(day(9, 8), 3, kg(102.5)),
        point(day(9, 15), 3, kg(101)),
        point(day(9, 22), 3, kg(105)),
        point(day(9, 29), 3, kg(107.5)),
      ]),
      exerciseHistory('Squat', [
        point(day(9, 2), 3, kg(140)),
        point(day(9, 9), 3, kg(135)),
        point(day(9, 16), 3, kg(145)),
      ]),
      // As many sessions as Squat, but done more recently.
      exerciseHistory('Deadlift', [
        point(day(9, 3), 3, kg(180)),
        point(day(9, 10), 3, kg(180)),
        point(day(9, 24), 3, kg(180)),
      ]),
      exerciseHistory(makeWeightedBlueprint({ name: 'Pull-up', resistance: 'none' }), [
        point(day(9, 4), 3, undefined, 8),
        point(day(9, 18), 3, undefined, 10),
      ]),
      exerciseHistory('Curl', [point(day(9, 5), 3, kg(40))]),
      exerciseHistory('Lunge', [point(day(8, 1), 3, kg(60)), point(day(8, 8), 3, kg(60))]),
    ],
  });

  it('lists the 4 lifts done in the most workouts in the range, the most recent first on a tie', () => {
    expect(mostTrainedLifts(history, since, 'kilograms').map((lift) => [lift.name, lift.sessions])).toEqual([
      ['Bench', 5],
      ['Deadlift', 3],
      ['Squat', 3],
      ['Pull-up', 2],
    ]);
  });

  it('gives the latest estimated 1RM, the change over the range and the trend', () => {
    expect(mostTrainedLifts(history, since, 'kilograms')[0]).toEqual({
      key: key('Bench'),
      exerciseId: stubExerciseId('Bench'),
      name: 'Bench',
      axis: 'load',
      sessions: 5,
      latest: 107.5,
      change: 7.5,
      trend: [100, 102.5, 101, 105, 107.5],
    });
  });

  it('reads a lift that tracks no load in best reps', () => {
    expect(mostTrainedLifts(history, since, 'kilograms')[3]).toMatchObject({
      axis: 'reps',
      latest: 10,
      change: 2,
      trend: [8, 10],
    });
  });

  it('converts to the unit the user lifts in', () => {
    const bench = mostTrainedLifts(history, since, 'pounds')[0]!;

    expect(bench.latest).toBeCloseTo(237.0, 1);
    expect(bench.change).toBeCloseTo(16.53, 2);
  });

  it('has no change for a lift done once in the range', () => {
    const once = historyOf({ exercises: [exerciseHistory('Curl', [point(day(9, 5), 3, kg(40))])] });

    expect(mostTrainedLifts(once, since, 'kilograms')[0]).toMatchObject({ sessions: 1, latest: 40, change: undefined });
  });
});

describe('recentRecords', () => {
  const bench = exerciseHistory('Bench', [point(day(9, 1), 3, kg(100))]);
  const record = (date: number, value: Weight, previous: Weight, kind: 'heavy' | 'e1rm' = 'heavy'): DatedRecord => ({
    workoutId: `w-${date}`,
    date: day(9, date),
    record:
      kind === 'heavy'
        ? { kind: 'heaviestWeight', key: bench.key, exerciseName: 'Old name', weight: value, reps: 5, previous }
        : {
            kind: 'estimatedOneRepMax',
            key: bench.key,
            exerciseName: 'Old name',
            oneRepMax: value,
            weight: kg(80),
            reps: 7,
            previous,
          },
  });
  const history = historyOf({
    exercises: [bench],
    records: [
      record(1, kg(80), kg(77.5)),
      record(8, kg(82.5), kg(80)),
      record(15, kg(97.3), kg(95.1), 'e1rm'),
      record(22, kg(85), kg(82.5)),
    ],
  });

  it('lists the 3 latest records, latest first, with what each beat', () => {
    expect(recentRecords(history, 'kilograms')).toEqual([
      {
        key: bench.key,
        exerciseId: stubExerciseId('Bench'),
        workoutId: 'w-22',
        date: day(9, 22),
        name: 'Bench',
        kind: 'heaviestWeight',
        value: 85,
        weight: 85,
        reps: 5,
        previous: 82.5,
        gain: 2.5,
      },
      {
        key: bench.key,
        exerciseId: stubExerciseId('Bench'),
        workoutId: 'w-15',
        date: day(9, 15),
        name: 'Bench',
        kind: 'estimatedOneRepMax',
        value: 97.3,
        weight: 80,
        reps: 7,
        previous: 95.1,
        gain: 2.2,
      },
      {
        key: bench.key,
        exerciseId: stubExerciseId('Bench'),
        workoutId: 'w-8',
        date: day(9, 8),
        name: 'Bench',
        kind: 'heaviestWeight',
        value: 82.5,
        weight: 82.5,
        reps: 5,
        previous: 80,
        gain: 2.5,
      },
    ]);
  });

  it('is empty before any record', () => {
    expect(recentRecords(historyOf({}), 'kilograms')).toEqual([]);
  });
});

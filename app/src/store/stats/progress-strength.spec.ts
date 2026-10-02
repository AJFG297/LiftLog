import { describe, expect, it } from 'vitest';
import { movementKeyFor, stubExerciseId } from '@/models/blueprint-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';
import { day, exerciseHistory, historyOf, kg, point } from '@/store/stats/__test__/progress-fixtures';
import { DatedRecord } from '@/store/stats/progress-history';
import { mostTrainedLifts, recentRecords } from '@/store/stats/progress-strength';

// A Monday, where a range starts.
const since = day(8, 31);
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

  it('converts to the unit the user lifts in, to the nearest half, with the change as shown', () => {
    // 107.5 kg is 236.997 lbs and 100 kg is 220.462 lbs: 237 against 220.5.
    expect(mostTrainedLifts(history, since, 'pounds')[0]).toMatchObject({ latest: 237, change: 16.5 });
  });

  it('shows an estimate to the nearest half, and the change between the halves', () => {
    const rough = historyOf({
      exercises: [exerciseHistory('Bench', [point(day(9, 1), 3, kg(101.8)), point(day(9, 8), 3, kg(104.3))])],
    });

    expect(mostTrainedLifts(rough, since, 'kilograms')[0]).toMatchObject({ latest: 104.5, change: 2.5 });
  });

  it('shows a tiny change to a tenth rather than as none', () => {
    const tiny = historyOf({
      exercises: [exerciseHistory('Bench', [point(day(9, 1), 3, kg(100.1)), point(day(9, 8), 3, kg(100.2))])],
    });

    expect(mostTrainedLifts(tiny, since, 'kilograms')[0]).toMatchObject({ latest: 100.2, change: 0.1 });
  });

  it('has no change for a lift done once in the range', () => {
    const once = historyOf({ exercises: [exerciseHistory('Curl', [point(day(9, 5), 3, kg(40.3))])] });

    expect(mostTrainedLifts(once, since, 'kilograms')[0]).toMatchObject({
      sessions: 1,
      latest: 40.5,
      change: undefined,
    });
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
        // 97.3 against 95.1, each to the nearest half.
        value: 97.5,
        weight: 80,
        reps: 7,
        previous: 95,
        gain: 2.5,
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

  it('converts a weight lifted in kilograms to the nearest half pound, and gains as shown', () => {
    const converted = historyOf({ exercises: [bench], records: [record(1, kg(62.5), kg(60))] });

    // 62.5 kg is 137.79 lbs and 60 kg is 132.28 lbs.
    expect(recentRecords(converted, 'pounds')[0]).toMatchObject({ value: 138, weight: 138, previous: 132.5, gain: 5.5 });
  });

  it('is empty before any record', () => {
    expect(recentRecords(historyOf({}), 'kilograms')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import { movementKeyFor, SessionBlueprint, stubExerciseId, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { PotentialSet, RecordedSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import { SetKind } from '@/models/session-models/set-kind';
import { Weight } from '@/models/weight';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { buildProgressHistory, progressSince, trendValues } from '@/store/stats/progress-history';

const kg = (n: number) => new Weight(n, 'kilograms');
const day = (month: number, n: number) => LocalDate.of(2026, month, n);
const epley = (weight: number, reps: number) =>
  kg(weight).multipliedBy(new BigNumber(1).plus(new BigNumber(reps).div(30)));
const time = OffsetDateTime.parse('2026-07-01T10:00:00Z');

const bench = makeWeightedBlueprint({ name: 'Bench' });
// The same exercise renamed: it keeps its id, so it is the same movement.
const benchPress = makeWeightedBlueprint({ name: 'Bench Press', exerciseId: stubExerciseId('Bench') });
const crunch = makeWeightedBlueprint({ name: 'Crunch', resistance: 'none' });
const squat = makeWeightedBlueprint({ name: 'Squat' });

const benchKey = movementKeyFor(stubExerciseId('Bench'), 'WeightedExerciseBlueprint');
const crunchKey = movementKeyFor(stubExerciseId('Crunch'), 'WeightedExerciseBlueprint');

function set(weight: number, reps: number, kind: SetKind = 'working') {
  return PotentialSet.of({
    set: RecordedSet.of({ repsCompleted: reps, completionDateTime: time }),
    weight: kg(weight),
    target: { min: reps, max: reps },
    kind,
  });
}

function lift(blueprint: WeightedExerciseBlueprint, sets: PotentialSet[], warmups: PotentialSet[] = []) {
  return new RecordedWeightedExercise(blueprint, sets, undefined, warmups);
}

function session(id: string, date: LocalDate, exercises: RecordedWeightedExercise[]) {
  return new Session(id, new SessionBlueprint('Day', [], ''), exercises, date, undefined, undefined);
}

const history = [
  // Nothing logged: no points, but it is still the first workout.
  session('s0', day(6, 28), []),
  session('s1', day(7, 1), [lift(bench, [set(80, 8), set(80, 8)]), makeRecordedExercise(crunch, [20, 15])]),
  session('s2', day(7, 8), [
    // The warm-up and the drop set are heavier or longer, but neither counts towards records.
    lift(bench, [set(85, 3), set(60, 10, 'drop')], [set(90, 1)]),
    makeRecordedExercise(crunch, [25]),
    // Planned but never logged: not in the history.
    makeRecordedExercise(squat, [undefined, undefined]),
  ]),
  // The same movement twice in one workout, under its new name: one point.
  session('s3', day(7, 15), [lift(benchPress, [set(82.5, 10)]), lift(benchPress, [set(70, 12)])]),
];

describe('buildProgressHistory', () => {
  const progress = buildProgressHistory(history);

  it('gives each started movement a point per workout, oldest first', () => {
    expect([...progress.exercises.keys()]).toEqual([benchKey, crunchKey]);
    expect(progress.exercises.get(benchKey)?.points).toEqual([
      { workoutId: 's1', date: day(7, 1), oneRepMax: epley(80, 8), bestReps: 8, workingSets: 2 },
      { workoutId: 's2', date: day(7, 8), oneRepMax: epley(85, 3), bestReps: 3, workingSets: 2 },
      { workoutId: 's3', date: day(7, 15), oneRepMax: epley(82.5, 10), bestReps: 12, workingSets: 2 },
    ]);
  });

  it('gives a movement that tracks no load reps and no estimated 1RM', () => {
    expect(progress.exercises.get(crunchKey)?.points).toEqual([
      { workoutId: 's1', date: day(7, 1), oneRepMax: undefined, bestReps: 20, workingSets: 2 },
      { workoutId: 's2', date: day(7, 8), oneRepMax: undefined, bestReps: 25, workingSets: 1 },
    ]);
  });

  it('names a movement by how it was last logged', () => {
    const benchHistory = progress.exercises.get(benchKey);

    expect(benchHistory?.name).toBe('Bench Press');
    expect(benchHistory?.blueprint).toBe(benchPress);
  });

  it('dates every record in the history, oldest first', () => {
    expect(progress.records).toEqual([
      {
        workoutId: 's2',
        date: day(7, 8),
        record: {
          kind: 'heaviestWeight',
          key: benchKey,
          exerciseName: 'Bench',
          weight: kg(85),
          reps: 3,
          previous: kg(80),
        },
      },
      {
        workoutId: 's3',
        date: day(7, 15),
        record: {
          kind: 'estimatedOneRepMax',
          key: benchKey,
          exerciseName: 'Bench Press',
          oneRepMax: epley(82.5, 10),
          weight: kg(82.5),
          reps: 10,
          previous: epley(80, 8),
        },
      },
    ]);
  });

  it('starts at the first workout, logged or not', () => {
    expect(progress.firstDate).toEqual(day(6, 28));
  });

  it('lists every started workout with its bodyweight, leaving out one where nothing was logged', () => {
    const weighed = history.map((x, i) => x.with({ bodyweight: kg(80 + i) }));

    expect(buildProgressHistory(weighed).workouts).toEqual([
      { workoutId: 's1', date: day(7, 1), bodyweight: kg(81) },
      { workoutId: 's2', date: day(7, 8), bodyweight: kg(82) },
      { workoutId: 's3', date: day(7, 15), bodyweight: kg(83) },
    ]);
  });

  it('is empty for no workouts', () => {
    expect(buildProgressHistory([])).toEqual({
      exercises: new Map(),
      records: [],
      workouts: [],
      firstDate: undefined,
    });
  });
});

describe('progressSince', () => {
  const progress = buildProgressHistory(history);
  const benchHistory = progress.exercises.get(benchKey)!;
  const crunchHistory = progress.exercises.get(crunchKey)!;

  it('compares the first and last estimated 1RM in the window, from its first day', () => {
    const window = progressSince(benchHistory, day(7, 8));

    expect(window.axis).toBe('load');
    expect(window.points.map((x) => x.workoutId)).toEqual(['s2', 's3']);
    expect(window.change).toEqual({
      axis: 'load',
      first: epley(85, 3),
      last: epley(82.5, 10),
      delta: epley(82.5, 10).minus(epley(85, 3)),
    });
  });

  it('compares best reps for a movement that tracks no load', () => {
    expect(progressSince(crunchHistory, day(1, 1)).change).toEqual({ axis: 'reps', first: 20, last: 25, delta: 5 });
  });

  it('has no change with a single point in the window', () => {
    const window = progressSince(benchHistory, day(7, 15));

    expect(window.points).toHaveLength(1);
    expect(window.change).toBeUndefined();
  });

  it('gives a sparkline its values in the unit asked for', () => {
    expect(trendValues(progressSince(benchHistory, day(7, 8)), 'kilograms')).toEqual([93.5, 110]);
    expect(trendValues(progressSince(crunchHistory, day(1, 1)), 'pounds')).toEqual([20, 25]);
  });
});

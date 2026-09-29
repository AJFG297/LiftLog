import { describe, expect, it } from 'vitest';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import { SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { PotentialSet, RecordedSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';
import { bestSetComparisons, durationVsUsual, nextTargets, setCounts, volumeVsLast } from '@/models/workout-summary';

const kg = (n: number) => new Weight(n, 'kilograms');
const bench = makeWeightedBlueprint({ name: 'Bench Press', sets: 1, repsConfig: { type: 'fixed', reps: 5 } });

function logged(weight: Weight, reps: number, at: OffsetDateTime, kind: PotentialSet['kind'] = 'working') {
  return PotentialSet.of({ set: RecordedSet.of({ repsCompleted: reps, completionDateTime: at }), weight, kind });
}

let nextId = 0;
function workout(name: string, exercises: RecordedWeightedExercise[], day = 1): Session {
  nextId += 1;
  return new Session(
    `w${nextId}`,
    new SessionBlueprint(
      name,
      exercises.map((x) => x.blueprint),
      '',
    ),
    exercises,
    LocalDate.of(2026, 9, day),
    undefined,
    undefined,
  );
}

/** A Push workout on `day` whose first and last sets are `minutes` apart. */
function pushLasting(minutes: number, day: number) {
  const start = OffsetDateTime.parse(`2026-09-${String(day).padStart(2, '0')}T10:00:00Z`);
  return workout(
    'Push',
    [
      new RecordedWeightedExercise(
        bench,
        [logged(kg(80), 5, start), logged(kg(80), 5, start.plusMinutes(minutes))],
        undefined,
      ),
    ],
    day,
  );
}

function lifting(blueprint: WeightedExerciseBlueprint, sets: [number, number][], warmups: [number, number][] = []) {
  const at = OffsetDateTime.parse('2026-09-27T10:00:00Z');
  return new RecordedWeightedExercise(
    blueprint,
    sets.map(([weight, reps], i) => logged(kg(weight), reps, at.plusMinutes(i))),
    undefined,
  ).with({ warmupSets: warmups.map(([weight, reps]) => logged(kg(weight), reps, at, 'warmup')) });
}

describe('durationVsUsual', () => {
  it('compares with the median of the last five workouts of the same routine', () => {
    const history = [
      pushLasting(40, 1),
      pushLasting(60, 3),
      pushLasting(45, 5),
      pushLasting(50, 7),
      pushLasting(49, 9),
      pushLasting(48, 11),
      workout('Pull', [], 12),
    ];

    // The last five Push workouts took 60, 45, 50, 49 and 48 minutes: the usual is 49.
    expect(durationVsUsual(pushLasting(52, 27), history)).toEqual({ type: 'longer', minutes: 3 });
    expect(durationVsUsual(pushLasting(41, 27), history)).toEqual({ type: 'shorter', minutes: 8 });
    expect(durationVsUsual(pushLasting(49, 27), history)).toEqual({ type: 'same' });
  });

  it('averages the middle two of an even number of workouts', () => {
    const history = [pushLasting(40, 1), pushLasting(50, 3)];

    expect(durationVsUsual(pushLasting(50, 27), history)).toEqual({ type: 'longer', minutes: 5 });
  });

  it('ignores workouts after this one and this one itself', () => {
    const today = pushLasting(30, 20);

    expect(durationVsUsual(today, [today, pushLasting(90, 25)])).toEqual({ type: 'none' });
  });

  it('has nothing to say about the first workout of a routine', () => {
    expect(durationVsUsual(pushLasting(52, 27), [workout('Pull', [], 1)])).toEqual({ type: 'none' });
  });
});

describe('volumeVsLast', () => {
  const push = (weight: number) => workout('Push', [lifting(bench, [[weight, 10]])]);

  it('gives the change in volume against last time to one decimal place', () => {
    expect(volumeVsLast(push(104.6), push(100))).toEqual({ type: 'up', percent: 4.6 });
    expect(volumeVsLast(push(97.5), push(100))).toEqual({ type: 'down', percent: 2.5 });
    expect(volumeVsLast(push(100), push(100))).toEqual({ type: 'same' });
  });

  it('has no comparison without a last time that moved weight', () => {
    expect(volumeVsLast(push(100), undefined)).toEqual({ type: 'none' });
    expect(volumeVsLast(push(100), workout('Push', []))).toEqual({ type: 'none' });
  });
});

describe('setCounts', () => {
  it('counts logged working and warm-up sets apart', () => {
    const session = workout('Push', [
      lifting(
        bench,
        [
          [80, 5],
          [80, 5],
        ],
        [[40, 5]],
      ),
      new RecordedWeightedExercise(
        bench,
        [PotentialSet.of({ weight: kg(80) }), logged(kg(60), 12, OffsetDateTime.parse('2026-09-27T11:00:00Z'), 'drop')],
        undefined,
      ),
    ]);

    expect(setCounts(session)).toEqual({ working: 3, warmup: 1 });
  });
});

describe('bestSetComparisons', () => {
  const press = makeWeightedBlueprint({ name: 'Overhead Press' });
  const fly = makeWeightedBlueprint({ name: 'Cable Fly' });
  const raise = makeWeightedBlueprint({ name: 'Lateral Raise' });
  const dips = makeWeightedBlueprint({ name: 'Dips', resistance: 'none' });

  it('compares each best set by weight first, then reps', () => {
    const last = workout('Push', [
      lifting(bench, [[85, 5]]),
      lifting(press, [[50, 7]]),
      lifting(fly, [[15, 15]]),
      lifting(dips, [[0, 10]]),
    ]);
    const today = workout('Push', [
      lifting(bench, [
        [90, 4],
        [85, 6],
      ]),
      lifting(press, [[50, 8]]),
      lifting(fly, [[15, 14]]),
      lifting(dips, [[0, 10]]),
      lifting(raise, [[10, 12]]),
    ]);

    expect(bestSetComparisons(today, last).map(({ name, best, change }) => ({ name, best, change }))).toEqual([
      { name: 'Bench Press', best: { weight: kg(90), reps: 4 }, change: { type: 'weight', delta: kg(5) } },
      { name: 'Overhead Press', best: { weight: kg(50), reps: 8 }, change: { type: 'reps', delta: 1 } },
      { name: 'Cable Fly', best: { weight: kg(15), reps: 14 }, change: { type: 'reps', delta: -1 } },
      { name: 'Dips', best: { weight: kg(0), reps: 10 }, change: { type: 'same' } },
      { name: 'Lateral Raise', best: { weight: kg(10), reps: 12 }, change: { type: 'new' } },
    ]);
  });

  it('calls everything new without a last time', () => {
    const today = workout('Push', [lifting(bench, [[90, 4]])]);

    expect(bestSetComparisons(today, undefined).map((x) => x.change)).toEqual([{ type: 'new' }]);
  });

  it('compares reps only on a movement with no load', () => {
    const last = workout('Push', [lifting(dips, [[10, 10]])]);
    const today = workout('Push', [lifting(dips, [[0, 12]])]);

    expect(bestSetComparisons(today, last)[0]?.change).toEqual({ type: 'reps', delta: 2 });
  });
});

describe('nextTargets', () => {
  const at = OffsetDateTime.parse('2026-09-01T10:00:00Z');
  const dips = makeWeightedBlueprint({ name: 'Dips', resistance: 'none' });
  const fly = makeWeightedBlueprint({ name: 'Cable Fly' });
  const done = workout('Push', [
    new RecordedWeightedExercise(bench, [logged(kg(85), 5, at)], undefined),
    new RecordedWeightedExercise(dips, [logged(kg(0), 10, at)], undefined),
    new RecordedWeightedExercise(fly, [PotentialSet.of({ weight: kg(15) })], undefined),
  ]);

  it('gives the heaviest progressed set of each weighted exercise with its target', () => {
    const next = workout('Push', [
      new RecordedWeightedExercise(
        bench,
        [
          PotentialSet.of({ weight: kg(90), target: { min: 5, max: 5 } }),
          PotentialSet.of({ weight: kg(70), target: { min: 12, max: 12 }, kind: 'drop' }),
        ],
        undefined,
      ),
      new RecordedWeightedExercise(dips, [PotentialSet.of({ weight: kg(0), target: { min: 8, max: 12 } })], undefined),
    ]);

    expect(nextTargets(next, done)).toEqual([
      { name: 'Bench Press', weight: kg(90), reps: { min: 5, max: 5 } },
      { name: 'Dips', weight: undefined, reps: { min: 8, max: 12 } },
    ]);
  });

  it('leaves out exercises not logged today, and the load of one done with none', () => {
    const lateral = makeWeightedBlueprint({ name: 'Lateral Raise' });
    const next = workout('Push', [
      new RecordedWeightedExercise(fly, [PotentialSet.of({ weight: kg(15), target: { min: 12, max: 12 } })], undefined),
      new RecordedWeightedExercise(
        lateral,
        [PotentialSet.of({ weight: kg(0), target: { min: 10, max: 10 } })],
        undefined,
      ),
      new RecordedWeightedExercise(
        makeWeightedBlueprint({ name: 'Bench Press' }),
        [PotentialSet.of({ weight: kg(0), target: { min: 5, max: 5 } })],
        undefined,
      ),
    ]);

    expect(nextTargets(next, done)).toEqual([{ name: 'Bench Press', weight: undefined, reps: { min: 5, max: 5 } }]);
  });
});

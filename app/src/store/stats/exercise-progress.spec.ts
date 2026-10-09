import { describe, expect, it } from 'vitest';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import { SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { PotentialSet, RecordedSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import { Weight, WeightUnit } from '@/models/weight';
import {
  defaultRangeOf,
  exerciseChartOf,
  exerciseRecordsOf,
  measuresOf,
  rangeStart,
  recentSessionsOf,
  repBestsOf,
} from '@/store/stats/exercise-progress';
import { buildProgressHistory, progressSince } from '@/store/stats/progress-history';

const kg = (n: number) => new Weight(n, 'kilograms');
const day = (month: number, n: number) => LocalDate.of(2026, month, n);
const time = OffsetDateTime.parse('2026-07-01T10:00:00Z');

const bench = makeWeightedBlueprint({ name: 'Bench' });
const pushUp = makeWeightedBlueprint({ name: 'Push-up', resistance: 'none' });
const dip = makeWeightedBlueprint({ name: 'Dip', resistance: 'bodyweight' });

function set(weight: number, reps: number, unit: WeightUnit = 'kilograms') {
  return PotentialSet.of({
    set: RecordedSet.of({ repsCompleted: reps, completionDateTime: time }),
    weight: new Weight(weight, unit),
    target: { min: reps, max: reps },
    kind: 'working',
  });
}

function session(
  date: LocalDate,
  blueprint: WeightedExerciseBlueprint,
  sets: [number, number][],
  bodyweight?: number,
  unit: WeightUnit = 'kilograms',
) {
  return new Session(
    `w-${date.toString()}`,
    new SessionBlueprint('Day', [], ''),
    [
      new RecordedWeightedExercise(
        blueprint,
        sets.map(([w, r]) => set(w, r, unit)),
        undefined,
      ),
    ],
    date,
    bodyweight === undefined ? undefined : kg(bodyweight),
    undefined,
  );
}

const history = buildProgressHistory([
  // Est. 1RM 70.
  session(day(6, 1), bench, [[60, 5]]),
  // 76: a better estimate at the same weight.
  session(day(7, 1), bench, [
    [60, 8],
    [60, 6],
  ]),
  // 72.9: heavier than ever, but no better estimate.
  session(day(8, 1), bench, [[62.5, 5]]),
  // 77.1: a better estimate again.
  session(day(9, 1), bench, [[62.5, 7]]),
  // 66.7: neither.
  session(day(9, 22), bench, [[50, 10]]),
]);
const benchHistory = history.exercises.get(bench.movementKey())!;
const today = day(10, 1);

describe('measuresOf', () => {
  it('offers est. 1RM, heaviest and volume for a loaded lift', () => {
    expect(measuresOf(benchHistory)).toEqual(['oneRepMax', 'heaviest', 'volume']);
  });

  it('offers reps for a movement that tracks no load', () => {
    const reps = buildProgressHistory([session(day(9, 1), pushUp, [[0, 20]])]);

    expect(measuresOf(reps.exercises.get(pushUp.movementKey())!)).toEqual(['mostReps', 'totalReps']);
  });

  it('reads a bodyweight movement in reps while it never had any load, bodyweight or added', () => {
    const unloaded = buildProgressHistory([session(day(9, 1), dip, [[0, 10]]), session(day(9, 8), dip, [[0, 12]])]);
    const dips = unloaded.exercises.get(dip.movementKey())!;

    expect(measuresOf(dips)).toEqual(['mostReps', 'totalReps']);
    expect(exerciseChartOf(unloaded, dips, 'mostReps', undefined, 'kilograms').sessions.map((s) => s.value)).toEqual([
      10, 12,
    ]);
    // The Progress lists read it the same way, rather than as 0 kg.
    expect(progressSince(dips, day(1, 1)).change).toEqual({ axis: 'reps', first: 10, last: 12, delta: 2 });
  });

  it('keeps a bodyweight movement on the estimate once it had bodyweight logged or weight added', () => {
    const withBodyweight = buildProgressHistory([
      session(day(9, 1), dip, [[0, 10]]),
      session(day(9, 8), dip, [[0, 12]], 80),
    ]);
    const withAdded = buildProgressHistory([session(day(9, 1), dip, [[0, 10]]), session(day(9, 8), dip, [[10, 6]])]);

    expect(measuresOf(withBodyweight.exercises.get(dip.movementKey())!)[0]).toBe('oneRepMax');
    expect(measuresOf(withAdded.exercises.get(dip.movementKey())!)[0]).toBe('oneRepMax');
  });

  it('leaves heaviest out for a bodyweight movement that never had weight added', () => {
    const bodyweightOnly = buildProgressHistory([session(day(9, 1), dip, [[0, 10]], 80)]);
    const weighted = buildProgressHistory([
      session(day(9, 1), dip, [[0, 10]], 80),
      session(day(9, 8), dip, [[10, 6]], 80),
    ]);

    expect(measuresOf(bodyweightOnly.exercises.get(dip.movementKey())!)).toEqual(['oneRepMax', 'volume']);
    expect(measuresOf(weighted.exercises.get(dip.movementKey())!)).toEqual(['oneRepMax', 'heaviest', 'volume']);
  });

  it('leaves out the workouts a bodyweight movement had no load in, rather than charting them at 0', () => {
    const partly = buildProgressHistory([
      session(day(9, 1), dip, [[0, 10]]),
      session(day(9, 8), dip, [[0, 12]], 80),
      session(day(9, 15), dip, [[0, 12]], 80),
    ]);
    const dips = partly.exercises.get(dip.movementKey())!;

    const estimates = exerciseChartOf(partly, dips, 'oneRepMax', undefined, 'kilograms');
    expect(estimates.sessions.map((s) => s.workoutId)).toEqual(['w-2026-09-08', 'w-2026-09-15']);
    expect(estimates.sessions.some((s) => s.best)).toBe(false);
    expect(exerciseChartOf(partly, dips, 'volume', undefined, 'kilograms').sessions.map((s) => s.workoutId)).toEqual([
      'w-2026-09-08',
      'w-2026-09-15',
    ]);
    // The first loaded workout is where the bests start, not a record over the unloaded one.
    expect(partly.records).toEqual([]);
  });
});

describe('exerciseChartOf', () => {
  const chartOf = (measure: Parameters<typeof exerciseChartOf>[2], since?: LocalDate, selected?: string) =>
    exerciseChartOf(history, benchHistory, measure, since, 'kilograms', selected);

  it('dots every better estimate on the Est. 1RM chart, the first workout never', () => {
    expect(chartOf('oneRepMax').sessions.map((s) => [s.date.monthValue(), s.value, s.best])).toEqual([
      [6, 70, false],
      [7, 76, true],
      [8, 73, false],
      [9, 77, true],
      [9, 66.5, false],
    ]);
  });

  it('dots every heavier weight on the Heaviest chart', () => {
    expect(chartOf('heaviest').sessions.map((s) => [s.value, s.best])).toEqual([
      [60, false],
      [60, false],
      [62.5, true],
      [62.5, false],
      [50, false],
    ]);
  });

  it('draws no dots on Volume', () => {
    const volume = chartOf('volume');

    expect(volume.sessions.map((s) => s.value)).toEqual([300, 840, 313, 438, 500]);
    expect(volume.sessions.some((s) => s.best)).toBe(false);
  });

  it('keeps a dot that an earlier workout outside the range set up', () => {
    // The July estimate beat June's: still a record when June is out of range.
    expect(chartOf('oneRepMax', day(7, 1)).sessions[0]).toMatchObject({ value: 76, best: true });
  });

  it('gives the change over the range as shown, last against first', () => {
    expect(chartOf('oneRepMax').change).toBe(-3.5);
    expect(chartOf('oneRepMax', day(8, 1)).change).toBe(-6.5);
    expect(chartOf('heaviest', day(8, 1)).change).toBe(-12.5);
    expect(chartOf('oneRepMax', day(9, 20)).change).toBeUndefined();
  });

  it.each([
    ['gain', 60.08, 300.4, 0.4],
    ['fall', 59.92, 299.6, -0.4],
    ['same', 60, 300, 0],
    ['usual gain', 62, 310, 10],
  ])('shows a volume %s consistently on the chart and in Last times', (_, weight, volume, change) => {
    const tiny = buildProgressHistory([session(day(9, 1), bench, [[60, 5]]), session(day(9, 8), bench, [[weight, 5]])]);

    expect(
      exerciseChartOf(tiny, tiny.exercises.get(bench.movementKey())!, 'volume', undefined, 'kilograms'),
    ).toMatchObject({
      sessions: [
        { value: 300, volume: 300 },
        { value: volume, volume },
      ],
      change,
    });
  });

  it('shows a tiny estimate gain on the chart and in Last times', () => {
    const tiny = buildProgressHistory([session(day(9, 1), bench, [[60, 5]]), session(day(9, 8), bench, [[60.02, 5]])]);

    expect(
      exerciseChartOf(tiny, tiny.exercises.get(bench.movementKey())!, 'oneRepMax', undefined, 'kilograms'),
    ).toMatchObject({
      sessions: [
        { value: 70, rowValue: 70 },
        { value: 70.02, rowValue: 70.02 },
      ],
      change: 0.02,
    });
  });

  it('keeps a converted load gain from reading as a fall at the chart endpoints', () => {
    const mixed = buildProgressHistory([
      session(day(9, 1), bench, [[62.5, 5]]),
      session(day(9, 8), bench, [[137.9, 5]], undefined, 'pounds'),
    ]);

    expect(
      exerciseChartOf(mixed, mixed.exercises.get(bench.movementKey())!, 'heaviest', undefined, 'pounds'),
    ).toMatchObject({
      sessions: [
        { value: 137.8, rowValue: 137.8, set: { weight: new Weight(137.8, 'pounds'), reps: 5 } },
        { value: 137.9, rowValue: 137.9, set: { weight: new Weight(137.9, 'pounds'), reps: 5 } },
      ],
      change: 0.1,
    });
  });

  it('keeps a converted load fall from reading as a gain at the chart endpoints', () => {
    const mixed = buildProgressHistory([
      session(day(9, 1), bench, [[137.9, 5]], undefined, 'pounds'),
      session(day(9, 8), bench, [[62.5, 5]]),
    ]);

    expect(
      exerciseChartOf(mixed, mixed.exercises.get(bench.movementKey())!, 'heaviest', undefined, 'pounds'),
    ).toMatchObject({
      sessions: [
        { value: 137.9, rowValue: 137.9, set: { weight: new Weight(137.9, 'pounds'), reps: 5 } },
        { value: 137.8, rowValue: 137.8, set: { weight: new Weight(137.8, 'pounds'), reps: 5 } },
      ],
      change: -0.1,
    });
  });

  it('tags the workouts where the record ledger set a record', () => {
    expect(chartOf('volume').sessions.map((s) => s.record)).toEqual([false, true, true, true, false]);
  });

  it('gives each workout the set behind the value and its row figure', () => {
    const july = (measure: Parameters<typeof exerciseChartOf>[2]) => chartOf(measure).sessions[1]!;

    expect(july('oneRepMax')).toMatchObject({ set: { weight: kg(60), reps: 8 }, rowValue: 76, sets: 2 });
    expect(july('heaviest')).toMatchObject({ set: { weight: kg(60), reps: 8 }, rowValue: 60 });
    // Volume is in the row already, so the row closes on the estimate.
    expect(july('volume')).toMatchObject({ set: { weight: kg(60), reps: 8 }, rowValue: 76, volume: 840 });
    expect([chartOf('oneRepMax').rowValue, chartOf('heaviest').rowValue, chartOf('volume').rowValue]).toEqual([
      'oneRepMax',
      'heaviest',
      'oneRepMax',
    ]);
  });

  it('picks the latest by default, and keeps a pick while it is in range', () => {
    expect(chartOf('oneRepMax').selected).toBe(4);
    expect(chartOf('oneRepMax', undefined, 'w-2026-07-01').selected).toBe(1);
    expect(chartOf('heaviest', day(8, 1), 'w-2026-08-01').selected).toBe(0);
    expect(chartOf('oneRepMax', day(8, 1), 'w-2026-07-01').selected).toBe(2);
  });

  it('has nothing to pick in a range with no workouts', () => {
    expect(chartOf('oneRepMax', day(9, 30))).toMatchObject({ sessions: [], selected: undefined, change: undefined });
  });

  it('shows weights in the user’s unit', () => {
    const pounds = exerciseChartOf(history, benchHistory, 'heaviest', undefined, 'pounds');

    // 62.5 kg is 137.79 lbs: converted, it shows to the nearest half.
    expect(pounds.sessions[2]?.value).toBe(138);
  });

  it('reads a movement that tracks no load in reps', () => {
    const reps = buildProgressHistory([
      session(day(9, 1), pushUp, [
        [0, 20],
        [0, 15],
      ]),
      session(day(9, 8), pushUp, [[0, 22]]),
    ]);
    const pushUps = reps.exercises.get(pushUp.movementKey())!;

    expect(exerciseChartOf(reps, pushUps, 'totalReps', undefined, 'kilograms').rowValue).toBe('mostReps');
    expect(exerciseChartOf(reps, pushUps, 'mostReps', undefined, 'kilograms')).toMatchObject({
      sessions: [
        { value: 20, best: false, set: { weight: undefined, reps: 20 }, volume: 35 },
        { value: 22, best: false, set: { weight: undefined, reps: 22 }, volume: 22 },
      ],
      change: 2,
    });
    expect(exerciseChartOf(reps, pushUps, 'totalReps', undefined, 'kilograms').sessions.map((s) => s.value)).toEqual([
      35, 22,
    ]);
  });
});

describe('recentSessionsOf', () => {
  it('lists the latest five, newest first', () => {
    const chart = exerciseChartOf(history, benchHistory, 'oneRepMax', undefined, 'kilograms');

    expect(recentSessionsOf(chart).map((s) => s.date)).toEqual([
      day(9, 22),
      day(9, 1),
      day(8, 1),
      day(7, 1),
      day(6, 1),
    ]);
  });
});

describe('repBestsOf', () => {
  it('gives the heaviest weight for at least 5 to 8 reps, dated by the first workout to lift it', () => {
    expect(repBestsOf(benchHistory, 'kilograms')).toEqual([
      { reps: 5, weight: kg(62.5), date: day(8, 1) },
      { reps: 6, weight: kg(62.5), date: day(9, 1) },
      { reps: 7, weight: kg(62.5), date: day(9, 1) },
      { reps: 8, weight: kg(60), date: day(7, 1) },
    ]);
  });

  it('leaves a rep count never reached empty', () => {
    const heavy = buildProgressHistory([session(day(9, 1), bench, [[100, 3]])]);

    expect(repBestsOf(heavy.exercises.get(bench.movementKey())!, 'kilograms')?.[0]).toEqual({
      reps: 5,
      weight: undefined,
      date: undefined,
    });
  });

  it('does not apply to a movement that tracks no load', () => {
    const reps = buildProgressHistory([session(day(9, 1), pushUp, [[0, 20]])]);

    expect(repBestsOf(reps.exercises.get(pushUp.movementKey())!, 'kilograms')).toBeUndefined();
  });

  it('does not apply to a bodyweight movement, even with weight added', () => {
    const weighted = buildProgressHistory([session(day(9, 1), dip, [[10, 6]], 80)]);

    expect(repBestsOf(weighted.exercises.get(dip.movementKey())!, 'kilograms')).toBeUndefined();
  });
});

describe('exerciseRecordsOf', () => {
  it('lists the exercise’s records newest first, at most four', () => {
    const rows = exerciseRecordsOf(history, bench.movementKey(), 'kilograms');

    expect(rows.map((row) => [row.kind, row.date])).toEqual([
      ['estimatedOneRepMax', day(9, 1)],
      ['heaviestWeight', day(8, 1)],
      ['estimatedOneRepMax', day(7, 1)],
    ]);
  });
});

describe('rangeStart', () => {
  it('counts months back from today, and all has no start', () => {
    expect(rangeStart('3m', today)).toEqual(day(7, 1));
    expect(rangeStart('1y', today)).toEqual(LocalDate.of(2025, 10, 1));
    expect(rangeStart('all', today)).toBeUndefined();
  });
});

describe('defaultRangeOf', () => {
  it('opens on the shortest range with a trend in it, else all', () => {
    // July, August and two in September are within three months of October 1.
    expect(defaultRangeOf(benchHistory, today)).toBe('3m');
    expect(defaultRangeOf(benchHistory, day(12, 15))).toBe('6m');
    expect(defaultRangeOf(benchHistory, LocalDate.of(2027, 9, 10))).toBe('all');
  });
});

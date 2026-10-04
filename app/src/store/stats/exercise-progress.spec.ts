import { describe, expect, it } from 'vitest';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import { SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { PotentialSet, RecordedSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import { Weight } from '@/models/weight';
import {
  defaultRangeOf,
  exerciseChartOf,
  exerciseRecordsOf,
  measuresOf,
  rangeStart,
  recentSessionsOf,
  repBestsOf,
} from '@/store/stats/exercise-progress';
import { buildProgressHistory } from '@/store/stats/progress-history';

const kg = (n: number) => new Weight(n, 'kilograms');
const day = (month: number, n: number) => LocalDate.of(2026, month, n);
const time = OffsetDateTime.parse('2026-07-01T10:00:00Z');

const bench = makeWeightedBlueprint({ name: 'Bench' });
const pushUp = makeWeightedBlueprint({ name: 'Push-up', resistance: 'none' });
const dip = makeWeightedBlueprint({ name: 'Dip', resistance: 'bodyweight' });

function set(weight: number, reps: number) {
  return PotentialSet.of({
    set: RecordedSet.of({ repsCompleted: reps, completionDateTime: time }),
    weight: kg(weight),
    target: { min: reps, max: reps },
    kind: 'working',
  });
}

function session(date: LocalDate, blueprint: WeightedExerciseBlueprint, sets: [number, number][], bodyweight?: number) {
  return new Session(
    `w-${date.toString()}`,
    new SessionBlueprint('Day', [], ''),
    [
      new RecordedWeightedExercise(
        blueprint,
        sets.map(([w, r]) => set(w, r)),
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

  it('leaves heaviest out for a bodyweight movement that never had weight added', () => {
    const bodyweightOnly = buildProgressHistory([session(day(9, 1), dip, [[0, 10]], 80)]);
    const weighted = buildProgressHistory([
      session(day(9, 1), dip, [[0, 10]], 80),
      session(day(9, 8), dip, [[10, 6]], 80),
    ]);

    expect(measuresOf(bodyweightOnly.exercises.get(dip.movementKey())!)).toEqual(['oneRepMax', 'volume']);
    expect(measuresOf(weighted.exercises.get(dip.movementKey())!)).toEqual(['oneRepMax', 'heaviest', 'volume']);
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

  it('tags the workouts where the record ledger set a record', () => {
    expect(chartOf('volume').sessions.map((s) => s.record)).toEqual([false, true, true, true, false]);
  });

  it('gives each workout the set behind the value and its row figure', () => {
    const july = (measure: Parameters<typeof exerciseChartOf>[2]) => chartOf(measure).sessions[1]!;

    expect(july('oneRepMax')).toMatchObject({ set: { weight: kg(60), reps: 8 }, rowValue: 76, sets: 2 });
    expect(july('heaviest')).toMatchObject({ set: { weight: kg(60), reps: 8 }, rowValue: 60 });
    // Volume is in the row already, so the row closes on the estimate.
    expect(july('volume')).toMatchObject({ set: { weight: kg(60), reps: 8 }, rowValue: 76, volume: 840 });
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

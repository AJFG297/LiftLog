import { describe, expect, it } from 'vitest';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import { findPersonalRecords, RecordLedger, sessionRecords } from '@/store/stats/personal-records';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { movementKeyFor, ProgressionRule, Rest, SessionBlueprint, stubExerciseId } from '@/models/blueprint-models';
import { Weight } from '@/models/weight';
import {
  filledPotentialSet,
  makeRecordedExercise,
  makeWeightedBlueprint,
} from '@/models/session-models/__test__/helpers';

function exercise(name: string, weight: Weight, reps: number) {
  const blueprint = makeWeightedBlueprint({
    name,
    repsConfig: { type: 'fixed', reps: 5 },
    progression: [ProgressionRule.load(new BigNumber(2.5), { type: 'lowestSets', pick: 'middle' })],
    restBetweenSets: Rest.long,
  });
  const time = OffsetDateTime.parse('2026-01-01T10:00:00Z');
  return new RecordedWeightedExercise(blueprint, [filledPotentialSet(reps, time, weight)], undefined);
}

function session(id: string, date: LocalDate, exercises: RecordedWeightedExercise[]) {
  return new Session(id, new SessionBlueprint('Day', [], ''), exercises, date, undefined, undefined);
}

const kg = (n: number) => new Weight(n, 'kilograms');
const day = (n: number) => LocalDate.of(2026, 7, n);

function withWarmup(exercise: RecordedWeightedExercise, weight: Weight, reps: number) {
  const time = OffsetDateTime.parse('2026-01-01T09:55:00Z');
  return exercise.with({ warmupSets: [filledPotentialSet(reps, time, weight)] });
}

describe('findPersonalRecords', () => {
  it('does not award a record on the first sighting of an exercise', () => {
    // Otherwise a user with a single event in your feed gets a badge on everything they do.
    const records = findPersonalRecords([session('s1', day(1), [exercise('Squat', kg(100), 5)])]);

    expect(records.size).toBe(0);
  });

  it('awards a record when a later session beats an earlier one', () => {
    const records = findPersonalRecords([
      session('s1', day(1), [exercise('Squat', kg(100), 5)]),
      session('s2', day(8), [exercise('Squat', kg(110), 5)]),
    ]);

    expect(records.get('s2')?.[0]?.exerciseName).toBe('Squat');
    expect(records.has('s1')).toBe(false);
  });

  it('does not award a record for matching or regressing', () => {
    const records = findPersonalRecords([
      session('s1', day(1), [exercise('Squat', kg(100), 5)]),
      session('s2', day(8), [exercise('Squat', kg(100), 5)]),
      session('s3', day(15), [exercise('Squat', kg(90), 5)]),
    ]);

    expect(records.size).toBe(0);
  });

  it('compares estimated 1RM, so more reps at a lighter weight can be a record', () => {
    // Epley: 100kg x 5 = 116.7; 95kg x 10 = 126.7.
    const records = findPersonalRecords([
      session('s1', day(1), [exercise('Squat', kg(100), 5)]),
      session('s2', day(8), [exercise('Squat', kg(95), 10)]),
    ]);

    expect(records.has('s2')).toBe(true);
  });

  it('tracks each exercise separately', () => {
    const records = findPersonalRecords([
      session('s1', day(1), [exercise('Squat', kg(100), 5), exercise('Bench', kg(60), 5)]),
      session('s2', day(8), [exercise('Squat', kg(110), 5), exercise('Bench', kg(50), 5)]),
    ]);

    const names = records.get('s2')?.map((x) => x.exerciseName);
    expect(names).toEqual(['Squat']);
  });

  it('handles weights in different units', () => {
    const records = findPersonalRecords([
      session('s1', day(1), [exercise('Squat', kg(100), 5)]),
      session('s2', day(8), [exercise('Squat', new Weight(250, 'pounds'), 5)]),
    ]);

    expect(records.has('s2')).toBe(true);
  });

  it('folds bodyweight into the estimated 1RM for a bodyweight exercise', () => {
    // Same +10kg added both sessions, but a heavier bodyweight makes the effective 1RM a record.
    const blueprint = makeWeightedBlueprint({
      name: 'Pull Up',
      repsConfig: { type: 'fixed', reps: 5 },
      progression: [ProgressionRule.load(new BigNumber(2.5), { type: 'lowestSets', pick: 'middle' })],
      restBetweenSets: Rest.long,
      resistance: 'bodyweight',
    });
    const build = (id: string, date: LocalDate, bodyweightKg: number) => {
      const time = OffsetDateTime.parse('2026-01-01T10:00:00Z');
      const ex = new RecordedWeightedExercise(blueprint, [filledPotentialSet(5, time, kg(10))], undefined);
      return new Session(
        id,
        new SessionBlueprint('Day', [], ''),
        [ex],
        date,
        new Weight(bodyweightKg, 'kilograms'),
        undefined,
      );
    };

    const records = findPersonalRecords([build('s1', day(1), 80), build('s2', day(8), 85)]);

    expect(records.has('s2')).toBe(true);
  });

  it('ignores sessions with no completed sets', () => {
    const records = findPersonalRecords([
      session('s1', day(1), [exercise('Squat', kg(100), 5)]),
      session('s2', day(8), []),
      session('s3', day(15), [exercise('Squat', kg(120), 5)]),
    ]);

    expect(records.has('s2')).toBe(false);
    expect(records.has('s3')).toBe(true);
  });
});

describe('findPersonalRecords for exercises that track no load', () => {
  it('awards no records, because a 1RM needs a load', () => {
    const blueprint = makeWeightedBlueprint({ name: 'Crunch', resistance: 'none' });
    const build = (id: string, date: LocalDate, reps: number) =>
      new Session(
        id,
        new SessionBlueprint('Core', [blueprint], ''),
        [makeRecordedExercise(blueprint, [reps])],
        date,
        undefined,
        undefined,
      );

    const records = findPersonalRecords([build('s1', day(1), 20), build('s2', day(8), 30)]);

    expect([...records.values()].flat()).toEqual([]);
  });

  it('never awards a record for a warm-up heavier than the working sets', () => {
    const records = findPersonalRecords([
      session('s1', day(1), [exercise('Squat', kg(100), 5)]),
      session('s2', day(8), [withWarmup(exercise('Squat', kg(100), 5), kg(150), 5)]),
    ]);

    expect(records.size).toBe(0);
  });

  it('judges a record on the working sets alone, however light the warm-up', () => {
    const records = findPersonalRecords([
      session('s1', day(1), [withWarmup(exercise('Squat', kg(100), 5), kg(150), 5)]),
      session('s2', day(8), [withWarmup(exercise('Squat', kg(110), 5), kg(20), 5)]),
    ]);

    // A 150 kg warm-up in s1 would otherwise have set a best that 110 kg never beats.
    expect(records.get('s2')?.[0]?.exerciseName).toBe('Squat');
  });

  it('leaves an exercise with only warm-ups logged out of the running best', () => {
    const warmupsOnly = withWarmup(exercise('Squat', kg(100), 5), kg(150), 5).withNothingCompleted();
    const records = findPersonalRecords([
      session('s1', day(1), [warmupsOnly.withWarmupRepCount(0, 5, OffsetDateTime.parse('2026-01-01T09:55:00Z'))]),
      session('s2', day(8), [exercise('Squat', kg(110), 5)]),
    ]);

    // s2 is the first real sighting, so it is no record.
    expect(records.size).toBe(0);
  });
});

/** The bests after walking `earlier`, as `WorkoutRepository.bestsBefore` reads them from the tables. */
function bestsOf(earlier: Session[]) {
  const ledger = new RecordLedger();
  earlier.forEach((past) => ledger.add(past));
  return ledger.bests;
}

describe('sessionRecords', () => {
  it('reports a heavier set than ever with the weight it beat', () => {
    const records = sessionRecords(
      session('s3', day(15), [exercise('Bench', kg(90), 4)]),
      bestsOf([
        session('s1', day(1), [exercise('Bench', kg(85), 5)]),
        session('s2', day(8), [exercise('Bench', kg(80), 5)]),
      ]),
    );

    expect(records).toEqual([
      {
        kind: 'heaviestWeight',
        key: movementKeyFor(stubExerciseId('Bench'), 'WeightedExerciseBlueprint'),
        exerciseName: 'Bench',
        weight: kg(90),
        reps: 4,
        previous: kg(85),
      },
    ]);
  });

  it('reports a better estimated 1RM at a weight lifted before', () => {
    // Epley: 100kg x 5 = 116.7; 100kg x 6 = 120.
    const records = sessionRecords(
      session('s2', day(8), [exercise('Squat', kg(100), 6)]),
      bestsOf([session('s1', day(1), [exercise('Squat', kg(100), 5)])]),
    );

    expect(records).toEqual([
      {
        kind: 'estimatedOneRepMax',
        key: movementKeyFor(stubExerciseId('Squat'), 'WeightedExerciseBlueprint'),
        exerciseName: 'Squat',
        oneRepMax: kg(100).multipliedBy(new BigNumber(1).plus(new BigNumber(6).div(30))),
        weight: kg(100),
        reps: 6,
        previous: kg(100).multipliedBy(new BigNumber(1).plus(new BigNumber(5).div(30))),
      },
    ]);
  });

  it('reports nothing for a first sighting, a match or a regression', () => {
    const earlier = bestsOf([session('s1', day(1), [exercise('Squat', kg(100), 5)])]);

    expect(sessionRecords(session('s2', day(8), [exercise('Bench', kg(60), 5)]), earlier)).toEqual([]);
    expect(sessionRecords(session('s2', day(8), [exercise('Squat', kg(100), 5)]), earlier)).toEqual([]);
    expect(sessionRecords(session('s2', day(8), [exercise('Squat', kg(90), 5)]), earlier)).toEqual([]);
  });
});

describe('RecordLedger', () => {
  const bench = movementKeyFor(stubExerciseId('Bench'), 'WeightedExerciseBlueprint');
  const epley = (weight: number, reps: number) =>
    kg(weight).multipliedBy(new BigNumber(1).plus(new BigNumber(reps).div(30)));

  it('walks a history, giving each workout the records it sets and the best each one beat', () => {
    const ledger = new RecordLedger();

    const perWorkout = [
      // First sighting: sets the bests (80 kg; 80 x 10 = 106.7) but no record.
      session('s1', day(1), [exercise('Bench', kg(80), 10)]),
      // Heavier than ever, though its e1RM (85 x 3 = 93.5) is lower: a heaviest record, against 80.
      session('s2', day(8), [exercise('Bench', kg(85), 3)]),
      // Not heavier, but 82.5 x 10 = 110 beats s1's 106.7, not s2's lower e1RM.
      session('s3', day(15), [exercise('Bench', kg(82.5), 10)]),
      // Matches the heaviest and falls short of the best e1RM: nothing.
      session('s4', day(22), [exercise('Bench', kg(85), 5)]),
      // Heavier again, measured against s2's 85.
      session('s5', day(29), [exercise('Bench', kg(90), 1)]),
    ].map((workout) => ledger.add(workout));

    expect(perWorkout).toEqual([
      [],
      [{ kind: 'heaviestWeight', key: bench, exerciseName: 'Bench', weight: kg(85), reps: 3, previous: kg(80) }],
      [
        {
          kind: 'estimatedOneRepMax',
          key: bench,
          exerciseName: 'Bench',
          oneRepMax: epley(82.5, 10),
          weight: kg(82.5),
          reps: 10,
          previous: epley(80, 10),
        },
      ],
      [],
      [{ kind: 'heaviestWeight', key: bench, exerciseName: 'Bench', weight: kg(90), reps: 1, previous: kg(85) }],
    ]);
  });

  it('keeps each movement apart, so one can set a record in a workout where another is new', () => {
    const squat = movementKeyFor(stubExerciseId('Squat'), 'WeightedExerciseBlueprint');
    const ledger = new RecordLedger();

    ledger.add(session('s1', day(1), [exercise('Squat', kg(100), 5)]));
    const records = ledger.add(session('s2', day(8), [exercise('Bench', kg(60), 8), exercise('Squat', kg(102.5), 5)]));

    expect(records).toEqual([
      { kind: 'heaviestWeight', key: squat, exerciseName: 'Squat', weight: kg(102.5), reps: 5, previous: kg(100) },
    ]);
    // Bench's first sighting still set its bests.
    expect(ledger.add(session('s3', day(15), [exercise('Bench', kg(62.5), 8)]))).toEqual([
      { kind: 'heaviestWeight', key: bench, exerciseName: 'Bench', weight: kg(62.5), reps: 8, previous: kg(60) },
    ]);
  });
});

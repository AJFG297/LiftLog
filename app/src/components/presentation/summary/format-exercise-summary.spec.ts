import { describe, expect, it, vi } from 'vitest';
import { formatExerciseSummary, formatSessionVolume } from '@/components/presentation/summary/format-exercise-summary';
import { aiPlanFromJSON } from '@/models/ai-models';
import { PotentialSet, RecordedSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import type { WorkingListKind } from '@/models/session-models/set-kind';
import { SessionBlueprint } from '@/models/blueprint-models';
import { Weight } from '@/models/weight';
import { LocalDate } from '@js-joda/core';
import { v4 as uuid } from 'uuid';
import { makeRecordedExercise, makeWeightedBlueprint, tick } from '@/models/session-models/__test__/helpers';

vi.mock('expo-localization', () => ({ getLocales: () => [{ decimalSeparator: '.' }] }));

const filled = { isFilled: true, showWeight: true, bodyweightLabel: 'BW' };

/** Every set is seeded with the plan's target, which is what building a session does. */
function exerciseOf(
  sets: { reps: number | undefined; weight: number | Weight; kind?: WorkingListKind }[],
  blueprint = makeWeightedBlueprint(),
) {
  return new RecordedWeightedExercise(
    blueprint,
    sets.map((set, index) =>
      PotentialSet.of({
        set:
          set.reps === undefined ? undefined : RecordedSet.of({ repsCompleted: set.reps, completionDateTime: tick() }),
        weight: set.weight instanceof Weight ? set.weight : new Weight(set.weight, 'kilograms'),
        target: blueprint.repsTargetForSet(index),
        kind: set.kind,
      }),
    ),
    undefined,
  );
}

function sessionOf(exercise: RecordedWeightedExercise) {
  return new Session(
    uuid(),
    new SessionBlueprint('Test', [exercise.blueprint], ''),
    [exercise],
    LocalDate.of(2025, 4, 5),
    undefined,
    undefined,
  );
}

describe('formatExerciseSummary', () => {
  it('collapses identical sets into a multiplier', () => {
    const exercise = exerciseOf([
      { reps: 12, weight: 60 },
      { reps: 12, weight: 60 },
      { reps: 12, weight: 60 },
    ]);

    expect(formatExerciseSummary(exercise, filled)).toBe('3 × 12 60kg');
  });

  it('keeps a pyramid apart, because the variation is the point of it', () => {
    const exercise = exerciseOf([
      { reps: 12, weight: 60 },
      { reps: 10, weight: 70 },
      { reps: 8, weight: 80 },
    ]);

    expect(formatExerciseSummary(exercise, filled)).toBe('12 60kg · 10 70kg · 8 80kg');
  });

  it('names the weight on every run, so a bare weight is never ambiguous', () => {
    const exercise = exerciseOf([
      { reps: 12, weight: 60 },
      { reps: 12, weight: 60 },
      { reps: 10, weight: 60 },
    ]);

    expect(formatExerciseSummary(exercise, filled)).toBe('2 × 12 60kg · 10 60kg');
  });

  it('says nothing about weight rather than claiming zero', () => {
    const exercise = exerciseOf([
      { reps: 12, weight: 0 },
      { reps: 12, weight: 0 },
    ]);

    expect(formatExerciseSummary(exercise, filled)).toBe('2 × 12');
  });

  it('adds the logged RPE after the weight, keeping differently rated sets apart', () => {
    const exercise = exerciseOf([
      { reps: 5, weight: 100 },
      { reps: 5, weight: 100 },
      { reps: 5, weight: 100 },
    ]);
    const rated = exercise.withRpe(0, 8).withRpe(1, 8).withRpe(2, 9);
    expect(formatExerciseSummary(rated, filled)).toBe('2 × 5 100kg @8 · 5 100kg @9');
  });

  it('writes a uniformly rated exercise as one run', () => {
    const exercise = exerciseOf([
      { reps: 5, weight: 100 },
      { reps: 5, weight: 100 },
      { reps: 5, weight: 100 },
    ]);
    const rated = exercise.withRpe(0, 8).withRpe(1, 8).withRpe(2, 8);
    expect(formatExerciseSummary(rated, filled)).toBe('3 × 5 100kg @8');
  });

  it('says nothing about an RPE on a set that was never logged', () => {
    const exercise = exerciseOf([
      { reps: 5, weight: 100 },
      { reps: undefined, weight: 100 },
    ]).withRpe(1, 8);
    expect(formatExerciseSummary(exercise, filled)).toBe('5 100kg');
  });

  it('ignores sets that were never completed', () => {
    const exercise = exerciseOf([
      { reps: 12, weight: 60 },
      { reps: undefined, weight: 60 },
    ]);

    expect(formatExerciseSummary(exercise, filled)).toBe('12 60kg');
  });

  it('states a plan as its shape, taking reps from the targets rather than what was recorded', () => {
    const exercise = exerciseOf([
      { reps: undefined, weight: 60 },
      { reps: undefined, weight: 60 },
    ]);

    expect(formatExerciseSummary(exercise, { isFilled: false, bodyweightLabel: 'BW', showWeight: true })).toBe(
      '2 × 10 60kg',
    );
  });

  it('states the target the sets are chasing, not the plan they were seeded from', () => {
    // What a reps rule leaves behind: the plan still says 10, the session is on 11.
    const exercise = new RecordedWeightedExercise(
      makeWeightedBlueprint(),
      [0, 1, 2].map(() => PotentialSet.of({ weight: new Weight(0, 'kilograms'), target: { min: 11, max: 11 } })),
      undefined,
    );

    expect(formatExerciseSummary(exercise, { isFilled: false, bodyweightLabel: 'BW', showWeight: true })).toBe(
      '3 × 11',
    );
  });

  it('spells out a climb that has left some sets behind', () => {
    const exercise = new RecordedWeightedExercise(
      makeWeightedBlueprint(),
      [12, 10, 10].map((reps) =>
        PotentialSet.of({ weight: new Weight(0, 'kilograms'), target: { min: reps, max: reps } }),
      ),
      undefined,
    );

    expect(formatExerciseSummary(exercise, { isFilled: false, bodyweightLabel: 'BW', showWeight: true })).toBe(
      '12/10/10',
    );
  });

  it('gives a planned exercise whose weight steps a range, rather than a set-by-set list', () => {
    const exercise = exerciseOf([
      { reps: undefined, weight: 15 },
      { reps: undefined, weight: 20 },
      { reps: undefined, weight: 15 },
    ]);

    expect(formatExerciseSummary(exercise, { isFilled: false, bodyweightLabel: 'BW', showWeight: true })).toBe(
      '3 × 10 15kg–20kg',
    );
  });

  it('gives a planned exercise whose weight steps a range with different units, rather than a set-by-set list', () => {
    const exercise = exerciseOf([
      { reps: undefined, weight: new Weight(15, 'pounds') },
      { reps: undefined, weight: 20 },
      { reps: undefined, weight: 15 },
    ]);

    expect(formatExerciseSummary(exercise, { isFilled: false, bodyweightLabel: 'BW', showWeight: true })).toBe(
      '3 × 10 15lbs–20kg',
    );
  });
});

describe('formatExerciseSummary for bodyweight exercises', () => {
  function bodyweightExerciseOf(sets: { reps: number | undefined; weight: number }[]) {
    return new RecordedWeightedExercise(
      makeWeightedBlueprint({ name: 'Pull Up', resistance: 'bodyweight' }),
      sets.map((set, index) =>
        PotentialSet.of({
          set:
            set.reps === undefined
              ? undefined
              : RecordedSet.of({ repsCompleted: set.reps, completionDateTime: tick() }),
          weight: new Weight(set.weight, 'kilograms'),
          target: makeWeightedBlueprint().repsTargetForSet(index),
        }),
      ),
      undefined,
    );
  }

  it('shows just the bodyweight label when no weight is added', () => {
    const exercise = bodyweightExerciseOf([
      { reps: 12, weight: 0 },
      { reps: 12, weight: 0 },
    ]);

    expect(formatExerciseSummary(exercise, filled)).toBe('2 × 12 BW');
  });

  it('shows added weight with a plus sign', () => {
    const exercise = bodyweightExerciseOf([{ reps: 8, weight: 10 }]);

    expect(formatExerciseSummary(exercise, filled)).toBe('8 BW +10kg');
  });

  it('shows assistance as a negative added weight', () => {
    const exercise = bodyweightExerciseOf([{ reps: 8, weight: -20 }]);

    expect(formatExerciseSummary(exercise, filled)).toBe('8 BW -20kg');
  });
});

describe('formatSessionVolume', () => {
  it('totals the weight moved', () => {
    const session = sessionOf(
      exerciseOf([
        { reps: 10, weight: 60 },
        { reps: 10, weight: 60 },
      ]),
    );

    expect(formatSessionVolume(session)).toBe('1,200kg');
  });

  it('has no total to report for a bodyweight-only session', () => {
    const session = sessionOf(exerciseOf([{ reps: 10, weight: 0 }]));

    expect(formatSessionVolume(session)).toBeUndefined();
  });
});

describe('formatExerciseSummary for exercises that track no load', () => {
  const crunch = makeWeightedBlueprint({ name: 'Crunch', sets: 3, resistance: 'none' });

  it('says nothing about weight when logged', () => {
    const exercise = makeRecordedExercise(crunch, [20, 20, 20], new Weight(999, 'kilograms'));

    expect(formatExerciseSummary(exercise, filled)).toBe('3 × 20');
  });

  it('says nothing about weight when planned', () => {
    const exercise = makeRecordedExercise(crunch, [undefined, undefined, undefined], new Weight(999, 'kilograms'));

    expect(formatExerciseSummary(exercise, { isFilled: false, bodyweightLabel: 'BW', showWeight: true })).toBe(
      '3 × 10',
    );
  });
});

describe('summaries describe working sets only', () => {
  const planned = { isFilled: false, bodyweightLabel: 'BW', showWeight: true };

  /** Three working sets at 60 kg behind a warm-up at `warmupKg`, logged or not. */
  function withWarmup(warmupKg: number, logged: boolean) {
    const working = logged ? 10 : undefined;
    return exerciseOf([
      { reps: working, weight: 60 },
      { reps: working, weight: 60 },
      { reps: working, weight: 60 },
    ]).with({
      warmupSets: [
        PotentialSet.of({
          set: logged ? RecordedSet.of({ repsCompleted: 5, completionDateTime: tick() }) : undefined,
          weight: new Weight(warmupKg, 'kilograms'),
          target: { min: 5, max: 5 },
        }),
      ],
    });
  }

  it.each([
    ['lighter', 20],
    ['heavier', 200],
  ])('leaves a logged warm-up %s than the working sets out of the line', (_, warmupKg) => {
    expect(formatExerciseSummary(withWarmup(warmupKg, true), filled)).toBe('3 × 10 60kg');
  });

  it('leaves planned warm-ups out of the plan’s shape and weight', () => {
    expect(formatExerciseSummary(withWarmup(20, false), planned)).toBe('3 × 10 60kg');
  });

  it('leaves warm-ups out of the session volume', () => {
    expect(formatSessionVolume(sessionOf(withWarmup(200, true)))).toBe('1,800kg');
  });
});

describe('summaries letter sets that are not working sets', () => {
  const planned = { isFilled: false, bodyweightLabel: 'BW', showWeight: false };

  /** Sets at their own rep targets, logged or not. */
  function kindsOf(sets: { reps: number; weight: number; kind: WorkingListKind }[], logged: boolean) {
    return new RecordedWeightedExercise(
      makeWeightedBlueprint(),
      sets.map((set) =>
        PotentialSet.of({
          set: logged ? RecordedSet.of({ repsCompleted: set.reps, completionDateTime: tick() }) : undefined,
          weight: new Weight(set.weight, 'kilograms'),
          target: { min: set.reps, max: set.reps },
          kind: set.kind,
        }),
      ),
      undefined,
    );
  }

  const benchPress = [
    { reps: 5, weight: 100, kind: 'working' },
    { reps: 5, weight: 100, kind: 'working' },
    { reps: 5, weight: 100, kind: 'failure' },
    { reps: 12, weight: 40, kind: 'drop' },
    { reps: 15, weight: 40, kind: 'myo' },
  ] as const;

  it('spells out a plan with its letters', () => {
    expect(formatExerciseSummary(kindsOf([...benchPress], false), planned)).toBe('5/5/F\u00A05/D\u00A012/M\u00A015');
  });

  it('previews a plan the AI planner is still streaming, whose last kind is cut off', () => {
    // Untyped, as the stream is: the backend closes the string it stopped in.
    const plannedSets = [
      { reps: { min: 5, max: 5 }, kind: 'working' },
      { reps: { min: 12, max: 12 }, kind: 'dr' },
    ];
    const plan = aiPlanFromJSON({
      version: 4,
      name: 'PPL',
      blueprint: {
        sessions: [
          {
            name: 'Push',
            exercises: [
              {
                type: 'WeightedExerciseBlueprint',
                name: 'Bench Press',
                plannedSets,
              },
            ],
          },
        ],
      },
    });
    const session = Session.getEmptySession(plan.blueprint.sessions[0]!, 'kilograms');

    expect(formatExerciseSummary(session.recordedExercises[0]!, planned)).toBe('5/12');
  });

  it('spells out a plan whose sets share a target but not a kind', () => {
    const exercise = exerciseOf([
      { reps: undefined, weight: 60 },
      { reps: undefined, weight: 60 },
      { reps: undefined, weight: 60, kind: 'drop' },
    ]);

    expect(formatExerciseSummary(exercise, { ...planned, showWeight: true })).toBe('10/10/D\u00A010 60kg');
  });

  it('keeps a logged set that is not a working set out of the working sets’ run', () => {
    expect(formatExerciseSummary(kindsOf([...benchPress], true), filled)).toBe(
      '2 × 5 100kg · F\u00A05 100kg · D\u00A012 40kg · M\u00A015 40kg',
    );
  });

  it('collapses repeated sets of the same kind, letter and all', () => {
    const exercise = kindsOf(
      [
        { reps: 8, weight: 60, kind: 'working' },
        { reps: 12, weight: 40, kind: 'drop' },
        { reps: 12, weight: 40, kind: 'drop' },
      ],
      true,
    );

    expect(formatExerciseSummary(exercise, filled)).toBe('8 60kg · 2 × D\u00A012 40kg');
  });
});

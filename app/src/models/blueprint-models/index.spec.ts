import { describe, expect, it } from 'vitest';
import BigNumber from 'bignumber.js';
import { Duration } from '@js-joda/core';
import {
  CardioExerciseBlueprint,
  CardioExerciseSetBlueprint,
  ProgramBlueprint,
  ProgressionRule,
  SessionBlueprint,
  normalizeExerciseName,
  progressionEquals,
  WeightedExerciseBlueprintInit,
  WeightedExerciseBlueprint,
  cardioTargetEquals,
  formatPlannedSets,
  uniformWorkingTarget,
} from '@/models/blueprint-models';
import { RecordedWeightedExercise } from '@/models/session-models';
import { LocalDate } from '@js-joda/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bn(n: number) {
  return new BigNumber(n);
}

describe('blueprint models', () => {
  // ---------------------------------------------------------------------------
  // ProgressionRule
  // ---------------------------------------------------------------------------

  describe('ProgressionRule', () => {
    it('round-trips through JSON', () => {
      const rule = ProgressionRule.of({
        axis: 'reps',
        step: bn(1),
        scope: { type: 'lowestSets', pick: 'middle' },
        ceiling: bn(12),
        onCeiling: 'reset',
      });

      expect(ProgressionRule.fromJSON(rule.toJSON()).equals(rule)).toBe(true);
    });

    it('leaves an absent ceiling absent rather than writing null', () => {
      const json = ProgressionRule.load(bn(2.5)).toJSON();

      expect(json).not.toHaveProperty('ceiling');
      expect(json).not.toHaveProperty('onCeiling');
      expect(ProgressionRule.fromJSON(json).ceiling).toBeUndefined();
    });

    it('compares every field', () => {
      const rule = ProgressionRule.load(bn(2.5));

      expect(rule.equals(ProgressionRule.load(bn(2.5)))).toBe(true);
      expect(rule.equals(rule.with({ step: bn(5) }))).toBe(false);
      expect(rule.equals(rule.with({ axis: 'reps' }))).toBe(false);
      expect(rule.equals(rule.with({ scope: { type: 'lowestSets', pick: 'all' } }))).toBe(false);
      expect(rule.equals(rule.with({ ceiling: bn(12) }))).toBe(false);
      expect(rule.equals(undefined)).toBe(false);
    });

    it('tells a set ceiling from an absent one in both directions', () => {
      const capped = ProgressionRule.load(bn(2.5)).with({ ceiling: bn(12) });
      const uncapped = ProgressionRule.load(bn(2.5));

      expect(capped.equals(uncapped)).toBe(false);
      expect(uncapped.equals(capped)).toBe(false);
    });

    it('clears a ceiling when the field is passed as undefined', () => {
      const capped = ProgressionRule.load(bn(2.5)).with({ ceiling: bn(12) });

      expect(capped.with({ ceiling: undefined }).ceiling).toBeUndefined();
    });

    it('compares lists by order', () => {
      const load = ProgressionRule.load(bn(2.5));
      const reps = ProgressionRule.of({ axis: 'reps', step: bn(1) });

      expect(progressionEquals([load, reps], [load, reps])).toBe(true);
      expect(progressionEquals([load, reps], [reps, load])).toBe(false);
      expect(progressionEquals([load], [])).toBe(false);
      expect(progressionEquals([], [])).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // cardioTargetEquals
  // ---------------------------------------------------------------------------

  describe('cardioTargetEquals', () => {
    it('two equal time targets are equal', () => {
      expect(
        cardioTargetEquals(
          { type: 'time', value: Duration.ofMinutes(30) },
          { type: 'time', value: Duration.ofMinutes(30) },
        ),
      ).toBe(true);
    });

    it('different time durations are not equal', () => {
      expect(
        cardioTargetEquals(
          { type: 'time', value: Duration.ofMinutes(20) },
          { type: 'time', value: Duration.ofMinutes(30) },
        ),
      ).toBe(false);
    });

    it('two equal distance targets are equal', () => {
      expect(
        cardioTargetEquals(
          { type: 'distance', value: { value: bn(5), unit: 'kilometre' } },
          { type: 'distance', value: { value: bn(5), unit: 'kilometre' } },
        ),
      ).toBe(true);
    });

    it('same distance value but different units are not equal', () => {
      expect(
        cardioTargetEquals(
          { type: 'distance', value: { value: bn(5), unit: 'kilometre' } },
          { type: 'distance', value: { value: bn(5), unit: 'mile' } },
        ),
      ).toBe(false);
    });

    it('different types are not equal', () => {
      expect(
        cardioTargetEquals(
          { type: 'time', value: Duration.ofMinutes(30) },
          { type: 'distance', value: { value: bn(5), unit: 'kilometre' } },
        ),
      ).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // progressionKey
  // ---------------------------------------------------------------------------

  describe('progressionKey', () => {
    it('keys a weighted exercise on the exercise alone', () => {
      const blueprint = WeightedExerciseBlueprint.empty().with({
        name: 'Squat',
        exerciseId: 'Squat',
        sets: 4,
        repsConfig: { type: 'fixed', reps: 8 },
      });
      expect(blueprint.progressionKey()).toBe('Squat_WeightedExerciseBlueprint');
    });

    it('two weighted blueprints of one exercise with different set counts share a key', () => {
      const a = WeightedExerciseBlueprint.empty().with({
        name: 'Press',
        sets: 3,
        repsConfig: { type: 'fixed', reps: 10 },
      });
      const b = a.with({ sets: 5 });
      expect(a.progressionKey()).toBe(b.progressionKey());
    });

    it('cardio exercise key encodes the target type of the first set', () => {
      const blueprint = CardioExerciseBlueprint.empty();
      // default first set target is 'time'
      expect(blueprint.progressionKey()).toContain('time');
    });

    it('cardio exercise key encodes distance when first set has a distance target', () => {
      const set = CardioExerciseSetBlueprint.empty().with({
        target: {
          type: 'distance',
          value: { value: bn(5), unit: 'kilometre' },
        },
      });
      const blueprint = new CardioExerciseBlueprint('Run', [set], '', '');
      expect(blueprint.progressionKey()).toContain('distance');
    });
  });

  // ---------------------------------------------------------------------------
  // progressionKey - frozen table
  // ---------------------------------------------------------------------------

  describe('progressionKey - exact strings', () => {
    const cases: [label: string, init: WeightedExerciseBlueprintInit][] = [
      ['fixed', { sets: 3, repsConfig: { type: 'fixed', reps: 5 } }],
      ['range', { sets: 4, repsConfig: { type: 'range', min: 8, max: 12 } }],
      [
        'non-uniform perSet',
        {
          sets: 3,
          repsConfig: {
            type: 'perSet',
            targets: [
              { min: 12, max: 12 },
              { min: 10, max: 10 },
              { min: 8, max: 8 },
            ],
          },
        },
      ],
      ['no load', { sets: 3, resistance: 'none' }],
      [
        'a rule that moves reps',
        {
          sets: 3,
          progression: [
            ProgressionRule.of({ axis: 'reps', step: bn(1), ceiling: bn(12), onCeiling: 'reset' }),
            ProgressionRule.load(bn(2.5)),
          ],
        },
      ],
      ['only a load rule', { sets: 3, progression: [ProgressionRule.load(bn(2.5))] }],
      ['warm-ups planned', { sets: 3, warmupSets: [{ load: { type: 'percent', percent: 50 }, reps: 5 }] }],
      [
        'a drop set planned',
        {
          plannedSets: [
            { reps: { min: 8, max: 8 }, kind: 'working' },
            { reps: { min: 12, max: 12 }, kind: 'drop' },
          ],
        },
      ],
    ];

    it.each(cases)('%s', (_label, init) => {
      expect(WeightedExerciseBlueprint.of({ name: 'Squat', exerciseId: 'Squat', ...init }).progressionKey()).toBe(
        'Squat_WeightedExerciseBlueprint',
      );
    });
  });

  describe('repsAreProgressed', () => {
    const squat = (init = {}) => WeightedExerciseBlueprint.of({ name: 'Squat', sets: 3, ...init });

    it.each([
      ['no load to advance on', { resistance: 'none' as const }, true],
      ['a rule that moves reps', { progression: [ProgressionRule.of({ axis: 'reps', step: bn(1) })] }, true],
      [
        'a ladder that reaches reps',
        {
          progression: [ProgressionRule.of({ axis: 'reps', step: bn(1) }), ProgressionRule.load(bn(2.5))],
        },
        true,
      ],
      ['only a load rule', { progression: [ProgressionRule.load(bn(2.5))] }, false],
      ['no rules at all', {}, false],
    ])('%s', (_label, init, expected) => {
      expect(squat(init).repsAreProgressed).toBe(expected);
    });
  });

  // ---------------------------------------------------------------------------
  // movementKey vs progressionKey
  // ---------------------------------------------------------------------------

  describe('movementKey vs progressionKey', () => {
    const fiveByFive = WeightedExerciseBlueprint.empty().with({
      name: 'Squats',
      sets: 5,
      repsConfig: { type: 'fixed', reps: 5 },
    });
    const threeByEight = fiveByFive.with({ sets: 3, repsConfig: { type: 'fixed', reps: 8 } });

    it('the same movement under two rep schemes is one movement and one progression', () => {
      expect(fiveByFive.movementKey()).toBe(threeByEight.movementKey());
      expect(fiveByFive.progressionKey()).toBe(threeByEight.progressionKey());
    });

    it('an unlinked name spelled differently is the same exercise, so one movement and one progression', () => {
      // Letter case and plurals used to split the progression; the stub id folds them like the movement did.
      const singular = fiveByFive.with({ name: 'squat' });
      expect(singular.exerciseId).toBe(fiveByFive.exerciseId);
      expect(singular.movementKey()).toBe(fiveByFive.movementKey());
      expect(singular.progressionKey()).toBe(fiveByFive.progressionKey());
    });

    it('a linked exercise keeps both keys when it is renamed', () => {
      const linked = fiveByFive.with({ exerciseId: 'a-user-exercise' });
      const renamed = linked.with({ name: 'Back Squat' });
      expect(renamed.exerciseId).toBe('a-user-exercise');
      expect(renamed.movementKey()).toBe(linked.movementKey());
      expect(renamed.progressionKey()).toBe(linked.progressionKey());
    });

    it('two exercises of the same name are different movements once linked apart', () => {
      const other = fiveByFive.with({ exerciseId: 'another-exercise' });
      expect(other.movementKey()).not.toBe(fiveByFive.movementKey());
      expect(other.progressionKey()).not.toBe(fiveByFive.progressionKey());
    });

    it('a recorded exercise keys the same as the blueprint it was built from', () => {
      const recorded = RecordedWeightedExercise.empty(fiveByFive, 'kilograms');
      expect(recorded.movementKey()).toBe(fiveByFive.movementKey());
      expect(recorded.progressionKey()).toBe(fiveByFive.progressionKey());
    });

    it('a weighted and a cardio exercise of the same name are different movements', () => {
      const rowMachine = new CardioExerciseBlueprint('Row', [CardioExerciseSetBlueprint.empty()], '', '');
      const barbellRow = fiveByFive.with({ name: 'Row' });

      expect(barbellRow.movementKey()).not.toBe(rowMachine.movementKey());
      expect(barbellRow.progressionKey()).not.toBe(rowMachine.progressionKey());
      expect(normalizeExerciseName(barbellRow.name)).toBe(normalizeExerciseName(rowMachine.name));
    });
  });
});

describe('WeightedExerciseBlueprint rep schemes', () => {
  const fixed = WeightedExerciseBlueprint.empty().with({ sets: 3, repsConfig: { type: 'fixed', reps: 10 } });
  const range = fixed.with({ repsConfig: { type: 'range', min: 10, max: 12 } });
  const pyramid = fixed.with({
    repsConfig: {
      type: 'perSet',
      targets: [
        { min: 12, max: 12 },
        { min: 10, max: 10 },
        { min: 8, max: 8 },
      ],
    },
  });

  it('resolves a fixed target to min === max', () => {
    expect(fixed.repsTargetForSet(0)).toEqual({ min: 10, max: 10 });
  });

  it('resolves a uniform range for every set', () => {
    expect(range.repsTargetForSet(0)).toEqual({ min: 10, max: 12 });
    expect(range.repsTargetForSet(2)).toEqual({ min: 10, max: 12 });
  });

  it('resolves per-set targets for a pyramid', () => {
    expect(pyramid.repsTargetForSet(0)).toEqual({ min: 12, max: 12 });
    expect(pyramid.repsTargetForSet(2)).toEqual({ min: 8, max: 8 });
  });

  it('falls back to the last target when the index runs past a short pyramid', () => {
    expect(pyramid.repsTargetForSet(5)).toEqual({ min: 8, max: 8 });
  });

  it('round-trips ranges and pyramids through JSON', () => {
    expect(WeightedExerciseBlueprint.fromJSON(range.toJSON()).equals(range)).toBe(true);
    expect(WeightedExerciseBlueprint.fromJSON(pyramid.toJSON()).equals(pyramid)).toBe(true);
  });

  describe('with', () => {
    const targets = (b: WeightedExerciseBlueprint) => b.plannedSets.map((s) => s.reps);

    it('spreads a fixed config across the current set count', () => {
      expect(targets(fixed.with({ repsConfig: { type: 'fixed', reps: 8 } }))).toEqual(
        Array.from({ length: 3 }, () => ({ min: 8, max: 8 })),
      );
    });

    it('spreads a range across every set', () => {
      expect(targets(fixed.with({ repsConfig: { type: 'range', min: 8, max: 12 } }))).toEqual(
        Array.from({ length: 3 }, () => ({ min: 8, max: 12 })),
      );
    });

    it('resizes to a new set count while keeping the existing targets', () => {
      expect(targets(pyramid.with({ sets: 5 }))).toEqual([
        { min: 12, max: 12 },
        { min: 10, max: 10 },
        { min: 8, max: 8 },
        { min: 8, max: 8 },
        { min: 8, max: 8 },
      ]);
    });

    it('applies a set count and a rep layout together', () => {
      expect(targets(pyramid.with({ sets: 2, repsConfig: { type: 'fixed', reps: 6 } }))).toEqual([
        { min: 6, max: 6 },
        { min: 6, max: 6 },
      ]);
    });

    it('leaves the original unchanged', () => {
      const updated = fixed.with({ repsConfig: { type: 'range', min: 8, max: 12 } });
      expect(updated).not.toBe(fixed);
      expect(targets(fixed)).toEqual(Array.from({ length: 3 }, () => ({ min: 10, max: 10 })));
    });
  });

  describe('withSets', () => {
    it('grows by repeating the last target', () => {
      expect(pyramid.withSets(5).plannedSets.map((s) => s.reps)).toEqual([
        { min: 12, max: 12 },
        { min: 10, max: 10 },
        { min: 8, max: 8 },
        { min: 8, max: 8 },
        { min: 8, max: 8 },
      ]);
    });

    it('shrinks by truncating', () => {
      expect(pyramid.withSets(2).plannedSets.map((s) => s.reps)).toEqual([
        { min: 12, max: 12 },
        { min: 10, max: 10 },
      ]);
    });

    it('leaves the list untouched when the count is unchanged', () => {
      expect(pyramid.withSets(3).plannedSets).toEqual(pyramid.plannedSets);
    });

    it('returns a new blueprint instance leaving the original unchanged', () => {
      expect(pyramid.withSets(5)).not.toBe(pyramid);
      expect(pyramid.plannedSets).toHaveLength(3);
    });

    it('clamps to a minimum of 1 set', () => {
      expect(fixed.withSets(0).plannedSets).toHaveLength(1);
      expect(fixed.withSets(-5).plannedSets).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // SessionBlueprint
  // ---------------------------------------------------------------------------

  describe('SessionBlueprint', () => {
    const squat = WeightedExerciseBlueprint.empty().with({ name: 'Squat' });
    const bench = WeightedExerciseBlueprint.empty().with({ name: 'Bench' });
    const session = new SessionBlueprint('Workout A', [squat, bench], '');
    const names = (s: SessionBlueprint) => s.exercises.map((x) => x.name);

    it('adds an exercise to the end', () => {
      const deadlift = WeightedExerciseBlueprint.empty().with({ name: 'Deadlift' });
      expect(names(session.withAddedExercise(deadlift))).toEqual(['Squat', 'Bench', 'Deadlift']);
      expect(names(session)).toEqual(['Squat', 'Bench']);
    });

    it('removes an exercise by value', () => {
      expect(names(session.withoutExercise(WeightedExerciseBlueprint.empty().with({ name: 'Squat' })))).toEqual([
        'Bench',
      ]);
    });

    it('replaces the exercise at an index', () => {
      const press = WeightedExerciseBlueprint.empty().with({ name: 'Overhead Press' });
      expect(names(session.withExercise(1, press))).toEqual(['Squat', 'Overhead Press']);
    });

    it('leaves the session alone for an index that is out of range', () => {
      const press = WeightedExerciseBlueprint.empty().with({ name: 'Overhead Press' });
      expect(session.withExercise(5, press)).toBe(session);
      expect(session.withExercise(-1, press)).toBe(session);
    });

    it('moves an exercise up and down', () => {
      expect(names(session.withExerciseMovedDown(squat))).toEqual(['Bench', 'Squat']);
      expect(names(session.withExerciseMovedUp(bench))).toEqual(['Bench', 'Squat']);
    });

    it('leaves the session alone when the move would fall off either end', () => {
      expect(session.withExerciseMovedUp(squat)).toBe(session);
      expect(session.withExerciseMovedDown(bench)).toBe(session);
    });

    it('leaves the session alone when the exercise is not in it', () => {
      const missing = WeightedExerciseBlueprint.empty().with({ name: 'Nowhere' });
      expect(session.withExerciseMovedUp(missing)).toBe(session);
      expect(session.withExerciseMovedDown(missing)).toBe(session);
    });
  });

  // ---------------------------------------------------------------------------
  // ProgramBlueprint
  // ---------------------------------------------------------------------------

  describe('ProgramBlueprint', () => {
    const workoutA = new SessionBlueprint('Workout A', [], '');
    const workoutB = new SessionBlueprint('Workout B', [], '');
    const program = new ProgramBlueprint('Plan', [workoutA, workoutB], LocalDate.of(2026, 8, 6));
    const names = (p: ProgramBlueprint) => p.sessions.map((x) => x.name);

    it('updates the workout at an index, leaving the others alone', () => {
      const updated = program.withSession(1, (session) => session.withName('Leg Day'));

      expect(names(updated)).toEqual(['Workout A', 'Leg Day']);
      expect(names(program)).toEqual(['Workout A', 'Workout B']);
    });

    it('leaves the plan alone when the workout index does not exist', () => {
      expect(program.withSession(7, (session) => session.withName('Nowhere'))).toBe(program);
      expect(program.withSession(-1, (session) => session.withName('Nowhere'))).toBe(program);
    });

    it('adds and removes workouts', () => {
      const workoutC = new SessionBlueprint('Workout C', [], '');

      expect(names(program.withAddedSession(workoutC))).toEqual(['Workout A', 'Workout B', 'Workout C']);
      expect(names(program.withoutSession(new SessionBlueprint('Workout A', [], '')))).toEqual(['Workout B']);
    });

    it('moves a workout up and down', () => {
      expect(names(program.withSessionMovedDown(workoutA))).toEqual(['Workout B', 'Workout A']);
      expect(names(program.withSessionMovedUp(workoutB))).toEqual(['Workout B', 'Workout A']);
      expect(program.withSessionMovedUp(workoutA)).toBe(program);
      expect(program.withSessionMovedDown(workoutB)).toBe(program);
    });
  });
});

describe('uniformWorkingTarget', () => {
  const ten = { min: 10, max: 10 };

  it('is the shared target of a list of working sets', () => {
    expect(
      uniformWorkingTarget([
        { reps: { min: 8, max: 12 }, kind: 'working' },
        { reps: { min: 8, max: 12 }, kind: 'working' },
      ]),
    ).toEqual({ min: 8, max: 12 });
  });

  it('is undefined when the targets differ, or when any set is another kind', () => {
    expect(
      uniformWorkingTarget([
        { reps: ten, kind: 'working' },
        { reps: { min: 8, max: 8 }, kind: 'working' },
      ]),
    ).toBeUndefined();
    expect(
      uniformWorkingTarget([
        { reps: ten, kind: 'working' },
        { reps: ten, kind: 'failure' },
      ]),
    ).toBeUndefined();
  });
});

describe('formatPlannedSets', () => {
  const ten = { min: 10, max: 10 };

  it('writes one target when every set is a working set with the same target', () => {
    expect(
      formatPlannedSets([
        { reps: ten, kind: 'working' },
        { reps: ten, kind: 'working' },
      ]),
    ).toBe('10');
  });

  it('letters sets that are not working sets, with the separator the caller asks for', () => {
    expect(
      formatPlannedSets(
        [
          { reps: ten, kind: 'working' },
          { reps: ten, kind: 'failure' },
          { reps: { min: 12, max: 15 }, kind: 'drop' },
        ],
        ' / ',
      ),
    ).toBe('10 / F\u00A010 / D\u00A012-15');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { Weight } from '@/models/weight';
import {
  PotentialSet,
  RecordedSet,
  RecordedWeightedExercise,
} from '@/models/session-models/recorded-weighted-exercise';
import {
  emptyPotentialSet,
  filledPotentialSet,
  makeRecordedExercise,
  makeWeightedBlueprint,
  tick,
} from '@/models/session-models/__test__/helpers';
import { IndexOutOfBoundsError } from '@/utils/index-out-of-bounds';
import { RPE_VALUES } from '@/models/session-models/rpe';
import fc from 'fast-check';

describe('RecordedWeightedExercise.withWeight', () => {
  let exercise: RecordedWeightedExercise;
  const light = new Weight(60, 'kilograms');
  const heavy = new Weight(120, 'kilograms');

  beforeEach(() => {
    const t = tick();
    exercise = new RecordedWeightedExercise(
      makeWeightedBlueprint(),
      [
        filledPotentialSet(10, t), // set 0 – completed
        emptyPotentialSet(light), // set 1 – uncompleted
        emptyPotentialSet(light), // set 2 – uncompleted
      ],
      undefined,
    );
  });

  it('thisSet only changes the targeted set', () => {
    const result = exercise.withWeight(1, heavy, 'thisSet');
    expect(result.potentialSets[0]!.weight).toEqual(exercise.potentialSets[0]!.weight);
    expect(result.potentialSets[1]!.weight).toEqual(heavy);
    expect(result.potentialSets[2]!.weight).toEqual(light);
  });

  it('uncompletedSets leaves completed sets alone', () => {
    const originalCompletedWeight = exercise.potentialSets[0]!.weight;
    const result = exercise.withWeight(1, heavy, 'uncompletedSets');
    expect(result.potentialSets[0]!.weight).toEqual(originalCompletedWeight);
    expect(result.potentialSets[1]!.weight).toEqual(heavy);
    expect(result.potentialSets[2]!.weight).toEqual(heavy);
  });

  it('allSets updates every set including completed ones', () => {
    const result = exercise.withWeight(0, heavy, 'allSets');
    expect(result.potentialSets.every((s) => s.weight.equals(heavy))).toBe(true);
  });
});

// ─── withNothingCompleted ─────────────────────────────────────────────────────

describe('RecordedWeightedExercise.withNothingCompleted', () => {
  it('clears all recorded sets and notes', () => {
    const bp = makeWeightedBlueprint();
    const t = tick();
    const exercise = new RecordedWeightedExercise(
      bp,
      [filledPotentialSet(10, t), filledPotentialSet(10, t.plusSeconds(30))],
      'some note',
    );

    const result = exercise.withNothingCompleted();

    expect(result.potentialSets.every((s) => s.set === undefined)).toBe(true);
    expect(result.notes).toBeUndefined();
  });

  it('preserves weights after clearing', () => {
    const bp = makeWeightedBlueprint();
    const t = tick();
    const weight = new Weight(80, 'kilograms');
    const exercise = new RecordedWeightedExercise(bp, [filledPotentialSet(10, t, weight)], undefined);

    const result = exercise.withNothingCompleted();
    expect(result.potentialSets[0]!.weight).toEqual(weight);
  });
});

// ─── getSet ───────────────────────────────────────────────────────────────────

describe('RecordedWeightedExercise.getSet', () => {
  it('returns the set at the index', () => {
    const set = emptyPotentialSet(60);
    const exercise = new RecordedWeightedExercise(makeWeightedBlueprint(), [set], undefined);
    expect(exercise.getSet(0)).toBe(set);
  });

  it('throws when the index is out of bounds', () => {
    const exercise = new RecordedWeightedExercise(makeWeightedBlueprint(), [], undefined);
    expect(() => exercise.getSet(0)).toThrow(IndexOutOfBoundsError);
  });
});

// ─── withRepCount ─────────────────────────────────────────────────────────────

describe('RecordedWeightedExercise.withRepCount', () => {
  it('records a set with the given reps', () => {
    const t = tick();
    const exercise = new RecordedWeightedExercise(makeWeightedBlueprint(), [emptyPotentialSet(60)], undefined);

    const result = exercise.withRepCount(0, 8, t);

    expect(result.potentialSets[0]!.set).toEqual(RecordedSet.of({ repsCompleted: 8, completionDateTime: t }));
  });

  it('clears the set when reps is undefined', () => {
    const t = tick();
    const exercise = new RecordedWeightedExercise(makeWeightedBlueprint(), [filledPotentialSet(10, t)], undefined);

    const result = exercise.withRepCount(0, undefined, t);

    expect(result.potentialSets[0]!.set).toBeUndefined();
  });
});

// ─── equals ───────────────────────────────────────────────────────────────────

describe('RecordedWeightedExercise.equals', () => {
  const t = tick();
  const base = () => new RecordedWeightedExercise(makeWeightedBlueprint(), [filledPotentialSet(10, t)], 'note');

  it('is false against undefined', () => {
    expect(base().equals(undefined)).toBe(false);
  });

  it('is true against itself', () => {
    const e = base();
    expect(e.equals(e)).toBe(true);
  });

  it('is true for a structurally equal exercise', () => {
    expect(base().equals(base())).toBe(true);
  });

  it('is false when notes differ', () => {
    expect(base().equals(base().with({ notes: 'other' }))).toBe(false);
  });

  it('is false when the number of sets differs', () => {
    expect(base().equals(base().with({ potentialSets: [] }))).toBe(false);
  });
});

// ─── derived properties ───────────────────────────────────────────────────────

describe('RecordedWeightedExercise derived values', () => {
  it('currentSetIndex points at the first uncompleted set', () => {
    const t = tick();
    const exercise = new RecordedWeightedExercise(
      makeWeightedBlueprint(),
      [filledPotentialSet(10, t), emptyPotentialSet(60)],
      undefined,
    );
    expect(exercise.currentSetIndex).toBe(1);
  });

  it('totalWeightLifted sums weight times reps completed', () => {
    const t = tick();
    const exercise = new RecordedWeightedExercise(
      makeWeightedBlueprint(),
      [
        filledPotentialSet(5, t, new Weight(100, 'kilograms')),
        filledPotentialSet(3, t, new Weight(50, 'kilograms')),
        emptyPotentialSet(50),
      ],
      undefined,
    );
    expect(exercise.totalWeightLifted).toEqual(new Weight(650, 'kilograms'));
  });

  it('duration spans the earliest to latest completion time', () => {
    const first = tick();
    const last = first.plusSeconds(90);
    const exercise = new RecordedWeightedExercise(
      makeWeightedBlueprint(),
      [filledPotentialSet(10, last), filledPotentialSet(10, first)],
      undefined,
    );
    expect(exercise.earliestTime).toEqual(first);
    expect(exercise.latestTime).toEqual(last);
    expect(exercise.duration!.seconds()).toBe(90);
  });

  it('duration is undefined when nothing is recorded', () => {
    const exercise = RecordedWeightedExercise.empty(makeWeightedBlueprint(), 'kilograms');
    expect(exercise.duration).toBeUndefined();
  });

  it('isSuccessForProgressiveOverload requires every set to hit the target reps', () => {
    const t = tick();
    const success = new RecordedWeightedExercise(
      makeWeightedBlueprint(),
      [filledPotentialSet(10, t), filledPotentialSet(11, t)],
      undefined,
    );
    const failure = success.withRepCount(1, 9, t);
    expect(success.isSuccessForProgressiveOverload).toBe(true);
    expect(failure.isSuccessForProgressiveOverload).toBe(false);
  });
});

// ─── bodyweight fold-in ────────────────────────────────────────────────────────

describe('RecordedWeightedExercise bodyweight fold-in', () => {
  const bodyweight = new Weight(80, 'kilograms');

  function bodyweightExercise(addedKg: number, reps = 5) {
    return new RecordedWeightedExercise(
      makeWeightedBlueprint({ name: 'Pull Up', resistance: 'bodyweight' }),
      [filledPotentialSet(reps, tick(), new Weight(addedKg, 'kilograms'))],
      undefined,
    );
  }

  it('effectiveWeight adds the bodyweight to the stored added load', () => {
    const ex = bodyweightExercise(10);
    expect(ex.effectiveWeight(ex.potentialSets[0]!, bodyweight)).toEqual(new Weight(90, 'kilograms'));
  });

  it('effectiveWeight subtracts assistance from the bodyweight', () => {
    const ex = bodyweightExercise(-20);
    expect(ex.effectiveWeight(ex.potentialSets[0]!, bodyweight)).toEqual(new Weight(60, 'kilograms'));
  });

  it('effectiveWeight falls back to only the added weight when bodyweight is unknown', () => {
    const ex = bodyweightExercise(10);
    expect(ex.effectiveWeight(ex.potentialSets[0]!, undefined)).toEqual(new Weight(10, 'kilograms'));
  });

  it('effectiveWeight ignores the bodyweight for a plain weighted exercise', () => {
    const ex = new RecordedWeightedExercise(
      makeWeightedBlueprint({ name: 'Row' }),
      [filledPotentialSet(5, tick(), new Weight(10, 'kilograms'))],
      undefined,
    );
    expect(ex.effectiveWeight(ex.potentialSets[0]!, bodyweight)).toEqual(new Weight(10, 'kilograms'));
  });

  it('totalWeightLiftedWith folds the bodyweight into every set', () => {
    const ex = bodyweightExercise(10, 5); // (80 + 10) × 5
    expect(ex.totalWeightLiftedWith(bodyweight)).toEqual(new Weight(450, 'kilograms'));
  });

  it('maxWeightWith reports the heaviest effective load', () => {
    const ex = bodyweightExercise(10);
    expect(ex.maxWeightWith(bodyweight)).toEqual(new Weight(90, 'kilograms'));
  });

  it('the zero-arg totalWeightLifted counts only the added weight', () => {
    const ex = bodyweightExercise(10, 5); // 10 × 5, no bodyweight folded in
    expect(ex.totalWeightLifted).toEqual(new Weight(50, 'kilograms'));
  });
});

// ─── rep schemes: ranges & pyramids ───────────────────────────────────────────

describe('RecordedWeightedExercise.withCycledRepCount', () => {
  it('fills an empty set to the top of a rep range', () => {
    const bp = makeWeightedBlueprint().with({ repsConfig: { type: 'range', min: 10, max: 12 } });
    const result = RecordedWeightedExercise.empty(bp, 'kilograms').withCycledRepCount(0, tick());
    expect(result.getSet(0).set?.repsCompleted).toBe(12);
  });

  it('fills each set to its own target for a pyramid', () => {
    const bp = makeWeightedBlueprint().with({
      sets: 3,
      repsConfig: {
        type: 'perSet',
        targets: [
          { min: 12, max: 12 },
          { min: 10, max: 10 },
          { min: 8, max: 8 },
        ],
      },
    });
    const exercise = RecordedWeightedExercise.empty(bp, 'kilograms');
    expect(exercise.withCycledRepCount(0, tick()).getSet(0).set?.repsCompleted).toBe(12);
    expect(exercise.withCycledRepCount(2, tick()).getSet(2).set?.repsCompleted).toBe(8);
  });

  it('decrements from the top on repeated taps', () => {
    const bp = makeWeightedBlueprint().with({ repsConfig: { type: 'range', min: 10, max: 12 } });
    const once = RecordedWeightedExercise.empty(bp, 'kilograms').withCycledRepCount(0, tick());
    expect(once.withCycledRepCount(0, tick()).getSet(0).set?.repsCompleted).toBe(11);
  });
});

describe('RecordedWeightedExercise.isSuccessForProgressiveOverload with rep schemes', () => {
  it('requires the top of the range on every set', () => {
    const bp = makeWeightedBlueprint().with({ sets: 2, repsConfig: { type: 'range', min: 10, max: 12 } });
    const topOnAll = makeRecordedExercise(bp, [12, 12]);
    const oneShort = makeRecordedExercise(bp, [12, 11]);
    expect(topOnAll.isSuccessForProgressiveOverload).toBe(true);
    expect(oneShort.isSuccessForProgressiveOverload).toBe(false);
  });

  it("uses each set's own target for a pyramid", () => {
    const bp = makeWeightedBlueprint().with({
      sets: 3,
      repsConfig: {
        type: 'perSet',
        targets: [
          { min: 12, max: 12 },
          { min: 10, max: 10 },
          { min: 8, max: 8 },
        ],
      },
    });
    const t = tick();
    const hit = makeRecordedExercise(bp, [12, 10, 8]);
    const miss = hit.withRepCount(2, 7, t);
    expect(hit.isSuccessForProgressiveOverload).toBe(true);
    expect(miss.isSuccessForProgressiveOverload).toBe(false);
  });
});

// ─── JSON round-trips ─────────────────────────────────────────────────────────

describe('RecordedWeightedExercise JSON', () => {
  it('round-trips through toJSON/fromJSON', () => {
    const t = tick();
    const exercise = new RecordedWeightedExercise(
      makeWeightedBlueprint(),
      [filledPotentialSet(10, t), emptyPotentialSet(60)],
      'a note',
    );

    const restored = RecordedWeightedExercise.fromJSON(exercise.toJSON());

    expect(restored.equals(exercise)).toBe(true);
  });

  it('RecordedSet round-trips and compares by value', () => {
    const t = tick();
    const set = RecordedSet.of({ repsCompleted: 7, completionDateTime: t });
    const restored = RecordedSet.fromJSON(set.toJSON());
    expect(restored.equals(set)).toBe(true);
    expect(set.equals(undefined)).toBe(false);
    expect(set.equals(set)).toBe(true);
    expect(set.equals(RecordedSet.of({ repsCompleted: 8, completionDateTime: t }))).toBe(false);
  });

  it('PotentialSet round-trips and compares by value', () => {
    const t = tick();
    const filled = filledPotentialSet(10, t);
    const empty = emptyPotentialSet(60);
    expect(PotentialSet.fromJSON(filled.toJSON()).equals(filled)).toBe(true);
    expect(PotentialSet.fromJSON(empty.toJSON()).equals(empty)).toBe(true);
    expect(filled.equals(undefined)).toBe(false);
    expect(filled.equals(filled)).toBe(true);
    expect(filled.equals(empty)).toBe(false);
  });
});

// ─── RPE ──────────────────────────────────────────────────────────────────────

describe('RecordedWeightedExercise RPE', () => {
  const unlogged = () => new RecordedWeightedExercise(makeWeightedBlueprint(), [emptyPotentialSet()], undefined);

  it('picking an RPE on an unlogged set does not log it', () => {
    const result = unlogged().withRpe(0, 8);
    expect(result.getSet(0).set).toBeUndefined();
    expect(result.getSet(0).rpe).toBe(8);
  });

  it('keeps an RPE picked before the set through any mix of cycling, exact reps and clearing', () => {
    const rpe = fc.constantFrom(...RPE_VALUES);
    const repOperation = fc.oneof(
      fc.constant((exercise: RecordedWeightedExercise) => exercise.withCycledRepCount(0, tick())),
      fc
        .integer({ min: 0, max: 30 })
        .map((reps) => (exercise: RecordedWeightedExercise) => exercise.withRepCount(0, reps, tick())),
      fc.constant((exercise: RecordedWeightedExercise) => exercise.withRepCount(0, undefined, tick())),
    );
    fc.assert(
      fc.property(rpe, fc.array(repOperation, { minLength: 1, maxLength: 15 }), (value, operations) => {
        const exercise = operations.reduce((current, operation) => operation(current), unlogged().withRpe(0, value));
        expect(exercise.getSet(0).rpe).toBe(value);
      }),
    );
  });

  it('keeps the RPE when exact reps are entered, and when the reps are cleared', () => {
    const rated = unlogged().withRpe(0, 9.5);
    const logged = rated.withRepCount(0, 7, tick());
    expect(logged.getSet(0).rpe).toBe(9.5);
    expect(logged.withRepCount(0, undefined, tick()).getSet(0).rpe).toBe(9.5);
  });

  it('only the explicit clear removes it', () => {
    expect(unlogged().withRpe(0, 7).withRpe(0, undefined).getSet(0).rpe).toBeUndefined();
  });

  it('shows the RPE as logged only once the set is', () => {
    const rated = unlogged().withRpe(0, 8);
    expect(rated.getSet(0).loggedRpe).toBeUndefined();
    expect(rated.withCycledRepCount(0, tick()).getSet(0).loggedRpe).toBe(8);
  });

  it('withoutUnloggedRpe drops the RPE from sets never logged and keeps it on logged ones', () => {
    const exercise = new RecordedWeightedExercise(
      makeWeightedBlueprint(),
      [filledPotentialSet(10, tick()).with({ rpe: 8 }), emptyPotentialSet().with({ rpe: 9 })],
      undefined,
    );
    const result = exercise.withoutUnloggedRpe();
    expect(result.getSet(0).rpe).toBe(8);
    expect(result.getSet(1).rpe).toBeUndefined();
  });

  it('withoutUnloggedRpe returns the same exercise when there is nothing to drop', () => {
    const exercise = new RecordedWeightedExercise(
      makeWeightedBlueprint(),
      [filledPotentialSet(10, tick()).with({ rpe: 8 }), emptyPotentialSet()],
      undefined,
    );
    expect(exercise.withoutUnloggedRpe()).toBe(exercise);
  });

  it('withNothingCompleted clears RPE along with the sets', () => {
    const exercise = new RecordedWeightedExercise(
      makeWeightedBlueprint(),
      [filledPotentialSet(10, tick()).with({ rpe: 8 })],
      undefined,
    );
    expect(exercise.withNothingCompleted().getSet(0).rpe).toBeUndefined();
  });

  it('round-trips RPE through JSON', () => {
    const exercise = new RecordedWeightedExercise(
      makeWeightedBlueprint(),
      [filledPotentialSet(10, tick()).with({ rpe: 8.5 }), emptyPotentialSet()],
      undefined,
    );
    const rebuilt = RecordedWeightedExercise.fromJSON(exercise.toJSON());
    expect(rebuilt.equals(exercise)).toBe(true);
    expect(rebuilt.getSet(0).rpe).toBe(8.5);
    expect(rebuilt.getSet(1).rpe).toBeUndefined();
  });

  it('ignores an RPE outside the scale when reading JSON', () => {
    const json = { ...emptyPotentialSet().toJSON(), rpe: 11 };
    expect(PotentialSet.fromJSON(json).rpe).toBeUndefined();
  });

  it('treats a different RPE as a different set', () => {
    expect(
      emptyPotentialSet()
        .with({ rpe: 8 })
        .equals(emptyPotentialSet().with({ rpe: 9 })),
    ).toBe(false);
  });
});

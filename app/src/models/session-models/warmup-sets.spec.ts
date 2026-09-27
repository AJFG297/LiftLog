import { describe, it, expect } from 'vitest';
import { LocalDate } from '@js-joda/core';
import { v4 as uuid } from 'uuid';
import { PlannedWarmupSet, SessionBlueprint } from '@/models/blueprint-models';
import { Weight } from '@/models/weight';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import { Session } from '@/models/session-models/session';
import { RestTimer } from '@/models/session-models/rest-timer';
import { makeRecordedExercise, makeWeightedBlueprint, tick, tickAt } from '@/models/session-models/__test__/helpers';
import { IndexOutOfBoundsError } from '@/utils/index-out-of-bounds';
import type { RecordedWeightedExerciseJSON, SessionJSON } from '@/models/storage/versions/latest';

const percent = (value: number, reps = 5): PlannedWarmupSet => ({ load: { type: 'percent', percent: value }, reps });
const absolute = (kg: number, reps = 5): PlannedWarmupSet => ({
  load: { type: 'absolute', weight: new Weight(kg, 'kilograms') },
  reps,
});

/** 50% × 5 then 70% × 3 in front of a 2 × 10 at 100 kg, nothing logged. */
function withWarmups(reps: (number | undefined)[] = [undefined, undefined]) {
  const blueprint = makeWeightedBlueprint({ sets: 2, warmupSets: [percent(50, 5), percent(70, 3)] });
  return makeRecordedExercise(blueprint, reps, new Weight(100, 'kilograms')).withWarmupsFromPlan('kilograms');
}

const weights = (sets: { weight: Weight }[]) => sets.map((s) => s.weight.value.toNumber());

describe('warm-up slots', () => {
  it('are built from the plan against the heaviest working set', () => {
    const exercise = withWarmups();
    expect(weights(exercise.warmupSets)).toEqual([50, 70]);
    expect(exercise.warmupSets.map((s) => s.target)).toEqual([
      { min: 5, max: 5 },
      { min: 3, max: 3 },
    ]);
  });

  it('are left out of the working sets', () => {
    expect(withWarmups().potentialSets).toHaveLength(2);
  });

  it('are empty for an exercise with none planned', () => {
    expect(RecordedWeightedExercise.empty(makeWeightedBlueprint(), 'kilograms').warmupSets).toEqual([]);
  });

  it('come with a fresh exercise, at zero when the working sets are', () => {
    const blueprint = makeWeightedBlueprint({ warmupSets: [percent(50), absolute(20)] });
    const exercise = RecordedWeightedExercise.empty(blueprint, 'kilograms');
    expect(weights(exercise.warmupSets)).toEqual([0, 20]);
  });

  it('cycle on a tap from the target down to cleared, like a working set', () => {
    let exercise = withWarmups();
    const reps = [];
    for (let i = 0; i < 5; i++) {
      exercise = exercise.withCycledWarmupRepCount(1, tick());
      reps.push(exercise.warmupSets[1]!.set?.repsCompleted);
    }
    expect(reps).toEqual([3, 2, 1, 0, undefined]);
    expect(exercise.potentialSets.every((s) => !s.set)).toBe(true);
  });

  it('take exact reps, and clear back to unlogged', () => {
    const logged = withWarmups().withWarmupRepCount(0, 8, tick());
    expect(logged.warmupSets[0]!.set?.repsCompleted).toBe(8);
    expect(logged.withWarmupRepCount(0, undefined, tick()).warmupSets[0]!.set).toBeUndefined();
  });

  it('change weight for the session only, leaving the plan alone', () => {
    const exercise = withWarmups();
    const edited = exercise.withWarmupWeight(0, new Weight(40, 'kilograms'));
    expect(weights(edited.warmupSets)).toEqual([40, 70]);
    expect(weights(edited.potentialSets)).toEqual([100, 100]);
    expect(edited.blueprint.equals(exercise.blueprint)).toBe(true);
  });

  it('follow the working weight when it changes mid-workout, from zero on a first session', () => {
    const blueprint = makeWeightedBlueprint({ sets: 2, warmupSets: [percent(50), percent(70, 3), absolute(20)] });
    const fresh = RecordedWeightedExercise.empty(blueprint, 'kilograms');
    const moved = fresh.withWeight(0, new Weight(85, 'kilograms'), 'uncompletedSets');
    // 42.5 and 59.5 on the 2.5 kg fallback step; the absolute one doesn't depend on the working weight.
    expect(weights(moved.warmupSets)).toEqual([42.5, 60, 20]);
  });

  it('follow the heaviest working set when only one set changes', () => {
    const moved = withWarmups().withWeight(1, new Weight(120, 'kilograms'), 'thisSet');
    expect(weights(moved.warmupSets)).toEqual([60, 85]);
  });

  it('keep a logged weight, and a weight given for this session only, when the working weight changes', () => {
    const exercise = withWarmups().withWarmupRepCount(0, 5, tick()).withWarmupWeight(1, new Weight(30, 'kilograms'));
    const moved = exercise.withWeight(0, new Weight(140, 'kilograms'), 'allSets');
    expect(weights(moved.warmupSets)).toEqual([50, 30]);
  });

  it('throw on an index with no warm-up', () => {
    expect(() => withWarmups().withCycledWarmupRepCount(2, tick())).toThrow(IndexOutOfBoundsError);
  });

  it('round-trip through JSON and count toward equality', () => {
    const exercise = withWarmups().withWarmupRepCount(0, 5, tick());
    const rebuilt = RecordedWeightedExercise.fromJSON(
      JSON.parse(JSON.stringify(exercise.toJSON())) as RecordedWeightedExerciseJSON,
    );
    expect(rebuilt.equals(exercise)).toBe(true);
    expect(rebuilt.equals(exercise.withWarmupRepCount(0, 4, tick()))).toBe(false);
  });

  it('are cleared by withNothingCompleted', () => {
    const cleared = withWarmups().withWarmupRepCount(0, 5, tick()).withNothingCompleted();
    expect(cleared.warmupSets.every((s) => !s.set)).toBe(true);
  });
});

describe('warm-ups never count', () => {
  it('a skipped or short warm-up does not fail the success check', () => {
    expect(withWarmups([10, 10]).withWarmupRepCount(0, 1, tick()).isSuccessForProgressiveOverload).toBe(true);
  });

  it('a skipped warm-up does not hold the exercise open', () => {
    expect(withWarmups([10, 10]).isComplete).toBe(true);
  });

  it('a warm-up heavier than the working sets is not in the volume or top weight', () => {
    const exercise = withWarmups([10, 10])
      .withWarmupWeight(0, new Weight(200, 'kilograms'))
      .withWarmupRepCount(0, 5, tick());
    expect(exercise.totalWeightLifted.value.toNumber()).toBe(2000);
    expect(exercise.maxWeight.value.toNumber()).toBe(100);
  });
});

describe('the current set', () => {
  it('is the first unlogged warm-up before any working set is logged', () => {
    expect(withWarmups().currentSet).toEqual({ kind: 'warmup', index: 0 });
    expect(withWarmups().withCycledWarmupRepCount(0, tick()).currentSet).toEqual({ kind: 'warmup', index: 1 });
  });

  it('moves to the working sets once every warm-up is logged', () => {
    const exercise = withWarmups().withWarmupRepCount(0, 5, tick()).withWarmupRepCount(1, 3, tick());
    expect(exercise.currentSet).toEqual({ kind: 'working', index: 0 });
  });

  it('leaves a skipped warm-up behind once the working sets begin', () => {
    expect(withWarmups([10, undefined]).currentSet).toEqual({ kind: 'working', index: 1 });
  });

  it('is undefined once every working set is logged', () => {
    expect(withWarmups([10, 10]).currentSet).toBeUndefined();
  });

  it('points at the slot slotAt returns', () => {
    const exercise = withWarmups();
    expect(exercise.slotAt({ kind: 'warmup', index: 1 })).toBe(exercise.warmupSets[1]);
    expect(exercise.slotAt({ kind: 'working', index: 0 })).toBe(exercise.potentialSets[0]);
  });
});

describe('warm-up timing', () => {
  it('starts the exercise and its clock', () => {
    const at = tick();
    const exercise = withWarmups().withWarmupRepCount(0, 5, at);
    expect(exercise.isStarted).toBe(true);
    expect(exercise.earliestTime).toEqual(at);
    expect(exercise.lastLoggedSlot).toMatchObject({ kind: 'warmup', index: 0 });
  });

  it('counts toward the exercise duration', () => {
    const exercise = withWarmups()
      .withWarmupRepCount(0, 5, tickAt(10, 0))
      .withRepCount(0, 10, tickAt(10, 10))
      .withRepCount(1, 10, tickAt(10, 15));
    expect(exercise.duration?.toMinutes()).toBe(15);
  });

  it('a short warm-up is never a missed target', () => {
    expect(withWarmups().withWarmupRepCount(0, 1, tick()).lastSetMissedTarget).toBe(false);
  });

  it('a short working set after the warm-ups is', () => {
    const exercise = withWarmups().withWarmupRepCount(0, 5, tick()).withRepCount(0, 3, tick());
    expect(exercise.lastSetMissedTarget).toBe(true);
  });
});

describe('Session with warm-ups', () => {
  function sessionWith(exercise: RecordedWeightedExercise, restTimer?: RestTimer) {
    return new Session(
      uuid(),
      new SessionBlueprint('Test', [exercise.blueprint], ''),
      [exercise],
      LocalDate.of(2025, 4, 5),
      undefined,
      restTimer,
    );
  }

  it('rests the minimum after a warm-up, even a short one', () => {
    const start = tickAt(12, 0);
    const session = sessionWith(withWarmups().withWarmupRepCount(0, 1, tick()), new RestTimer(start));
    expect(session.restTimerEndTime).toEqual(start.plus(makeWeightedBlueprint().restBetweenSets.minRest));
  });

  it('round-trips warm-ups through JSON', () => {
    const session = sessionWith(withWarmups().withWarmupRepCount(0, 5, tick()));
    expect(Session.fromJSON(JSON.parse(JSON.stringify(session.toJSON())) as SessionJSON).equals(session)).toBe(true);
  });

  it('moves logged warm-ups with the date', () => {
    const session = sessionWith(withWarmups().withWarmupRepCount(0, 5, tickAt(10, 0)));
    const moved = session.withUpdatedDate(LocalDate.of(2025, 5, 1));
    const exercise = moved.recordedExercises[0] as RecordedWeightedExercise;
    expect(exercise.warmupSets[0]!.set?.completionDateTime.toLocalDate()).toEqual(LocalDate.of(2025, 5, 1));
  });

  it('gives a warm-up added in the workout editor a slot from the current working weight', () => {
    const session = sessionWith(withWarmups().withWarmupRepCount(0, 5, tick()));
    const exercise = session.recordedExercises[0] as RecordedWeightedExercise;
    const edited = session.withEditedExercise(
      0,
      exercise.blueprint.with({ warmupSets: [...exercise.blueprint.warmupSets, percent(90, 1)] }),
      false,
    );
    const warmups = (edited.recordedExercises[0] as RecordedWeightedExercise).warmupSets;
    expect(weights(warmups)).toEqual([50, 70, 90]);
    expect(warmups[0]!.set?.repsCompleted).toBe(5);
    expect(warmups[2]!.set).toBeUndefined();
  });

  it('keeps a session-only warm-up weight through an unrelated edit, and drops a removed warm-up', () => {
    const session = sessionWith(withWarmups().withWarmupWeight(0, new Weight(40, 'kilograms')));
    const exercise = session.recordedExercises[0] as RecordedWeightedExercise;
    const edited = session.withEditedExercise(
      0,
      exercise.blueprint.with({ notes: 'new notes', warmupSets: exercise.blueprint.warmupSets.slice(0, 1) }),
      false,
    );
    expect(weights((edited.recordedExercises[0] as RecordedWeightedExercise).warmupSets)).toEqual([40]);
  });

  /** The exercise's warm-ups after replacing the plan's with `warmupSets` in the workout editor. */
  function editWarmups(exercise: RecordedWeightedExercise, warmupSets: PlannedWarmupSet[]) {
    const edited = sessionWith(exercise).withEditedExercise(0, exercise.blueprint.with({ warmupSets }), false);
    return (edited.recordedExercises[0] as RecordedWeightedExercise).warmupSets;
  }

  it('drops the logged slot of an earlier warm-up that is removed, keeping the next one its own', () => {
    const warmups = editWarmups(withWarmups().withWarmupRepCount(0, 5, tick()), [percent(70, 3)]);
    expect(weights(warmups)).toEqual([70]);
    expect(warmups[0]!.set).toBeUndefined();
  });

  it('keeps a later logged warm-up when an earlier one is removed', () => {
    const warmups = editWarmups(withWarmups().withWarmupRepCount(1, 2, tick()), [percent(70, 3)]);
    expect(weights(warmups)).toEqual([70]);
    expect(warmups[0]!.set?.repsCompleted).toBe(2);
  });

  it('keeps each slot with its warm-up when one is inserted in front', () => {
    const exercise = withWarmups().withWarmupRepCount(0, 5, tick()).withWarmupWeight(1, new Weight(65, 'kilograms'));
    const warmups = editWarmups(exercise, [absolute(20), percent(50, 5), percent(70, 3)]);
    expect(weights(warmups)).toEqual([20, 50, 65]);
    expect(warmups.map((w) => w.set?.repsCompleted)).toEqual([undefined, 5, undefined]);
  });

  it('keeps a logged warm-up whose plan was changed, and rebuilds an unlogged one', () => {
    const warmups = editWarmups(withWarmups().withWarmupRepCount(0, 5, tick()), [percent(55, 5), percent(80, 3)]);
    expect(weights(warmups)).toEqual([50, 80]);
    expect(warmups[0]!.set?.repsCompleted).toBe(5);
  });

  it('fills a nil warm-up weight with the fallback unit', () => {
    const blueprint = makeWeightedBlueprint({ warmupSets: [percent(50)] });
    const exercise = RecordedWeightedExercise.empty(blueprint, 'nil');
    const filled = sessionWith(exercise).withNoNilWeights('pounds')!;
    expect((filled.recordedExercises[0] as RecordedWeightedExercise).warmupSets[0]!.weight.unit).toBe('pounds');
  });
});

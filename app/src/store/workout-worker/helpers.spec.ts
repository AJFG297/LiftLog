import { describe, it, expect } from 'vitest';
import { Instant, LocalDate } from '@js-joda/core';
import { PlannedWarmupSet, Rest, SessionBlueprint } from '@/models/blueprint-models';
import { Weight } from '@/models/weight';
import { Session } from '@/models/session-models/session';
import { RestTimer } from '@/models/session-models/rest-timer';
import { RecordedCardioExercise } from '@/models/session-models/recorded-cardio-exercise';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import {
  emptyPotentialSet,
  filledPotentialSet,
  makeCardioBlueprint,
  makeSession,
  makeRecordedExercise,
  makeWeightedBlueprint,
  tick,
} from '@/models/session-models/__test__/helpers';
import {
  getCardioTimerInfo,
  getCurrentExerciseDetails,
  getTimerInfo,
  workoutUpdatedEvent,
} from '@/store/workout-worker/helpers';
import { uuid } from '@/utils/uuid';
import type { RecordedWeightedExerciseJSON } from '@/models/storage/versions/latest';

describe('getCardioTimerInfo', () => {
  it('returns undefined when no cardio set has a running timer', () => {
    const session = makeSession([makeCardioBlueprint(1)]);
    expect(getCardioTimerInfo(session)).toBeUndefined();
  });

  it('reports the exercise and set index of the running timer', () => {
    const cardio = RecordedCardioExercise.empty(makeCardioBlueprint(2)).withSet(1, (s) =>
      s.with({ currentBlockStartTime: tick() }),
    );
    const session = new Session(
      uuid(),
      new SessionBlueprint('Test', [cardio.blueprint], ''),
      [cardio],
      LocalDate.of(2025, 4, 5),
      undefined,
      undefined,
    );

    const info = getCardioTimerInfo(session)!;

    expect(info.exerciseIndex).toBe(0);
    expect(info.setIndex).toBe(1);
    expect(info.currentBlockStartTime).toBeDefined();
  });
});

describe('getCurrentExerciseDetails', () => {
  it('returns undefined when there is no next exercise', () => {
    const session = makeSession([]);
    expect(getCurrentExerciseDetails(session)).toBeUndefined();
  });

  it('returns the serialized next exercise and its current set index', () => {
    const session = makeSession([makeWeightedBlueprint({ name: 'Squat' })]);
    const details = getCurrentExerciseDetails(session)!;
    expect(details.setIndex).toBe(0);
    expect(details.exercise).toBeDefined();
  });
});

describe('getTimerInfo', () => {
  function sessionWithRestTimer(reps: number, start = tick()) {
    const bp = makeWeightedBlueprint();
    const exercise = new RecordedWeightedExercise(
      bp,
      [filledPotentialSet(reps, tick()), emptyPotentialSet(100)],
      undefined,
    );
    return new Session(
      uuid(),
      new SessionBlueprint('Test', [bp], ''),
      [exercise],
      LocalDate.of(2025, 4, 5),
      undefined,
      new RestTimer(start),
    );
  }

  it('returns undefined without a running rest timer', () => {
    const bp = makeWeightedBlueprint();
    const exercise = new RecordedWeightedExercise(bp, [filledPotentialSet(10, tick())], undefined);
    const session = new Session(
      uuid(),
      new SessionBlueprint('Test', [bp], ''),
      [exercise],
      LocalDate.of(2025, 4, 5),
      undefined,
      undefined,
    );
    expect(getTimerInfo(session)).toBeUndefined();
  });

  it('returns partial and full rest times after a successful set', () => {
    const info = getTimerInfo(sessionWithRestTimer(10))!;
    expect(info.startedAt).toBeDefined();
    expect(info.partiallyEndAt).toBeDefined();
    expect(info.endAt).toBeDefined();
  });

  it('returns equal partial and full rest after a failed set', () => {
    const info = getTimerInfo(sessionWithRestTimer(3))!;
    expect(info.partiallyEndAt).toEqual(info.endAt);
  });

  function sessionWithPyramidRestTimer(lastSetReps: number) {
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
    // Set 0 stays open so a next exercise exists; the most recent completion is set 2 (target 8).
    const exercise = makeRecordedExercise(bp, [undefined, 10, lastSetReps]);
    return new Session(
      uuid(),
      new SessionBlueprint('Test', [bp], ''),
      [exercise],
      LocalDate.of(2025, 4, 5),
      undefined,
      new RestTimer(tick()),
    );
  }

  it("judges rest against the last completed set's own pyramid target", () => {
    // Last completed set targets 8; hitting it is a success even though it is below the earlier sets' targets.
    const success = getTimerInfo(sessionWithPyramidRestTimer(8))!;
    expect(success.partiallyEndAt).not.toEqual(success.endAt);

    const failure = getTimerInfo(sessionWithPyramidRestTimer(7))!;
    expect(failure.partiallyEndAt).toEqual(failure.endAt);
  });
});

describe('warm-ups in the workout worker', () => {
  const warmup = (percent: number, reps: number): PlannedWarmupSet => ({ load: { type: 'percent', percent }, reps });
  const rest = Rest.short;

  /** 50% × 5 and 70% × 3 in front of 2 × 10 at 100 kg, with `warmupReps` / `workingReps` logged in order. */
  function sessionWith(
    warmupReps: (number | undefined)[],
    workingReps: (number | undefined)[] = [undefined, undefined],
  ) {
    const bp = makeWeightedBlueprint({ sets: 2, restBetweenSets: rest, warmupSets: [warmup(50, 5), warmup(70, 3)] });
    let exercise = makeRecordedExercise(bp, [undefined, undefined], new Weight(100, 'kilograms')).withWarmupsFromPlan(
      'kilograms',
    );
    // Logged in the order a lifter would: the warm-ups, then the working sets.
    for (const [index, reps] of warmupReps.entries()) {
      if (reps !== undefined) {
        exercise = exercise.withWarmupRepCount(index, reps, tick());
      }
    }
    for (const [index, reps] of workingReps.entries()) {
      if (reps !== undefined) {
        exercise = exercise.withRepCount(index, reps, tick());
      }
    }
    return new Session(
      uuid(),
      new SessionBlueprint('Test', [bp], ''),
      [exercise],
      LocalDate.of(2025, 4, 5),
      undefined,
      new RestTimer(tick()),
    );
  }

  const seconds = (from: string, to: string) => Instant.parse(to).epochSecond() - Instant.parse(from).epochSecond();

  it('makes the first unlogged warm-up the current set', () => {
    expect(getCurrentExerciseDetails(sessionWith([]))).toMatchObject({ setKind: 'warmup', setIndex: 0 });
    expect(getCurrentExerciseDetails(sessionWith([5]))).toMatchObject({ setKind: 'warmup', setIndex: 1 });
  });

  it('moves to the working sets once the warm-ups are logged', () => {
    expect(getCurrentExerciseDetails(sessionWith([5, 3]))).toMatchObject({ setKind: 'working', setIndex: 0 });
  });

  it('names the kind of the working-list set that comes next, indexing the working list', () => {
    const session = sessionWith([5, 3], [10, undefined]);
    const exercise = session.recordedExercises[0] as RecordedWeightedExercise;
    const withDrop = session.withExercise(
      0,
      exercise.withSet(1, (s) => s.with({ kind: 'drop' })),
    );

    expect(getCurrentExerciseDetails(withDrop)).toMatchObject({ setKind: 'drop', setIndex: 1 });
  });

  it('leaves a skipped warm-up behind once a working set is logged', () => {
    expect(getCurrentExerciseDetails(sessionWith([], [10, undefined]))).toMatchObject({
      setKind: 'working',
      setIndex: 1,
    });
  });

  it('sends the warm-up slot the notification labels, weight included', () => {
    const details = getCurrentExerciseDetails(sessionWith([5]))!;
    const exercise = details.exercise as RecordedWeightedExerciseJSON;
    const slot = exercise.warmupSets[details.setIndex]!;
    expect(slot.target.reps).toEqual({ min: 3, max: 3 });
    expect(slot.weight).toEqual(new Weight(70, 'kilograms').toJSON());
  });

  it('rests only the minimum after a warm-up', () => {
    const info = getTimerInfo(sessionWith([5]))!;
    expect(seconds(info.startedAt, info.partiallyEndAt)).toBe(rest.minRest.seconds());
    expect(seconds(info.startedAt, info.endAt)).toBe(rest.minRest.seconds());
  });

  it('never gives the failure rest after a short warm-up', () => {
    const info = getTimerInfo(sessionWith([1]))!;
    expect(seconds(info.startedAt, info.endAt)).toBe(rest.minRest.seconds());
  });

  it('still gives the failure rest after a short working set that follows the warm-ups', () => {
    const info = getTimerInfo(sessionWith([5, 3], [3, undefined]))!;
    expect(seconds(info.startedAt, info.partiallyEndAt)).toBe(rest.failureRest.seconds());
    expect(seconds(info.startedAt, info.endAt)).toBe(rest.failureRest.seconds());
  });

  it('gives the full rest window after a successful working set', () => {
    const info = getTimerInfo(sessionWith([5, 3], [10, undefined]))!;
    expect(seconds(info.startedAt, info.partiallyEndAt)).toBe(rest.minRest.seconds());
    expect(seconds(info.startedAt, info.endAt)).toBe(rest.maxRest.seconds());
  });

  it('carries warm-ups in the workout sent to the worker, outside its volume', () => {
    const event = workoutUpdatedEvent(sessionWith([5, 3], [10, undefined]), true);
    const exercise = event.workout.recordedExercises[0] as RecordedWeightedExerciseJSON;
    expect(exercise.warmupSets.map((s) => s.set?.repsCompleted)).toEqual([5, 3]);
    expect(event.totalWeightLifted).toEqual(new Weight(1000, 'kilograms').toJSON());
  });
});

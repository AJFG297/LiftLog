import { describe, it, expect } from 'vitest';
import { Duration, LocalDate, OffsetDateTime } from '@js-joda/core';
import { v4 as uuid } from 'uuid';
import { PlannedWarmupSet, Rest, SessionBlueprint } from '@/models/blueprint-models';
import { Weight } from '@/models/weight';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import { Session } from '@/models/session-models/session';
import { makeRecordedExercise, makeWeightedBlueprint, tickAt } from '@/models/session-models/__test__/helpers';

const warmup: PlannedWarmupSet = { load: { type: 'percent', percent: 50 }, reps: 5 };

/** A 1 × 10 at 100 kg behind one 50% × 5 warm-up, each logged at the given time when there is one. */
function exercise(name: string, warmupAt: OffsetDateTime | undefined, workingAt: OffsetDateTime | undefined) {
  const bp = makeWeightedBlueprint({ name, sets: 1, restBetweenSets: Rest.short, warmupSets: [warmup] });
  let result = makeRecordedExercise(bp, [undefined], new Weight(100, 'kilograms')).withWarmupsFromPlan('kilograms');
  if (warmupAt) result = result.withWarmupRepCount(0, 5, warmupAt);
  if (workingAt) result = result.withRepCount(0, 10, workingAt);
  return result;
}

function sessionOf(...exercises: RecordedWeightedExercise[]) {
  return new Session(
    uuid(),
    new SessionBlueprint(
      'Test',
      exercises.map((x) => x.blueprint),
      '',
    ),
    exercises,
    LocalDate.of(2025, 4, 5),
    undefined,
    undefined,
  );
}

describe('session timing with warm-ups (what Health records)', () => {
  it('starts at the first warm-up and ends at the last set', () => {
    const session = sessionOf(
      exercise('Squat', tickAt(10, 0), tickAt(10, 10)),
      exercise('Bench', undefined, tickAt(10, 30)),
    );
    expect(session.startTime).toEqual(tickAt(10, 0));
    expect(session.endTime).toEqual(tickAt(10, 30));
    expect(session.duration).toEqual(Duration.ofMinutes(30));
  });

  it('starts at a warm-up done early for an exercise that finished later', () => {
    // Bench's warm-up came first, though Squat's only set was logged before Bench finished.
    const session = sessionOf(
      exercise('Squat', undefined, tickAt(10, 5)),
      exercise('Bench', tickAt(9, 55), tickAt(10, 20)),
    );
    expect(session.startTime).toEqual(tickAt(9, 55));
    expect(session.duration).toEqual(Duration.ofMinutes(25));
  });

  it('ends at a warm-up when that is the last thing logged', () => {
    const session = sessionOf(
      exercise('Squat', undefined, tickAt(10, 0)),
      exercise('Bench', tickAt(10, 15), undefined),
    );
    expect(session.endTime).toEqual(tickAt(10, 15));
  });

  it('has no start or end before anything is logged', () => {
    const session = sessionOf(exercise('Squat', undefined, undefined));
    expect(session.startTime).toBeUndefined();
    expect(session.endTime).toBeUndefined();
    expect(session.duration).toBeUndefined();
  });
});

describe('rest after a warm-up', () => {
  it('never earns the failed-set rest, however short the warm-up', () => {
    const short = exercise('Squat', undefined, undefined).withWarmupRepCount(0, 1, tickAt(10, 0));
    expect(short.lastSetMissedTarget).toBe(false);
  });
});

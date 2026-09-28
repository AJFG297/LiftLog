import { describe, expect, it } from 'vitest';
import Enumerable from 'linq';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import { ProgressionRule, SessionBlueprint } from '@/models/blueprint-models';
import { PotentialSet, RecordedSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import type { SetKind, WorkingListKind } from '@/models/session-models/set-kind';
import { makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';
import { SessionService } from '@/services/session-service';
import { ProgressRepository } from '@/services/progress-repository';
import { sessionVolume } from '@/store/activity/volume';
import { findPersonalRecords } from '@/store/stats/personal-records';
import type { RootState } from '@/store';

const at = (minute: number) => OffsetDateTime.parse(`2025-04-05T10:${String(minute).padStart(2, '0')}:00Z`);

function slot(kind: SetKind, weight: number, reps: number | undefined, target = 10, minute = 0) {
  return PotentialSet.of({
    weight: new Weight(weight, 'kilograms'),
    target: { min: target, max: target },
    kind,
    set: reps === undefined ? undefined : RecordedSet.of({ repsCompleted: reps, completionDateTime: at(minute) }),
  });
}

/**
 * Two working sets of 10 x 100 kg, then `extra` - a set of the kind under test. A warm-up goes in its
 * own list, the way the app keeps it; every other kind is the third set of the working list.
 */
function exerciseWith(extra: PotentialSet) {
  const working = [slot('working', 100, 10, 10, 1), slot('working', 100, 10, 10, 2)];
  const kinds: WorkingListKind[] =
    extra.kind === 'warmup' ? ['working', 'working'] : ['working', 'working', extra.kind];
  const blueprint = makeWeightedBlueprint({
    plannedSets: kinds.map((kind) => ({ reps: { min: 10, max: 10 }, kind })),
  });
  return extra.kind === 'warmup'
    ? new RecordedWeightedExercise(blueprint, working, undefined, [extra])
    : new RecordedWeightedExercise(blueprint, [...working, extra], undefined);
}

function sessionOf(exercise: RecordedWeightedExercise, date = LocalDate.of(2025, 4, 5)) {
  return makeSession([exercise.blueprint], date).withExercise(0, exercise);
}

describe('what each set kind counts towards', () => {
  it.each([
    ['working', 2500],
    ['warmup', 2000],
    ['failure', 2500],
    ['drop', 2500],
    ['myo', 2500],
  ] as const)('volume: a %s set of 10 x 50 kg makes the session %d kg', (kind, volume) => {
    const session = sessionOf(exerciseWith(slot(kind, 50, 10, 10, 3)));

    expect(sessionVolume(session)).toBe(volume);
    expect(session.totalWeightLifted.value.toNumber()).toBe(volume);
  });

  it.each([
    ['working', ['Squat']],
    ['warmup', []],
    ['failure', ['Squat']],
    ['drop', []],
    ['myo', []],
  ] as const)('records: a heavier %s set sets a record for %j', (kind, records) => {
    const before = sessionOf(exerciseWith(slot(kind, 50, 10, 10, 3)), LocalDate.of(2025, 4, 1));
    const after = sessionOf(exerciseWith(slot(kind, 140, 10, 10, 3)), LocalDate.of(2025, 4, 5));

    const found = findPersonalRecords([before, after]).get(after.id) ?? [];

    expect(found.map((record) => record.exerciseName)).toEqual(records);
  });

  it.each([
    ['working', false],
    ['warmup', true],
    ['failure', false],
    ['drop', true],
    ['myo', true],
  ] as const)('progression check: a %s set short of its target leaves the session a success: %s', (kind, success) => {
    expect(exerciseWith(slot(kind, 60, 4, 10, 3)).isSuccessForProgressiveOverload).toBe(success);
  });

  it('progression check: every checked set has to be logged, but an unlogged drop set does not', () => {
    expect(exerciseWith(slot('drop', 60, undefined)).isSuccessForProgressiveOverload).toBe(true);
    expect(exerciseWith(slot('failure', 60, undefined)).isSuccessForProgressiveOverload).toBe(false);
  });
});

describe('the next session', () => {
  function service() {
    const state = { settings: { useImperialUnits: false }, storedSessions: { sessions: {} } } as unknown as RootState;
    const progress = { getOrderedSessions: () => Enumerable.from([]) } as unknown as ProgressRepository;
    return new SessionService(progress, () => state);
  }

  function nextAfter(last: RecordedWeightedExercise) {
    const blueprint = last.blueprint.with({ progression: [] });
    const session: Session = service().hydrateSessionFromBlueprint(new SessionBlueprint('Legs', [blueprint], ''), {
      [blueprint.progressionKey()]: last.with({ blueprint }),
    });
    return session.recordedExercises[0] as RecordedWeightedExercise;
  }

  it.each([
    ['working', 80],
    ['failure', 80],
    ['drop', 80],
    ['myo', 80],
  ] as const)('carry-over: a %s set at 80 kg starts the next session at %d kg', (kind, weight) => {
    const next = nextAfter(exerciseWith(slot(kind, 80, 10, 10, 3)));

    expect(next.potentialSets.map((s) => [s.kind, s.weight.value.toNumber()])).toEqual([
      ['working', 100],
      ['working', 100],
      [kind, weight],
    ]);
  });

  it('carry-over: a warm-up is rebuilt from the plan, not from what was lifted', () => {
    const last = exerciseWith(slot('warmup', 70, 8, 8, 0));
    const withPlannedWarmup = last.with({
      blueprint: last.blueprint.with({
        warmupSets: [{ load: { type: 'absolute', weight: new Weight(20, 'kilograms') }, reps: 8 }],
      }),
    });

    const next = nextAfter(withPlannedWarmup);

    expect(next.warmupSets.map((s) => [s.kind, s.weight.value.toNumber()])).toEqual([['warmup', 20]]);
  });

  it('carry-over: a drop set keeps its weight but not a rep target a reps rule won', () => {
    const last = exerciseWith(slot('drop', 40, 12, 12, 3));
    const blueprint = last.blueprint.with({
      progression: [ProgressionRule.of({ axis: 'reps', step: new BigNumber(1), ceiling: new BigNumber(15) })],
    });

    const session = service().hydrateSessionFromBlueprint(new SessionBlueprint('Legs', [blueprint], ''), {
      [blueprint.progressionKey()]: last.with({ blueprint }),
    });

    const drop = (session.recordedExercises[0] as RecordedWeightedExercise).potentialSets[2]!;
    expect([drop.kind, drop.weight.value.toNumber(), drop.target]).toEqual(['drop', 40, { min: 10, max: 10 }]);
  });

  it('carry-over: a drop set that was a working set last time starts at no weight', () => {
    const last = exerciseWith(slot('working', 100, 10, 10, 3));
    const blueprint = last.blueprint.with({
      progression: [],
      plannedSets: [0, 1, 2].map((i) => ({ reps: { min: 10, max: 10 }, kind: i === 2 ? 'drop' : 'working' })),
    });

    const session = service().hydrateSessionFromBlueprint(new SessionBlueprint('Legs', [blueprint], ''), {
      [blueprint.progressionKey()]: last,
    });

    expect(
      (session.recordedExercises[0] as RecordedWeightedExercise).potentialSets.map((s) => s.weight.value.toNumber()),
    ).toEqual([100, 100, 0]);
  });

  it('carry-over: a working set that was a drop set last time does not take on its lighter weight', () => {
    const last = exerciseWith(slot('drop', 40, 10, 10, 3));
    const blueprint = last.blueprint.with({
      progression: [],
      plannedSets: [0, 1, 2].map(() => ({ reps: { min: 10, max: 10 }, kind: 'working' })),
    });

    const session = service().hydrateSessionFromBlueprint(new SessionBlueprint('Legs', [blueprint], ''), {
      [blueprint.progressionKey()]: last,
    });

    expect(
      (session.recordedExercises[0] as RecordedWeightedExercise).potentialSets.map((s) => s.weight.value.toNumber()),
    ).toEqual([100, 100, 0]);
  });

  it('progression: a load rule moves only the sets the check reads', () => {
    const last = exerciseWith(slot('drop', 60, 4, 10, 3));
    const blueprint = last.blueprint;
    const session = service().hydrateSessionFromBlueprint(new SessionBlueprint('Legs', [blueprint], ''), {
      [blueprint.progressionKey()]: last,
    });

    expect(
      (session.recordedExercises[0] as RecordedWeightedExercise).potentialSets.map((s) => s.weight.value.toNumber()),
    ).toEqual([102.5, 102.5, 60]);
  });

  describe('progression: a slot that starts over is left where it started', () => {
    /** Last session: two working sets of 10 x 100 kg and a 40 kg drop set, all on target. */
    function nextWithThirdSetAs(kind: WorkingListKind, progression: ProgressionRule[]) {
      const last = exerciseWith(slot('drop', 40, 10, 10, 3));
      const blueprint = last.blueprint.with({
        progression,
        plannedSets: [0, 1, 2].map((i) => ({ reps: { min: 10, max: 10 }, kind: i === 2 ? kind : 'working' })),
      });
      const session = service().hydrateSessionFromBlueprint(new SessionBlueprint('Legs', [blueprint], ''), {
        [blueprint.progressionKey()]: last,
      });
      return (session.recordedExercises[0] as RecordedWeightedExercise).potentialSets;
    }

    it.each(['working', 'failure'] as const)('a load rule does not put weight on a drop set that is now %s', (kind) => {
      const sets = nextWithThirdSetAs(kind, [ProgressionRule.load(new BigNumber(2.5))]);

      expect(sets.map((s) => [s.kind, s.weight.value.toNumber()])).toEqual([
        ['working', 102.5],
        ['working', 102.5],
        [kind, 0],
      ]);
    });

    it('a reps rule leaves a drop set that is now working on the plan target', () => {
      const sets = nextWithThirdSetAs('working', [
        ProgressionRule.of({ axis: 'reps', step: new BigNumber(1), ceiling: new BigNumber(15) }),
      ]);

      expect(sets.map((s) => [s.weight.value.toNumber(), s.target])).toEqual([
        [100, { min: 11, max: 11 }],
        [100, { min: 11, max: 11 }],
        [0, { min: 10, max: 10 }],
      ]);
    });

    it('a lowest-sets load rule moves the lowest working sets, not the one at no weight', () => {
      const sets = nextWithThirdSetAs('working', [
        ProgressionRule.load(new BigNumber(2.5), { type: 'lowestSets', pick: 'all' }),
      ]);

      expect(sets.map((s) => s.weight.value.toNumber())).toEqual([102.5, 102.5, 0]);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { PlanPositionSource, SessionService } from '@/services/session-service';
import {
  PlannedWarmupSet,
  ProgressionRule,
  SessionBlueprint,
  WeightedExerciseBlueprint,
  WeightedExerciseBlueprintInit,
} from '@/models/blueprint-models';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import { v4 as uuid } from 'uuid';
import { PotentialSet, RecordedSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import type { WorkingListKind } from '@/models/session-models/set-kind';
import { todaysTarget } from '@/models/session-models/todays-target';
import { nextTargets } from '@/models/workout-summary';
import { storedSessionsReducer, upsertStoredSessions } from '@/store/stored-sessions';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';
import type { RootState } from '@/store';

function makeState(overrides?: { workoutSession?: Session; orderedSessions?: Session[] }): RootState {
  const active = overrides?.workoutSession;
  return {
    settings: { useImperialUnits: false },
    storedSessions: {
      sessions: active ? { [active.id]: active } : {},
      activeSessionId: active?.id,
    },
  } as unknown as RootState;
}

/** `orderedSessions` latest first, as `WorkoutRepository.latestPlanned` reads them. */
function makeService(state: RootState, orderedSessions: Session[] = []) {
  const workoutRepository: PlanPositionSource = {
    latestPlanned: () => Promise.resolve(orderedSessions.find((x) => !x.isFreeform)),
  };
  return new SessionService(workoutRepository, () => state);
}

async function collect(iter: AsyncIterableIterator<Session>, count: number): Promise<Session[]> {
  const out: Session[] = [];
  for await (const session of iter) {
    out.push(session);
    if (out.length >= count) break;
  }
  return out;
}

function bp(name: string, notes = '') {
  return new SessionBlueprint(name, [], notes);
}

describe('SessionService.getUpcomingSessions', () => {
  it('walks the plan in order and cycles when there is no history', async () => {
    const plan = [bp('Push'), bp('Pull'), bp('Legs')];
    const service = makeService(makeState());

    const upcoming = await collect(service.getUpcomingSessions(plan, {}), 6);

    expect(upcoming.map((s) => s.blueprint.name)).toEqual(['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs']);
  });

  it('advances past duplicate-named workouts instead of stalling', async () => {
    // Regression: matching the next workout by name resolved duplicates to the
    // first occurrence, trapping progression on it forever.
    const plan = [bp('Upper'), bp('Lower'), bp('Lower', 'second'), bp('Cardio')];
    const service = makeService(makeState());

    const upcoming = await collect(service.getUpcomingSessions(plan, {}), 8);

    expect(upcoming.map((s) => s.blueprint.name)).toEqual([
      'Upper',
      'Lower',
      'Lower',
      'Cardio',
      'Upper',
      'Lower',
      'Lower',
      'Cardio',
    ]);
    // The second "Lower" must be the distinct blueprint, not a repeat of the first.
    expect(upcoming[2]!.blueprint.notes).toBe('second');
  });

  it('continues from the last completed session', async () => {
    const plan = [bp('Push'), bp('Pull'), bp('Legs')];
    const service = makeService(makeState());
    const completed = service.hydrateSessionFromBlueprint(bp('Pull'), {});

    const upcoming = await collect(makeService(makeState(), [completed]).getUpcomingSessions(plan, {}), 3);

    expect(upcoming.map((s) => s.blueprint.name)).toEqual(['Legs', 'Push', 'Pull']);
  });

  it('restarts the plan when the last session is no longer in the plan', async () => {
    const plan = [bp('Push'), bp('Pull')];
    const stale = makeService(makeState()).hydrateSessionFromBlueprint(bp('Removed'), {});

    const upcoming = await collect(makeService(makeState(), [stale]).getUpcomingSessions(plan, {}), 3);

    expect(upcoming.map((s) => s.blueprint.name)).toEqual(['Push', 'Pull', 'Push']);
  });

  it('repeats a single-workout plan', async () => {
    const plan = [bp('Full Body')];
    const upcoming = await collect(makeService(makeState()).getUpcomingSessions(plan, {}), 3);

    expect(upcoming.map((s) => s.blueprint.name)).toEqual(['Full Body', 'Full Body', 'Full Body']);
  });

  it('yields nothing for an empty plan', async () => {
    const upcoming = await collect(makeService(makeState()).getUpcomingSessions([], {}), 3);
    expect(upcoming).toHaveLength(0);
  });

  it('gives every upcoming session a unique id', async () => {
    const plan = [bp('A'), bp('B')];
    const upcoming = await collect(makeService(makeState()).getUpcomingSessions(plan, {}), 6);
    expect(new Set(upcoming.map((s) => s.id)).size).toBe(upcoming.length);
  });
});

describe('SessionService rep targets', () => {
  async function upcoming(blueprint: WeightedExerciseBlueprint, latest?: RecordedWeightedExercise) {
    const service = makeService(makeState());
    const [session] = await collect(
      service.getUpcomingSessions(
        [new SessionBlueprint('Day', [blueprint], '')],
        latest ? { [blueprint.progressionKey()]: latest } : {},
      ),
      1,
    );
    return session!.recordedExercises[0] as RecordedWeightedExercise;
  }

  it('seeds targets from the blueprint when the exercise has no history', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 2, repsConfig: { type: 'range', min: 8, max: 12 } });

    expect((await upcoming(blueprint)).potentialSets.map((s) => s.target)).toEqual([
      { min: 8, max: 12 },
      { min: 8, max: 12 },
    ]);
  });

  it('carries last session’s targets forward alongside its weights', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 2, resistance: 'none' });
    const lastWeek = makeRecordedExercise(blueprint, [10, 10]).withAllSets((s) =>
      s.with({ target: { min: 15, max: 15 } }),
    );

    expect((await upcoming(blueprint, lastWeek)).potentialSets.map((s) => s.target)).toEqual([
      { min: 15, max: 15 },
      { min: 15, max: 15 },
    ]);
  });

  it('does not progress the load of an exercise that tracks none', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 2, resistance: 'none' });
    const lastWeek = makeRecordedExercise(blueprint, [10, 10], new Weight(60, 'kilograms'));

    const weights = (await upcoming(blueprint, lastWeek)).potentialSets.map((s) => s.weight.value.toNumber());

    expect(lastWeek.isSuccessForProgressiveOverload).toBe(true);
    expect(weights).toEqual([60, 60]);
  });

  it('starts the new session with nothing recorded', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 2 });
    const lastWeek = makeRecordedExercise(blueprint, [10, 10]);

    expect((await upcoming(blueprint, lastWeek)).potentialSets.every((s) => s.set === undefined)).toBe(true);
  });

  it('does not carry last session’s RPE into the next one', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 2 });
    const lastWeek = makeRecordedExercise(blueprint, [10, 10]).withRpe(0, 8).withRpe(1, 9);

    expect((await upcoming(blueprint, lastWeek)).potentialSets.map((s) => s.rpe)).toEqual([undefined, undefined]);
  });

  it('carries a target a reps rule won, even on an exercise that also carries load', async () => {
    const blueprint = makeWeightedBlueprint({
      sets: 2,
      repsConfig: { type: 'fixed', reps: 8 },
      progression: [
        ProgressionRule.of({ axis: 'reps', step: new BigNumber(1), ceiling: new BigNumber(12) }),
        ProgressionRule.load(new BigNumber(2.5)),
      ],
    });
    const lastWeek = makeRecordedExercise(blueprint, [10, 10]).withAllSets((s) =>
      s.with({ target: { min: 10, max: 10 } }),
    );

    // Climbed to 10 by the rule, so the next session starts from 10 and the rule takes it to 11.
    expect((await upcoming(blueprint, lastWeek)).potentialSets.map((s) => s.target)).toEqual([
      { min: 11, max: 11 },
      { min: 11, max: 11 },
    ]);
  });

  it('re-seeds the target from the plan when reps are a fixed prescription', async () => {
    // Nothing but an edit to the plan could have moved this target, and that edit already had its
    // own say in the save-changes dialog - carrying it would be a second, silent yes.
    const blueprint = makeWeightedBlueprint({ sets: 2, repsConfig: { type: 'fixed', reps: 5 } });
    const lastWeek = makeRecordedExercise(blueprint, [10, 10]).withAllSets((s) =>
      s.with({ target: { min: 8, max: 8 } }),
    );

    expect((await upcoming(blueprint, lastWeek)).potentialSets.map((s) => s.target)).toEqual([
      { min: 5, max: 5 },
      { min: 5, max: 5 },
    ]);
  });

  it('gives every set the edited target once the plan agrees, including one logged before the edit', async () => {
    // Editing reps mid-exercise leaves already-logged sets chasing the old target, by design. Once
    // the edit is saved to the plan the next session must not still be carrying that stale first set.
    const edited = makeWeightedBlueprint({ sets: 3, repsConfig: { type: 'fixed', reps: 8 } });
    const lastWeek = makeRecordedExercise(edited, [10, 10, 10]).with({
      potentialSets: [
        { min: 5, max: 5 },
        { min: 8, max: 8 },
        { min: 8, max: 8 },
      ].map((target, index) => makeRecordedExercise(edited, [10, 10, 10]).potentialSets[index]!.with({ target })),
    });

    expect((await upcoming(edited, lastWeek)).potentialSets.map((s) => s.target)).toEqual([
      { min: 8, max: 8 },
      { min: 8, max: 8 },
      { min: 8, max: 8 },
    ]);
  });

  it('opens on the plan’s sets when the previous session ran longer than the plan', async () => {
    const blueprint = makeWeightedBlueprint({
      sets: 2,
      repsConfig: {
        type: 'perSet',
        targets: [
          { min: 12, max: 12 },
          { min: 10, max: 10 },
        ],
      },
    });
    const lastWeek = makeRecordedExercise(blueprint, [12, 10, 10]);

    expect((await upcoming(blueprint, lastWeek)).potentialSets.map((s) => s.target)).toEqual([
      { min: 12, max: 12 },
      { min: 10, max: 10 },
    ]);
  });
});

describe('SessionService progressive overload', () => {
  async function upcomingWeights(blueprint: WeightedExerciseBlueprint, latest?: RecordedWeightedExercise) {
    const service = makeService(makeState());
    const [session] = await collect(
      service.getUpcomingSessions(
        [new SessionBlueprint('Day', [blueprint], '')],
        latest ? { [blueprint.progressionKey()]: latest } : {},
      ),
      1,
    );
    const exercise = session!.recordedExercises[0] as RecordedWeightedExercise;
    return exercise.potentialSets.map((s) => s.weight.value.toNumber());
  }

  it('raises the load after a session that hit every target', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 2 });
    const lastWeek = makeRecordedExercise(blueprint, [10, 10], new Weight(60, 'kilograms'));

    expect(lastWeek.isSuccessForProgressiveOverload).toBe(true);
    expect(await upcomingWeights(blueprint, lastWeek)).toEqual([62.5, 62.5]);
  });

  it('holds the load after a session whose best set missed its target', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 2 });
    const lastWeek = makeRecordedExercise(blueprint, [9, 8], new Weight(60, 'kilograms'));

    expect(await upcomingWeights(blueprint, lastWeek)).toEqual([60, 60]);
  });

  it('raises the load once the best set hit its target, though another set missed', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 2 });
    const lastWeek = makeRecordedExercise(blueprint, [10, 9], new Weight(60, 'kilograms'));

    expect(lastWeek.isSuccessForProgressiveOverload).toBe(false);
    expect(await upcomingWeights(blueprint, lastWeek)).toEqual([62.5, 62.5]);
  });

  it('raises the load when the best set hit its target and another was never filled out', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 2 });
    const lastWeek = makeRecordedExercise(blueprint, [10, undefined], new Weight(60, 'kilograms'));

    expect(await upcomingWeights(blueprint, lastWeek)).toEqual([62.5, 62.5]);
  });

  it('starts a fresh exercise at zero rather than progressing from nothing', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 2 });

    expect(await upcomingWeights(blueprint)).toEqual([0, 0]);
  });

  it('progresses a bodyweight exercise, which carries load on top of the lifter', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 2, resistance: 'bodyweight' });
    const lastWeek = makeRecordedExercise(blueprint, [10, 10], new Weight(10, 'kilograms'));

    expect(await upcomingWeights(blueprint, lastWeek)).toEqual([12.5, 12.5]);
  });

  it('leaves the load alone when the plan asks for no progression', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 2, progression: [] });
    const lastWeek = makeRecordedExercise(blueprint, [10, 10], new Weight(60, 'kilograms'));

    expect(await upcomingWeights(blueprint, lastWeek)).toEqual([60, 60]);
  });
});

describe('SessionService warm-ups', () => {
  const percent = (value: number, reps = 5): PlannedWarmupSet => ({ load: { type: 'percent', percent: value }, reps });
  const absolute = (weight: Weight, reps = 5): PlannedWarmupSet => ({ load: { type: 'absolute', weight }, reps });

  async function upcoming(
    blueprint: WeightedExerciseBlueprint,
    latest?: RecordedWeightedExercise,
    useImperialUnits = false,
  ) {
    const state = { ...makeState(), settings: { useImperialUnits } } as unknown as RootState;
    const [session] = await collect(
      makeService(state).getUpcomingSessions(
        [new SessionBlueprint('Day', [blueprint], '')],
        latest ? { [blueprint.progressionKey()]: latest } : {},
      ),
      1,
    );
    return session!.recordedExercises[0] as RecordedWeightedExercise;
  }
  const weights = (sets: { weight: Weight }[]) => sets.map((s) => s.weight.value.toNumber());

  it('takes a percentage of the heaviest working set after today’s progression', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 2, warmupSets: [percent(50), percent(70, 3)] });
    const lastWeek = makeRecordedExercise(blueprint, [10, 10], new Weight(100, 'kilograms')).withWeight(
      1,
      new Weight(120, 'kilograms'),
      'thisSet',
    );

    const exercise = await upcoming(blueprint, lastWeek);

    expect(weights(exercise.potentialSets)).toEqual([122.5, 122.5]);
    // 50% of 122.5 is 61.25 and 70% is 85.75, each to the nearest 2.5.
    expect(weights(exercise.warmupSets)).toEqual([62.5, 85]);
    expect(exercise.warmupSets.map((s) => s.target.max)).toEqual([5, 3]);
  });

  it('rounds to the exercise’s own load step', async () => {
    const blueprint = makeWeightedBlueprint({
      sets: 1,
      progression: [ProgressionRule.load(new BigNumber(5))],
      warmupSets: [percent(50)],
    });
    const lastWeek = makeRecordedExercise(blueprint, [9], new Weight(105, 'kilograms'));

    expect(weights((await upcoming(blueprint, lastWeek)).warmupSets)).toEqual([55]);
  });

  it('falls back to 5 lb when the exercise progresses on something else', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 1, progression: [], warmupSets: [percent(50)] });
    const lastWeek = makeRecordedExercise(blueprint, [10], new Weight(135, 'pounds'));

    const warmup = (await upcoming(blueprint, lastWeek, true)).warmupSets[0]!;
    expect(warmup.weight.unit).toBe('pounds');
    // 67.5 lb is exactly between 65 and 70; halves round up.
    expect(warmup.weight.value.toNumber()).toBe(70);
  });

  it('converts an absolute warm-up into the session’s unit and rounds it', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 1, warmupSets: [absolute(new Weight(20, 'kilograms'))] });
    const lastWeek = makeRecordedExercise(blueprint, [9], new Weight(135, 'pounds'));

    const warmup = (await upcoming(blueprint, lastWeek)).warmupSets[0]!;
    // 20 kg is 44.09 lb, to the nearest 2.5.
    expect(warmup.weight.unit).toBe('pounds');
    expect(warmup.weight.value.toNumber()).toBe(45);
  });

  it('uses the preferred unit for a fresh exercise with no working weight yet', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 1, warmupSets: [absolute(new Weight(20, 'kilograms'))] });

    const warmup = (await upcoming(blueprint, undefined, true)).warmupSets[0]!;
    expect(warmup.weight.unit).toBe('pounds');
    expect(warmup.weight.value.toNumber()).toBe(45);
  });

  it('never goes below zero', async () => {
    const blueprint = makeWeightedBlueprint({
      sets: 1,
      resistance: 'bodyweight',
      warmupSets: [absolute(new Weight(-10, 'kilograms'))],
    });

    expect(weights((await upcoming(blueprint)).warmupSets)).toEqual([0]);
  });

  it('puts no weight on a warm-up for an exercise with no resistance', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 1, resistance: 'none', warmupSets: [percent(50)] });
    const lastWeek = makeRecordedExercise(blueprint, [10], new Weight(60, 'kilograms'));

    expect(weights((await upcoming(blueprint, lastWeek)).warmupSets)).toEqual([0]);
  });

  it('rebuilds warm-ups from the plan instead of carrying last session’s', async () => {
    const blueprint = makeWeightedBlueprint({ sets: 1, warmupSets: [percent(50)] });
    const lastWeek = makeRecordedExercise(blueprint, [9], new Weight(100, 'kilograms'))
      .withWarmupsFromPlan('kilograms')
      .withWarmupWeight(0, new Weight(80, 'kilograms'))
      .withWarmupRepCount(0, 2, OffsetDateTime.now());

    const warmup = (await upcoming(blueprint, lastWeek)).warmupSets[0]!;
    expect(warmup.weight.value.toNumber()).toBe(50);
    expect(warmup.set).toBeUndefined();
    expect(warmup.target).toEqual({ min: 5, max: 5 });
  });

  it('leaves working-set carry-over as it was, whatever last session’s warm-ups did', async () => {
    const plain = makeWeightedBlueprint({ sets: 2 });
    const withPlan = plain.with({ warmupSets: [percent(50), percent(70, 3)] });
    const lastWeek = makeRecordedExercise(plain, [10, 10], new Weight(60, 'kilograms'));
    const lastWeekWithWarmups = makeRecordedExercise(withPlan, [10, 10], new Weight(60, 'kilograms'))
      .withWarmupsFromPlan('kilograms')
      .withWarmupRepCount(0, 1, OffsetDateTime.now());

    const without = await upcoming(plain, lastWeek);
    const withWarmups = await upcoming(withPlan, lastWeekWithWarmups);

    expect(withPlan.progressionKey()).toBe(plain.progressionKey());
    expect(withWarmups.potentialSets.map((s) => [s.weight.value.toNumber(), s.target])).toEqual(
      without.potentialSets.map((s) => [s.weight.value.toNumber(), s.target]),
    );
  });
});

describe('SessionService carry over from the best set', () => {
  const at = (day: number, minute: number) =>
    OffsetDateTime.parse(`2026-09-${String(day).padStart(2, '0')}T10:${String(minute).padStart(2, '0')}:00Z`);

  type Slot = [kg: number, reps: number | undefined, kind?: WorkingListKind];

  const press = (init: WeightedExerciseBlueprintInit = {}) =>
    makeWeightedBlueprint({ name: 'Barbell Shoulder Press', progression: [], ...init });

  /** `slots` logged against `blueprint`'s targets, a minute apart on `day`, as the session's own plan. */
  function performed(blueprint: WeightedExerciseBlueprint, slots: Slot[], warmups: Slot[] = [], day = 29) {
    const toSet = ([kg, reps, kind = 'working']: Slot, index: number, target = blueprint.repsTargetForSet(index)) =>
      PotentialSet.of({
        weight: new Weight(kg, 'kilograms'),
        target,
        kind,
        set:
          reps === undefined ? undefined : RecordedSet.of({ repsCompleted: reps, completionDateTime: at(day, index) }),
      });
    const plannedSets = slots.map(([, , kind = 'working'], i) => ({ reps: blueprint.repsTargetForSet(i), kind }));
    return new RecordedWeightedExercise(
      blueprint.with({ plannedSets }),
      slots.map((slot, index) => toSet(slot, index)),
      undefined,
      warmups.map((slot, index) => toSet(slot, index, { min: 5, max: 5 })),
    );
  }

  /** The next session of `plan` after `last`, keyed the way the store keys it: by `last`'s own key. */
  function next(plan: WeightedExerciseBlueprint, last: RecordedWeightedExercise) {
    const session = makeService(makeState()).hydrateSessionFromBlueprint(new SessionBlueprint('Push', [plan], ''), {
      [last.progressionKey()]: last,
    });
    return session.recordedExercises[0] as RecordedWeightedExercise;
  }

  const weights = (exercise: RecordedWeightedExercise) => exercise.potentialSets.map((s) => s.weight.value.toNumber());
  const kg = (value: number) => new Weight(value, 'kilograms');

  it('shows today’s 35 kg as next time’s target after a set was added and the routine kept as it was', () => {
    const routine = press({ sets: 3 });
    const sessionOf = (exercise: RecordedWeightedExercise, date: LocalDate) =>
      new Session(uuid(), new SessionBlueprint('Push', [routine], ''), [exercise], date, undefined, undefined);
    const lastWeek = sessionOf(
      performed(
        routine,
        [
          [30, 10],
          [30, 10],
          [30, 10],
        ],
        [],
        22,
      ),
      LocalDate.of(2026, 9, 22),
    );
    const today = sessionOf(
      performed(routine, [
        [35, 10],
        [35, 10],
        [35, 10],
        [35, 10],
      ]),
      LocalDate.of(2026, 9, 29),
    );
    const { latestExercises } = storedSessionsReducer(undefined, upsertStoredSessions([lastWeek, today]));

    const nextPush = makeService(makeState()).hydrateSessionFromBlueprint(
      new SessionBlueprint('Push', [routine], ''),
      latestExercises,
    );

    expect(weights(nextPush.recordedExercises[0] as RecordedWeightedExercise)).toEqual([35, 35, 35]);
    expect(nextTargets(nextPush, today)).toEqual([
      { name: 'Barbell Shoulder Press', weight: kg(35), reps: { min: 10, max: 10 } },
    ]);
  });

  it('progresses the same exercise planned twice in a routine as two lineages, paired by place', () => {
    const topSingle = press({ sets: 1, repsConfig: { type: 'fixed', reps: 3 } });
    const backOff = press({ sets: 3 });
    const routine = new SessionBlueprint('Push', [topSingle, backOff], '');
    // The back-off sets are logged after the single, so one lineage would open both on 60 kg.
    const single = performed(topSingle, [[100, 3]]);
    const backOffs = performed(backOff, [
      [60, 10],
      [60, 10],
      [60, 10],
    ]).withAllSets((set) => set.with({ set: set.set?.with({ completionDateTime: at(29, 30) }) }));
    const lastWeek = new Session(uuid(), routine, [single, backOffs], LocalDate.of(2026, 9, 29), undefined, undefined);
    const { latestExercises } = storedSessionsReducer(undefined, upsertStoredSessions([lastWeek]));

    const nextPush = makeService(makeState()).hydrateSessionFromBlueprint(routine, latestExercises);

    expect(nextPush.recordedExercises.map((e) => weights(e as RecordedWeightedExercise))).toEqual([
      [100],
      [60, 60, 60],
    ]);
  });

  it('opens a repeat the routine has never had from the exercise’s first lineage', () => {
    const last = performed(press({ sets: 3 }), [
      [60, 10],
      [60, 10],
      [60, 10],
    ]);
    const routine = new SessionBlueprint('Push', [press({ sets: 1 }), press({ sets: 3 })], '');

    const nextPush = makeService(makeState()).hydrateSessionFromBlueprint(routine, { [last.progressionKey()]: last });

    expect(nextPush.recordedExercises.map((e) => weights(e as RecordedWeightedExercise))).toEqual([[60], [60, 60, 60]]);
  });

  it('keeps the numbers when the routine has fewer sets than last time', () => {
    const last = performed(press({ sets: 4 }), [
      [40, 10],
      [40, 10],
      [40, 10],
      [40, 10],
    ]);

    expect(weights(next(press({ sets: 3 }), last))).toEqual([40, 40, 40]);
  });

  it('keeps the numbers when the routine has more sets than last time', () => {
    const last = performed(press({ sets: 3 }), [
      [40, 10],
      [40, 10],
      [40, 10],
    ]);

    expect(weights(next(press({ sets: 5 }), last))).toEqual([40, 40, 40, 40, 40]);
  });

  it('progresses from last time whatever its set count', () => {
    const plan = press({ sets: 3, progression: [ProgressionRule.load(new BigNumber(2.5))] });
    const last = performed(press({ sets: 4 }), [
      [40, 10],
      [40, 10],
      [40, 10],
      [40, 10],
    ]);

    expect(weights(next(plan, last))).toEqual([42.5, 42.5, 42.5]);
  });

  it('keeps the weight when the rep scheme changed, and takes the plan’s new reps', () => {
    const last = performed(press({ sets: 3, repsConfig: { type: 'fixed', reps: 8 } }), [
      [50, 8],
      [50, 8],
      [50, 8],
    ]);

    const nextTime = next(press({ sets: 3, repsConfig: { type: 'fixed', reps: 5 } }), last);

    expect(weights(nextTime)).toEqual([50, 50, 50]);
    expect(nextTime.potentialSets.map((s) => s.target)).toEqual([
      { min: 5, max: 5 },
      { min: 5, max: 5 },
      { min: 5, max: 5 },
    ]);
  });

  /** A plan whose working sets ask for different reps, `reps` in order: a pyramid or a back-off. */
  const shaped = (...reps: number[]) =>
    press({ plannedSets: reps.map((r) => ({ reps: { min: r, max: r }, kind: 'working' as const })) });

  it.each([
    ['first', [50, 40, 40]],
    ['middle', [40, 50, 40]],
    ['last', [40, 40, 50]],
  ])('opens straight sets all on the best weight when the best set came %s', (_, lastWeights) => {
    const last = performed(
      press({ sets: 3 }),
      lastWeights.map((w): Slot => [w, 10]),
    );

    const nextTime = next(press({ sets: 3 }), last);

    expect(weights(nextTime)).toEqual([50, 50, 50]);
    expect(todaysTarget(nextTime, last)?.weight).toEqual(kg(50));
  });

  it('carries a single heavy set added among lighter ones to every set', () => {
    const last = performed(press({ sets: 3 }), [
      [30, 10],
      [30, 10],
      [30, 10],
      [30, 10],
      [40, 5],
    ]);

    expect(weights(next(press({ sets: 3 }), last))).toEqual([40, 40, 40]);
  });

  it('carries a single heavy set among lighter ones within the routine’s sets to every set', () => {
    const last = performed(press({ sets: 3 }), [
      [30, 10],
      [40, 5],
      [30, 10],
    ]);

    expect(weights(next(press({ sets: 3 }), last))).toEqual([40, 40, 40]);
  });

  it('keeps a pyramid’s gaps below its top set when the top set moves', () => {
    const last = performed(shaped(12, 10, 8), [
      [60, 12],
      [70, 10],
      [80, 8],
      [85, 8],
    ]);

    expect(weights(next(shaped(12, 10, 8), last))).toEqual([65, 75, 85]);
  });

  it('keeps a back-off set’s gap below the top set, and opens an added set on the best weight', () => {
    const last = performed(shaped(5, 10, 10), [
      [100, 5],
      [80, 10],
      [80, 10],
    ]);

    expect(weights(next(shaped(5, 10, 10), last))).toEqual([100, 80, 80]);
    expect(weights(next(shaped(5, 10), last))).toEqual([100, 80]);
    expect(weights(next(shaped(5, 10, 10, 10), last))).toEqual([100, 80, 80, 100]);
  });

  describe('a session logged only in part', () => {
    it('keeps a pyramid’s sets that were never lifted as they were loaded', () => {
      const last = performed(shaped(12, 10, 8), [
        [65, 12],
        [75, undefined],
        [85, undefined],
      ]);

      expect(weights(next(shaped(12, 10, 8), last))).toEqual([65, 75, 85]);
    });

    it('never opens the set that was done below its own weight', () => {
      const last = performed(shaped(12, 10, 10), [
        [40, 12],
        [50, undefined],
        [50, undefined],
      ]);

      expect(weights(next(shaped(12, 10, 10), last))).toEqual([40, 50, 50]);
    });

    it('opens straight sets on the weight that was done, not the heavier one left unlogged', () => {
      const last = performed(press({ sets: 3 }), [
        [40, 10],
        [50, undefined],
        [50, undefined],
      ]);

      expect(weights(next(press({ sets: 3 }), last))).toEqual([40, 40, 40]);
    });
  });

  it('ignores warm-up, drop and myo sets, however heavy', () => {
    const plan = press({
      plannedSets: [
        { reps: { min: 10, max: 10 }, kind: 'working' },
        { reps: { min: 10, max: 10 }, kind: 'working' },
        { reps: { min: 10, max: 10 }, kind: 'drop' },
        { reps: { min: 10, max: 10 }, kind: 'myo' },
      ],
      progression: [ProgressionRule.load(new BigNumber(2.5))],
    });
    const last = performed(
      plan,
      [
        [40, 10],
        [40, 10],
        [60, 4, 'drop'],
        [70, 3, 'myo'],
      ],
      [[100, 5]],
    );

    const nextTime = next(plan, last);

    expect(nextTime.potentialSets.map((s) => [s.kind, s.weight.value.toNumber()])).toEqual([
      ['working', 42.5],
      ['working', 42.5],
      ['drop', 60],
      ['myo', 70],
    ]);
    expect(todaysTarget(nextTime, last)?.reason).toEqual({
      kind: 'weightUp',
      by: kg(2.5),
      lastTime: { sets: 2, reps: 10 },
    });
  });

  describe('the add weight rule', () => {
    const plan = press({ sets: 3, progression: [ProgressionRule.load(new BigNumber(2.5))] });

    it('adds weight once the best set hit its target, whatever the other sets did', () => {
      const last = performed(plan, [
        [40, 8],
        [40, 10],
        [40, 6],
      ]);

      expect(weights(next(plan, last))).toEqual([42.5, 42.5, 42.5]);
    });

    it('holds the weight when the best set fell short, though a lighter set hit its target', () => {
      const last = performed(plan, [
        [40, 10],
        [40, 10],
        [45, 8],
      ]);

      expect(weights(next(plan, last))).toEqual([45, 45, 45]);
    });

    it('waits behind a rep ladder that not every set has climbed yet', () => {
      const ladder = press({
        sets: 3,
        progression: [
          ProgressionRule.of({ axis: 'reps', step: new BigNumber(1), ceiling: new BigNumber(12) }),
          ProgressionRule.load(new BigNumber(2.5)),
        ],
      });
      const last = performed(ladder, [
        [40, 10],
        [40, 10],
        [40, 9],
      ]);

      const nextTime = next(ladder, last);

      expect(weights(nextTime)).toEqual([40, 40, 40]);
      expect(nextTime.potentialSets.map((s) => s.target.max)).toEqual([10, 10, 10]);
    });
  });

  it('climbs a set added to the routine from the best set’s rung when reps are progressed', () => {
    const ladder = press({
      sets: 3,
      repsConfig: { type: 'fixed', reps: 8 },
      progression: [ProgressionRule.of({ axis: 'reps', step: new BigNumber(1), ceiling: new BigNumber(15) })],
    });
    const last = performed(ladder, [
      [40, 12],
      [40, 12],
      [40, 12],
    ]).withAllSets((s) => s.with({ target: { min: 12, max: 12 } }));

    expect(next(ladder.withSets(4), last).potentialSets.map((s) => s.target.max)).toEqual([13, 13, 13, 13]);
  });
});

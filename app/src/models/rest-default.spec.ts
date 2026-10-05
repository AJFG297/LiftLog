import { describe, expect, it } from 'vitest';
import { Duration, LocalDate } from '@js-joda/core';
import { ProgramBlueprint, Rest, SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { diffSessionBlueprints } from '@/models/blueprint-diff';
import {
  durationOfRestPick,
  programWithExerciseRest,
  REST_PICK_MINUTES,
  REST_PICK_SECONDS,
  restPickOf,
  routineExerciseLocation,
  routineExerciseRest,
  sessionWithExerciseRest,
  withMinRest,
} from '@/models/rest-default';
import { routineChanges } from '@/models/routine-update';
import { RecordedWeightedExercise } from '@/models/session-models';
import { makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { getPlanDiff } from '@/store/program/helpers';

const rest: Rest = {
  minRest: Duration.ofSeconds(150),
  maxRest: Duration.ofSeconds(180),
  failureRest: Duration.ofSeconds(300),
};
const seconds = (d: Duration) => d.toMillis() / 1000;
const restSeconds = (r: Rest | undefined) =>
  r && { minRest: seconds(r.minRest), maxRest: seconds(r.maxRest), failureRest: seconds(r.failureRest) };

function program(...sessions: SessionBlueprint[]) {
  return new ProgramBlueprint('Plan', sessions, LocalDate.of(2026, 9, 29));
}

const bench = makeWeightedBlueprint({ name: 'Bench Press', restBetweenSets: rest });
const press = makeWeightedBlueprint({ name: 'Overhead Press', restBetweenSets: rest });
const pushWorkout = () => makeSession([bench, press]).withName('Push');

describe('withMinRest', () => {
  it('writes the min rest and leaves the max and failure rest alone', () => {
    expect(restSeconds(withMinRest(rest, Duration.ofSeconds(120)))).toEqual({
      minRest: 120,
      maxRest: 180,
      failureRest: 300,
    });
  });

  it('raises the max rest to the new min when it would fall below it', () => {
    expect(restSeconds(withMinRest(rest, Duration.ofSeconds(240)))).toEqual({
      minRest: 240,
      maxRest: 240,
      failureRest: 300,
    });
  });
});

describe('routineExerciseLocation', () => {
  it("finds the exercise in the routine with the workout's name", () => {
    const legs = makeSession([makeWeightedBlueprint({ name: 'Squat' })]).withName('Legs').blueprint;
    const plan = program(legs, pushWorkout().blueprint);
    expect(routineExerciseLocation(plan, pushWorkout().blueprint, 1)).toEqual({ sessionIndex: 1, exerciseIndex: 1 });
  });

  it('follows the exercise when the workout was reordered', () => {
    const plan = program(pushWorkout().blueprint);
    const reordered = makeSession([press, bench]).withName('Push').blueprint;
    expect(routineExerciseLocation(plan, reordered, 1)).toEqual({ sessionIndex: 0, exerciseIndex: 0 });
  });

  it('matches the second of two same-named exercises with the second', () => {
    const twice = makeSession([bench, press, bench]).withName('Push').blueprint;
    expect(routineExerciseLocation(program(twice), twice, 2)).toEqual({ sessionIndex: 0, exerciseIndex: 2 });
  });

  it('finds nothing for a workout without a routine, or an exercise added today', () => {
    const plan = program(pushWorkout().blueprint);
    expect(routineExerciseLocation(plan, makeSession([bench]).withName('Freeform').blueprint, 0)).toBeUndefined();
    const added = makeSession([bench, press, makeWeightedBlueprint({ name: 'Dip' })]).withName('Push').blueprint;
    expect(routineExerciseLocation(plan, added, 2)).toBeUndefined();
  });
});

describe('saving a rest as the default', () => {
  it("writes the min rest to the routine's exercise and the workout's exercise", () => {
    const workout = pushWorkout();
    const plan = program(workout.blueprint);
    const location = routineExerciseLocation(plan, workout.blueprint, 0)!;
    const saved = withMinRest(rest, Duration.ofSeconds(120));

    const savedPlan = programWithExerciseRest(plan, location, saved);
    const savedWorkout = sessionWithExerciseRest(workout, 0, saved);

    expect(restSeconds(routineExerciseRest(savedPlan, location))).toEqual({
      minRest: 120,
      maxRest: 180,
      failureRest: 300,
    });
    const recorded = savedWorkout.recordedExercises[0] as RecordedWeightedExercise;
    expect(seconds(recorded.blueprint.restBetweenSets.minRest)).toBe(120);
    expect(seconds((savedWorkout.blueprint.exercises[0] as WeightedExerciseBlueprint).restBetweenSets.minRest)).toBe(
      120,
    );
    // The other exercise keeps its rest.
    expect(restSeconds(routineExerciseRest(savedPlan, { sessionIndex: 0, exerciseIndex: 1 }))!.minRest).toBe(150);
  });

  it('leaves nothing for the finish sheet to ask about', () => {
    const workout = pushWorkout();
    const plan = program(workout.blueprint);
    const saved = withMinRest(rest, Duration.ofSeconds(120));
    const location = routineExerciseLocation(plan, workout.blueprint, 0)!;

    const savedPlan = programWithExerciseRest(plan, location, saved);
    const savedWorkout = sessionWithExerciseRest(workout, 0, saved);

    expect(getPlanDiff(savedPlan, savedWorkout, 'plan')).toBeUndefined();
    // Saving to the workout alone would have been listed as a rest change.
    const rows = routineChanges(diffSessionBlueprints(plan.sessions[0]!, savedWorkout.blueprint));
    expect(rows.map((row) => row.kind)).toEqual(['rest']);
  });

  it('keeps a set count change made today for the finish sheet', () => {
    const workout = pushWorkout();
    const plan = program(workout.blueprint);
    const saved = withMinRest(rest, Duration.ofSeconds(120));
    const location = routineExerciseLocation(plan, workout.blueprint, 0)!;
    const withExtraSet = workout.withEditedExercise(0, bench.with({ sets: 4 }), false);

    const savedPlan = programWithExerciseRest(plan, location, saved);
    const savedWorkout = sessionWithExerciseRest(withExtraSet, 0, saved);

    const diff = getPlanDiff(savedPlan, savedWorkout, 'plan')!;
    expect(diff.type).toBe('diff');
    expect(routineChanges(diff.diff).map((row) => row.kind)).toEqual(['setCount']);
  });
});

describe('restPickOf', () => {
  const pick = (s: number) => restPickOf(Duration.ofSeconds(s));

  it('splits a rest into minutes and seconds', () => {
    expect(pick(150)).toEqual({ minutes: 2, seconds: 30 });
    expect(pick(0)).toEqual({ minutes: 0, seconds: 0 });
  });

  it('rounds to the nearest 5 seconds', () => {
    expect(pick(152)).toEqual({ minutes: 2, seconds: 30 });
    expect(pick(153)).toEqual({ minutes: 2, seconds: 35 });
    expect(restPickOf(Duration.ofMillis(152_500))).toEqual({ minutes: 2, seconds: 35 });
  });

  it('carries 60 seconds into the minutes', () => {
    expect(pick(58)).toEqual({ minutes: 1, seconds: 0 });
    expect(pick(598)).toEqual({ minutes: 10, seconds: 0 });
  });

  it('holds a rest past the last wheel position to 10:55', () => {
    expect(pick(655)).toEqual({ minutes: 10, seconds: 55 });
    expect(pick(658)).toEqual({ minutes: 10, seconds: 55 });
    expect(pick(700)).toEqual({ minutes: 10, seconds: 55 });
  });
});

describe('durationOfRestPick', () => {
  it('is the pick in seconds', () => {
    expect(seconds(durationOfRestPick({ minutes: 2, seconds: 30 }))).toBe(150);
    expect(seconds(durationOfRestPick({ minutes: 10, seconds: 55 }))).toBe(655);
  });

  it('round-trips every wheel position', () => {
    for (const minutes of REST_PICK_MINUTES) {
      for (const s of REST_PICK_SECONDS) {
        expect(restPickOf(durationOfRestPick({ minutes, seconds: s }))).toEqual({ minutes, seconds: s });
      }
    }
  });

  it('offers 0 to 10 minutes and 0 to 55 seconds in steps of 5', () => {
    expect(REST_PICK_MINUTES).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(REST_PICK_SECONDS).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });
});

describe('a rest picked for this workout only', () => {
  it('is offered to the routine when the workout finishes', () => {
    const workout = pushWorkout();
    const plan = program(workout.blueprint);
    const picked = durationOfRestPick({ minutes: 1, seconds: 45 });

    const changed = sessionWithExerciseRest(workout, 0, withMinRest(rest, picked));

    const rows = routineChanges(getPlanDiff(plan, changed, 'plan')!.diff);
    expect(rows).toEqual([expect.objectContaining({ kind: 'rest', exerciseName: 'Bench Press' })]);
    const row = rows[0] as Extract<(typeof rows)[number], { kind: 'rest' }>;
    expect([seconds(row.from), seconds(row.to)]).toEqual([150, 105]);
  });
});

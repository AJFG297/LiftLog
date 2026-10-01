import { describe, expect, it } from 'vitest';
import { LocalDate } from '@js-joda/core';
import { SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { exerciseGroupsOf, focusedGroupIndexOf } from '@/models/session-models/exercise-groups';
import { Session } from '@/models/session-models/session';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { workoutInProgressNextOf } from '@/models/home/workout-in-progress';

function workout(...exercises: [WeightedExerciseBlueprint, (number | undefined)[]][]): Session {
  return new Session(
    's',
    new SessionBlueprint(
      'Push',
      exercises.map(([bp]) => bp),
      '',
    ),
    exercises.map(([bp, reps]) => makeRecordedExercise(bp, reps)),
    LocalDate.of(2026, 9, 29),
    undefined,
    undefined,
  );
}

const bench = makeWeightedBlueprint({ name: 'Bench Press', sets: 5 });
const press = makeWeightedBlueprint({ name: 'Overhead Press', sets: 2 });

/** What the bar says, with the page the workout screen would open on (nothing pinned). */
function barNext(session: Session, pinnedExercise?: number) {
  const groups = exerciseGroupsOf(session.recordedExercises);
  return workoutInProgressNextOf(session, groups, focusedGroupIndexOf(session, groups, pinnedExercise));
}

describe('workoutInProgressNextOf', () => {
  it('names the next set of the exercise on screen, out of its working sets', () => {
    const session = workout([bench, [10, 10, undefined, undefined, undefined]], [press, [undefined, undefined]]);

    expect(barNext(session)).toEqual({
      kind: 'set',
      exerciseName: 'Bench Press',
      set: { kind: 'working', number: 3 },
      workingSets: 5,
    });
  });

  it('follows the page the user moved to, which is where resuming lands', () => {
    const session = workout([bench, [10, 10, undefined, undefined, undefined]], [press, [undefined, undefined]]);

    expect(barNext(session, 1)).toEqual({
      kind: 'set',
      exerciseName: 'Overhead Press',
      set: { kind: 'working', number: 1 },
      workingSets: 2,
    });
  });

  it('points to the next page once the page on screen is done', () => {
    const session = workout([bench, [10, 10, 10, 10, 10]], [press, [undefined, undefined]]);

    expect(barNext(session, 0)).toEqual({ kind: 'page', exerciseNames: ['Overhead Press'] });
  });

  it('says the workout is ready to finish when every set is logged', () => {
    const session = workout([bench, [10, 10, 10, 10, 10]], [press, [8, 8]]);

    expect(barNext(session, 1)).toEqual({ kind: 'finish' });
  });
});

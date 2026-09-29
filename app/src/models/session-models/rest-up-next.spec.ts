import { describe, expect, it } from 'vitest';
import { LocalDate } from '@js-joda/core';
import { SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { exerciseGroupsOf } from '@/models/session-models/exercise-groups';
import { restUpNextOf } from '@/models/session-models/rest-up-next';
import { Session } from '@/models/session-models/session';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';

function workout(...exercises: [WeightedExerciseBlueprint, (number | undefined)[]][]): Session {
  return new Session(
    's',
    new SessionBlueprint(
      'Push',
      exercises.map(([bp]) => bp),
      '',
    ),
    exercises.map(([bp, reps]) => {
      // The blueprint's set kinds carry onto the slots, as they do when a workout starts.
      const recorded = makeRecordedExercise(bp, reps);
      return recorded.with({
        potentialSets: recorded.potentialSets.map((slot, i) => slot.with({ kind: bp.plannedSets[i]!.kind })),
      });
    }),
    LocalDate.of(2026, 9, 29),
    undefined,
    undefined,
  );
}

const bench = makeWeightedBlueprint({ name: 'Bench Press', sets: 3 });
const press = makeWeightedBlueprint({ name: 'Overhead Press', sets: 2 });

function upNext(session: Session, focusedGroupIndex: number | undefined) {
  return restUpNextOf(session, exerciseGroupsOf(session.recordedExercises), focusedGroupIndex);
}

describe('restUpNextOf', () => {
  it('names the next set on the page on screen', () => {
    const session = workout([bench, [10, 10, undefined]], [press, [undefined, undefined]]);
    expect(upNext(session, 0)).toEqual({
      kind: 'set',
      exerciseName: 'Bench Press',
      set: { kind: 'working', number: 3 },
    });
  });

  it('numbers working sets only, and names another kind by its kind', () => {
    const withDrop = bench.with({
      plannedSets: [
        { reps: { min: 10, max: 10 }, kind: 'drop' },
        { reps: { min: 10, max: 10 }, kind: 'working' },
        { reps: { min: 10, max: 10 }, kind: 'drop' },
      ],
    });
    expect(upNext(workout([withDrop, [10, undefined, undefined]]), 0)).toEqual({
      kind: 'set',
      exerciseName: 'Bench Press',
      set: { kind: 'working', number: 1 },
    });
    expect(upNext(workout([withDrop, [10, 10, undefined]]), 0)).toEqual({
      kind: 'set',
      exerciseName: 'Bench Press',
      set: { kind: 'drop' },
    });
  });

  it('leads to the next page once the page on screen is done', () => {
    const session = workout([bench, [10, 10, 10]], [press, [undefined, undefined]]);
    expect(upNext(session, 0)).toEqual({ kind: 'page', exerciseNames: ['Overhead Press'] });
  });

  it('leads to the finish when nothing after the page is left', () => {
    const session = workout([bench, [10, 10, 10]], [press, [10, 10]]);
    expect(upNext(session, 1)).toEqual({ kind: 'finish' });
    expect(upNext(session, undefined)).toEqual({ kind: 'finish' });
  });
});

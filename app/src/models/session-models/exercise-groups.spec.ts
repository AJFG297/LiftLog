import { describe, expect, it } from 'vitest';
import { Session } from '@/models/session-models/session';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import {
  exerciseGroupsOf,
  exerciseLabelOf,
  exerciseStatusOf,
  focusedGroupIndexOf,
  groupMoveOrder,
  nextExerciseInGroup,
  setProgressOf,
  upNextGroupIndexOf,
  withGroupMoved,
} from '@/models/session-models/exercise-groups';
import { makeCardioBlueprint, makeSession, makeWeightedBlueprint, tick } from './__test__/helpers';

// Bench, Press, then Triceps + Fly as superset A, then Curl.
function pushSession(): Session {
  return makeSession([
    makeWeightedBlueprint({ name: 'Bench', sets: 3 }),
    makeWeightedBlueprint({ name: 'Press', sets: 3 }),
    makeWeightedBlueprint({ name: 'Triceps', sets: 3, supersetWithNext: true }),
    makeWeightedBlueprint({ name: 'Fly', sets: 3 }),
    makeWeightedBlueprint({ name: 'Curl', sets: 2 }),
  ]);
}

function logSet(session: Session, exerciseIndex: number, setIndex: number): Session {
  return session.withCycledExerciseReps(exerciseIndex, setIndex, tick());
}

function undoSet(session: Session, exerciseIndex: number, setIndex: number): Session {
  const exercise = session.recordedExercises[exerciseIndex] as RecordedWeightedExercise;
  return session.withExercise(exerciseIndex, exercise.withRepCount(setIndex, undefined, tick()));
}

function names(session: Session): string[] {
  return session.recordedExercises.map((exercise) => exercise.blueprint.name);
}

describe('exerciseGroupsOf', () => {
  it('puts a superset chain on one page and lettering follows workout order', () => {
    const session = makeSession([
      makeWeightedBlueprint({ name: 'A', supersetWithNext: true }),
      makeWeightedBlueprint({ name: 'B' }),
      makeWeightedBlueprint({ name: 'C' }),
      makeWeightedBlueprint({ name: 'D', supersetWithNext: true }),
      makeWeightedBlueprint({ name: 'E', supersetWithNext: true }),
      makeWeightedBlueprint({ name: 'F' }),
    ]);

    expect(exerciseGroupsOf(session.recordedExercises)).toEqual([
      { indices: [0, 1], supersetLetter: 'A' },
      { indices: [2], supersetLetter: undefined },
      { indices: [3, 4, 5], supersetLetter: 'B' },
    ]);
  });

  it('ignores the flag on the last exercise, which has nothing to join', () => {
    const session = makeSession([
      makeWeightedBlueprint({ name: 'A' }),
      makeWeightedBlueprint({ name: 'B', supersetWithNext: true }),
    ]);

    expect(exerciseGroupsOf(session.recordedExercises)).toEqual([
      { indices: [0], supersetLetter: undefined },
      { indices: [1], supersetLetter: undefined },
    ]);
  });

  it('never chains a cardio exercise onto the next one', () => {
    const session = makeSession([makeCardioBlueprint(), makeWeightedBlueprint({ name: 'B' })]);

    expect(exerciseGroupsOf(session.recordedExercises)).toEqual([
      { indices: [0], supersetLetter: undefined },
      { indices: [1], supersetLetter: undefined },
    ]);
  });

  it('is empty for a workout with no exercises', () => {
    expect(exerciseGroupsOf([])).toEqual([]);
  });
});

describe('exerciseLabelOf', () => {
  it('numbers lone exercises by position and supersets by letter and member', () => {
    const groups = exerciseGroupsOf(pushSession().recordedExercises);

    expect([0, 1, 2, 3, 4].map((index) => exerciseLabelOf(groups, index))).toEqual(['1', '2', 'A1', 'A2', '5']);
  });
});

describe('setProgressOf and exerciseStatusOf', () => {
  it('counts logged working sets out of planned ones', () => {
    const session = logSet(logSet(pushSession(), 0, 0), 0, 1);

    expect(setProgressOf(session.recordedExercises[0]!)).toEqual({ done: 2, total: 3 });
    expect(exerciseStatusOf(session.recordedExercises[0]!)).toBe('inProgress');
    expect(exerciseStatusOf(session.recordedExercises[1]!)).toBe('notStarted');
  });

  it('calls an exercise done once every working set is logged', () => {
    const session = logSet(logSet(pushSession(), 4, 0), 4, 1);

    expect(setProgressOf(session.recordedExercises[4]!)).toEqual({ done: 2, total: 2 });
    expect(exerciseStatusOf(session.recordedExercises[4]!)).toBe('done');
  });
});

describe('nextExerciseInGroup', () => {
  const superset = { indices: [2, 3], supersetLetter: 'A' };

  it('alternates between the members of a superset round by round', () => {
    let session = pushSession();
    const order: (number | undefined)[] = [];
    for (let round = 0; round < 3; round++) {
      for (const exerciseIndex of [2, 3]) {
        order.push(nextExerciseInGroup(session, superset));
        session = logSet(session, exerciseIndex, round);
      }
    }
    order.push(nextExerciseInGroup(session, superset));

    expect(order).toEqual([2, 3, 2, 3, 2, 3, undefined]);
  });

  it('goes back to the member whose set was undone', () => {
    let session = pushSession();
    session = logSet(session, 2, 0);
    session = logSet(session, 3, 0);
    session = logSet(session, 2, 1);
    expect(nextExerciseInGroup(session, superset)).toBe(3);

    session = undoSet(session, 2, 1);

    expect(nextExerciseInGroup(session, superset)).toBe(2);
  });

  it('asks for the member that is behind after the second member is undone', () => {
    let session = pushSession();
    session = logSet(session, 2, 0);
    session = logSet(session, 3, 0);
    session = undoSet(session, 3, 0);

    expect(nextExerciseInGroup(session, superset)).toBe(3);
  });

  it('picks the member furthest behind when the workout is focused elsewhere', () => {
    let session = pushSession();
    session = logSet(session, 3, 0);
    session = logSet(session, 0, 0);

    expect(nextExerciseInGroup(session, superset)).toBe(2);
  });
});

describe('focusedGroupIndexOf', () => {
  it('keeps the page the user chose', () => {
    const session = pushSession();
    const groups = exerciseGroupsOf(session.recordedExercises);

    expect(focusedGroupIndexOf(session, groups, 3)).toBe(2);
  });

  it('falls back to the page of the next set when the chosen exercise is gone', () => {
    const session = logSet(pushSession(), 1, 0);
    const groups = exerciseGroupsOf(session.recordedExercises);

    expect(focusedGroupIndexOf(session, groups, 9)).toBe(1);
    expect(focusedGroupIndexOf(session, groups, undefined)).toBe(1);
  });

  it('has no page for an empty workout', () => {
    const session = makeSession([]);

    expect(focusedGroupIndexOf(session, [], undefined)).toBeUndefined();
  });
});

describe('upNextGroupIndexOf', () => {
  it('leads to the next page that is not finished, then to Finish', () => {
    let session = pushSession();
    session = logSet(logSet(session, 4, 0), 4, 1);
    session = [0, 1, 2].reduce((s, set) => logSet(s, 1, set), session);
    const groups = exerciseGroupsOf(session.recordedExercises);

    expect(upNextGroupIndexOf(session, groups, 0)).toBe(2);
    expect(upNextGroupIndexOf(session, groups, 2)).toBeUndefined();
    expect(upNextGroupIndexOf(session, groups, 3)).toBeUndefined();
  });
});

describe('groupMoveOrder and withGroupMoved', () => {
  it('moves a superset as one unit', () => {
    const session = pushSession();
    const groups = exerciseGroupsOf(session.recordedExercises);

    expect(groupMoveOrder(groups, 2, 0)).toEqual([2, 3, 0, 1, 4]);
    const moved = withGroupMoved(session, 2, 0);
    expect(names(moved)).toEqual(['Triceps', 'Fly', 'Bench', 'Press', 'Curl']);
    expect(moved.blueprint.exercises.map((exercise) => exercise.name)).toEqual([
      'Triceps',
      'Fly',
      'Bench',
      'Press',
      'Curl',
    ]);
    expect(exerciseGroupsOf(moved.recordedExercises).map((group) => group.indices)).toEqual([[0, 1], [2], [3], [4]]);
  });

  it('moves a lone exercise past the end and keeps its logged sets', () => {
    const session = logSet(pushSession(), 0, 0);

    const moved = withGroupMoved(session, 0, 99);

    expect(names(moved)).toEqual(['Press', 'Triceps', 'Fly', 'Curl', 'Bench']);
    expect(setProgressOf(moved.recordedExercises[4]!)).toEqual({ done: 1, total: 3 });
  });

  it('clears a leftover superset flag on the last exercise once something follows it', () => {
    const session = makeSession([
      makeWeightedBlueprint({ name: 'A' }),
      makeWeightedBlueprint({ name: 'B', supersetWithNext: true }),
    ]);

    const moved = withGroupMoved(session, 0, 1);

    expect(names(moved)).toEqual(['B', 'A']);
    expect(
      moved.recordedExercises.map((exercise) => (exercise as RecordedWeightedExercise).blueprint.supersetWithNext),
    ).toEqual([false, false]);
    expect(exerciseGroupsOf(moved.recordedExercises)).toHaveLength(2);
  });

  it('leaves the session as it was when a group is dropped where it started', () => {
    const session = pushSession();

    expect(names(withGroupMoved(session, 1, 1))).toEqual(['Bench', 'Press', 'Triceps', 'Fly', 'Curl']);
  });
});

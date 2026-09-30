import { describe, expect, it } from 'vitest';
import { OffsetDateTime } from '@js-joda/core';
import { WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { exerciseGroupsOf } from '@/models/session-models/exercise-groups';
import { makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import {
  blueprintsForPick,
  customExerciseOf,
  equipmentChoiceOf,
  musclesForGroup,
  muscleGroupOf,
  pickerListOf,
  recentExerciseIds,
  sessionWithPickAdded,
  toggledPick,
  withPickAppended,
} from './exercise-picker';

function exercise(name: string, muscles: string[], equipment: string | null = null): ExerciseDescriptor {
  return { name, muscles, equipment, force: null, level: '', mechanic: null, instructions: '', category: '' };
}

const exercises: Record<string, ExerciseDescriptor> = {
  bench: exercise('Bench Press', ['chest', 'triceps'], 'barbell'),
  row: exercise('Barbell Row', ['middle back', 'biceps'], 'barbell'),
  curl: exercise('Hammer Curl', ['biceps'], 'dumbbell'),
  skull: exercise('Skull Crusher', ['triceps'], 'e-z curl bar'),
  raise: exercise('Lateral Raise', ['shoulders'], 'dumbbell'),
  pullup: exercise('Pull-up', ['lats'], 'body only'),
  neck: exercise('Neck Bridge', ['neck'], null),
};

const noFilters = { query: '', muscle: undefined, equipment: undefined };

function ids(list: ReturnType<typeof pickerListOf>) {
  return list.rows.map((row) =>
    row.kind === 'header' ? `# ${row.section}` : row.kind === 'create' ? `+ ${row.name}` : row.id,
  );
}

describe('muscleGroupOf', () => {
  it('files an exercise under its first muscle', () => {
    expect(muscleGroupOf(exercises.bench!)).toBe('chest');
    expect(muscleGroupOf(exercises.row!)).toBe('back');
    expect(muscleGroupOf(exercise('Squat', ['Quadriceps']))).toBe('legs');
  });

  it('files neck and no muscle under no chip', () => {
    expect(muscleGroupOf(exercises.neck!)).toBeUndefined();
    expect(muscleGroupOf(exercise('Mystery', []))).toBeUndefined();
  });
});

describe('equipmentChoiceOf', () => {
  it('keeps the catalog spelling, counts an E-Z bar as a barbell and anything else as Other', () => {
    expect(equipmentChoiceOf(exercises.curl!)).toBe('dumbbell');
    expect(equipmentChoiceOf(exercises.skull!)).toBe('barbell');
    expect(equipmentChoiceOf(exercise('Roll', [], 'foam roll'))).toBe('other');
    expect(equipmentChoiceOf(exercises.neck!)).toBe('other');
  });
});

describe('recentExerciseIds', () => {
  const at = (minute: number) => OffsetDateTime.parse(`2026-09-01T10:${String(minute).padStart(2, '0')}:00Z`);
  const done = (id: string, minute: number | undefined) => ({
    blueprint: { exerciseId: id },
    latestTime: minute === undefined ? undefined : at(minute),
  });

  it('lists newest first, once each, skipping unfinished and deleted exercises', () => {
    expect(
      recentExerciseIds(
        [done('bench', 1), done('curl', 5), done('bench', 9), done('gone', 10), done('raise', undefined), undefined],
        exercises,
      ),
    ).toEqual(['bench', 'curl']);
  });

  it('stops at the limit', () => {
    expect(recentExerciseIds([done('bench', 1), done('curl', 2), done('raise', 3)], exercises, 2)).toEqual([
      'raise',
      'curl',
    ]);
  });
});

describe('pickerListOf', () => {
  it('lists Recent, then every other exercise by name', () => {
    expect(ids(pickerListOf(exercises, ['raise', 'bench'], noFilters))).toEqual([
      '# recent',
      'raise',
      'bench',
      '# all',
      'row',
      'curl',
      'neck',
      'pullup',
      'skull',
    ]);
  });

  it('narrows both sections by muscle and names the section after it', () => {
    expect(ids(pickerListOf(exercises, ['curl'], { ...noFilters, muscle: 'arms' }))).toEqual([
      '# recent',
      'curl',
      '# arms',
      'skull',
    ]);
  });

  it('narrows by equipment', () => {
    expect(ids(pickerListOf(exercises, [], { ...noFilters, equipment: 'barbell' }))).toEqual([
      '# all',
      'row',
      'bench',
      'skull',
    ]);
  });

  it('ranks matches for a query, drops the Recent section, and offers the query as a new exercise', () => {
    expect(ids(pickerListOf(exercises, ['curl'], { ...noFilters, query: 'cr' }))).toEqual([
      '# matches',
      'skull',
      'curl',
      'bench',
      'neck',
      '+ cr',
    ]);
  });

  it('offers no new exercise when a name matches exactly', () => {
    expect(ids(pickerListOf(exercises, [], { ...noFilters, query: ' hammer curl ' }))).toEqual(['# matches', 'curl']);
  });

  it('reports no match when nothing matches the query and the chips', () => {
    expect(pickerListOf(exercises, [], { ...noFilters, query: 'zercher' })).toEqual({ rows: [], noMatch: true });
    expect(pickerListOf(exercises, [], { query: 'curl', muscle: 'legs', equipment: undefined }).noMatch).toBe(true);
  });
});

describe('toggledPick', () => {
  it('keeps tap order and closes the gap when one is taken out', () => {
    expect(toggledPick([], 'bench')).toEqual(['bench']);
    expect(toggledPick(['bench'], 'curl')).toEqual(['bench', 'curl']);
    expect(toggledPick(['bench', 'curl', 'raise'], 'curl')).toEqual(['bench', 'raise']);
  });
});

describe('customExerciseOf', () => {
  it('trims the name and keeps the muscles and equipment', () => {
    expect(customExerciseOf({ name: '  Zercher Squat ', muscles: ['quadriceps'], equipment: 'barbell' })).toEqual({
      name: 'Zercher Squat',
      category: '',
      equipment: 'barbell',
      force: null,
      instructions: '',
      level: 'beginner',
      mechanic: null,
      muscles: ['quadriceps'],
    });
    expect(customExerciseOf({ name: 'Plank', muscles: [], equipment: undefined }).equipment).toBeNull();
  });
});

describe('musclesForGroup', () => {
  it('starts with the muscle only when the chip has one', () => {
    expect(musclesForGroup('chest')).toEqual(['chest']);
    expect(musclesForGroup('core')).toEqual(['abdominals']);
    expect(musclesForGroup('legs')).toEqual([]);
    expect(musclesForGroup(undefined)).toEqual([]);
  });
});

const pick = [
  { id: 'raise', name: 'Lateral Raise' },
  { id: 'curl', name: 'Hammer Curl' },
  { id: 'bench', name: 'Bench Press' },
];

function summary(blueprints: readonly unknown[]) {
  return blueprints.map((b) => {
    const blueprint = b as WeightedExerciseBlueprint;
    return `${blueprint.name}:${blueprint.exerciseId}:${blueprint.plannedSets.length}x${blueprint.plannedSets[0]?.reps.min}:${blueprint.supersetWithNext ? 'link' : '-'}`;
  });
}

describe('blueprintsForPick', () => {
  it('makes 3 x 10 in tap order, linked as a superset up to the last', () => {
    expect(summary(blueprintsForPick(pick, true))).toEqual([
      'Lateral Raise:raise:3x10:link',
      'Hammer Curl:curl:3x10:link',
      'Bench Press:bench:3x10:-',
    ]);
    expect(summary(blueprintsForPick(pick, false))).toEqual([
      'Lateral Raise:raise:3x10:-',
      'Hammer Curl:curl:3x10:-',
      'Bench Press:bench:3x10:-',
    ]);
  });
});

describe('withPickAppended', () => {
  it('adds after the routine and clears a stranded flag on the old last exercise', () => {
    const routine = [
      makeWeightedBlueprint({ name: 'Squat', exerciseId: 'squat' }),
      makeWeightedBlueprint({ name: 'Deadlift', exerciseId: 'deadlift', supersetWithNext: true }),
    ];
    expect(summary(withPickAppended(routine, pick.slice(0, 2), true))).toEqual([
      'Squat:squat:3x10:-',
      'Deadlift:deadlift:3x10:-',
      'Lateral Raise:raise:3x10:link',
      'Hammer Curl:curl:3x10:-',
    ]);
  });

  it('leaves the routine alone for an empty pick', () => {
    const routine = [makeWeightedBlueprint({ name: 'Squat', exerciseId: 'squat', supersetWithNext: true })];
    expect(summary(withPickAppended(routine, [], true))).toEqual(['Squat:squat:3x10:link']);
  });
});

describe('sessionWithPickAdded', () => {
  it('adds the pick as one superset after the workout, which keeps its own groups', () => {
    const session = makeSession([
      makeWeightedBlueprint({ name: 'Squat', exerciseId: 'squat', supersetWithNext: true }),
    ]);
    const next = sessionWithPickAdded(session, pick, true, false);
    expect(next.recordedExercises.map((e) => e.blueprint.name)).toEqual([
      'Squat',
      'Lateral Raise',
      'Hammer Curl',
      'Bench Press',
    ]);
    expect(next.blueprint.exercises.map((e) => e.name)).toEqual([
      'Squat',
      'Lateral Raise',
      'Hammer Curl',
      'Bench Press',
    ]);
    expect(exerciseGroupsOf(next.recordedExercises).map((group) => group.indices)).toEqual([[0], [1, 2, 3]]);
  });

  it('returns the same workout for an empty pick', () => {
    const session = makeSession([makeWeightedBlueprint()]);
    expect(sessionWithPickAdded(session, [], false, false)).toBe(session);
  });
});

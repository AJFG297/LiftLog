import { blueprintsForPick, sessionWithPickAdded, withPickAppended } from '@/models/exercise-pick';
import { describe, expect, it } from 'vitest';
import { OffsetDateTime } from '@js-joda/core';
import { WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { exerciseGroupsOf } from '@/models/session-models/exercise-groups';
import { makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { customExerciseOf, equipmentChoiceOf, pickerListOf, loggedExerciseIds, toggledPick } from './exercise-picker';
import { CarryOver } from '@/models/session-models/carry-over';

const noHistory: CarryOver = { latest: {}, unit: 'kilograms' };

function exercise(
  name: string,
  primaryMuscles: string[],
  equipment: string | null = null,
  secondaryMuscles: string[] = [],
): ExerciseDescriptor {
  return {
    name,
    primaryMuscles,
    secondaryMuscles,
    equipment,
    force: null,
    level: '',
    mechanic: null,
    instructions: '',
    category: '',
  };
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
    row.kind === 'header'
      ? `# ${row.section}`
      : row.kind === 'create'
        ? `+ ${row.name}`
        : row.kind === 'filtered'
          ? `~ ${row.name}`
          : row.id,
  );
}

describe('equipmentChoiceOf', () => {
  it('keeps the catalog spelling, counts an E-Z bar as a barbell and anything else as Other', () => {
    expect(equipmentChoiceOf(exercises.curl!)).toBe('dumbbell');
    expect(equipmentChoiceOf(exercises.skull!)).toBe('barbell');
    expect(equipmentChoiceOf(exercise('Roll', [], 'foam roll'))).toBe('other');
    expect(equipmentChoiceOf(exercises.neck!)).toBe('other');
  });
});

describe('loggedExerciseIds', () => {
  const at = (minute: number) => OffsetDateTime.parse(`2026-09-01T10:${String(minute).padStart(2, '0')}:00Z`);
  const done = (id: string, minute: number | undefined) => ({
    blueprint: { exerciseId: id },
    latestTime: minute === undefined ? undefined : at(minute),
  });

  it('lists newest first, once each, skipping unfinished and deleted exercises', () => {
    expect(
      loggedExerciseIds(
        [done('bench', 1), done('curl', 5), done('bench', 9), done('gone', 10), done('raise', undefined), undefined],
        exercises,
      ),
    ).toEqual(['bench', 'curl']);
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

  it('lists an unnamed exercise after the named ones', () => {
    const withUnnamed = { blank: exercise('', [], null), ...exercises };
    expect(ids(pickerListOf(withUnnamed, [], noFilters)).slice(-2)).toEqual(['skull', 'blank']);
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
    // Both start a word with "c"; the shorter name ranks first, the recent Hammer Curl in no section of its own.
    expect(ids(pickerListOf(exercises, ['curl'], { ...noFilters, query: 'c' }))).toEqual([
      '# matches',
      'curl',
      'skull',
      '+ c',
    ]);
  });

  it('offers no new exercise when a name matches exactly', () => {
    expect(ids(pickerListOf(exercises, [], { ...noFilters, query: ' hammer curl ' }))).toEqual(['# matches', 'curl']);
  });

  it('reports no match when nothing matches the query and the chips', () => {
    expect(pickerListOf(exercises, [], { ...noFilters, query: 'zercher' })).toEqual({
      rows: [],
      count: 0,
      noMatch: true,
      hiddenByFilters: false,
      canCreate: true,
    });
    expect(pickerListOf(exercises, [], { query: 'curl', muscle: 'legs', equipment: undefined })).toEqual({
      rows: [],
      count: 0,
      noMatch: true,
      hiddenByFilters: true,
      canCreate: true,
    });
  });

  it('offers no new exercise when the chips hide one named exactly that', () => {
    expect(pickerListOf(exercises, [], { ...noFilters, query: 'hammer curl', equipment: 'barbell' })).toEqual({
      rows: [],
      count: 0,
      noMatch: true,
      hiddenByFilters: true,
      canCreate: false,
    });
    const withDumbbellBench = {
      ...exercises,
      dbBench: exercise('Dumbbell Bench Press', ['chest'], 'dumbbell'),
    };
    const list = pickerListOf(withDumbbellBench, [], { ...noFilters, query: 'bench press', equipment: 'dumbbell' });
    expect(ids(list)).toEqual(['# matches', 'dbBench', '~ Bench Press']);
    expect(list.canCreate).toBe(false);
  });

  describe('when swapping', () => {
    const withCurls = {
      ...exercises,
      bbCurl: exercise('Barbell Curl', ['biceps'], 'barbell'),
      cableCurl: exercise('Cable Curl', ['biceps'], 'cable'),
      kickback: exercise('Kickback', ['triceps'], 'dumbbell'),
    };

    it('opens on Similar (same muscle group: main muscle, recent, equipment, name), then Recent, then the rest', () => {
      const list = pickerListOf(withCurls, ['skull', 'bench'], noFilters, { swapping: 'curl' });
      expect(ids(list)).toEqual([
        '# similar',
        'bbCurl',
        'cableCurl',
        'skull',
        'kickback',
        '# recent',
        'bench',
        '# all',
        'row',
        'curl',
        'raise',
        'neck',
        'pullup',
      ]);
      expect(list.count).toBe(10);
    });

    it('lets the chips narrow Similar too', () => {
      expect(ids(pickerListOf(withCurls, [], { ...noFilters, equipment: 'barbell' }, { swapping: 'curl' }))).toEqual([
        '# similar',
        'bbCurl',
        'skull',
        '# all',
        'row',
        'bench',
      ]);
    });

    it('caps Similar so it stays a shortcut', () => {
      const chest = Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [
          `press${i}`,
          exercise(`Press ${'ABCDEFGHIJKL'[i]}`, ['chest'], 'barbell'),
        ]),
      );
      const list = pickerListOf(chest, [], noFilters, { swapping: 'press0' });
      expect(ids(list).slice(0, 9)).toEqual(['# similar', ...Array.from({ length: 8 }, (_, i) => `press${i + 1}`)]);
      expect(list.count).toBe(12);
    });

    it('ranks a recent exercise into Similar ahead of more on the same equipment', () => {
      const legs = {
        squat: exercise('Squat', ['quadriceps'], 'barbell'),
        legPress: exercise('Leg Press', ['quadriceps'], 'machine'),
        ...Object.fromEntries(
          Array.from({ length: 9 }, (_, i) => [
            `squat${i}`,
            exercise(`Squat ${'ABCDEFGHI'[i]}`, ['quadriceps'], 'barbell'),
          ]),
        ),
      };
      expect(ids(pickerListOf(legs, ['legPress'], noFilters, { swapping: 'squat' })).slice(0, 3)).toEqual([
        '# similar',
        'legPress',
        'squat0',
      ]);
    });

    it('leaves the swapped exercise out of Recent', () => {
      const list = pickerListOf(withCurls, ['curl', 'bench'], noFilters, { swapping: 'curl' });
      expect(ids(list).filter((id) => id === 'curl' || id.startsWith('#'))).toEqual([
        '# similar',
        '# recent',
        '# all',
        'curl',
      ]);
    });

    it('opens an exercise with no muscle group on the ones its name finds, logged first', () => {
      const withStub = { ...withCurls, stub: exercise('Curl', []) };
      expect(ids(pickerListOf(withStub, ['curl'], noFilters, { swapping: 'stub' })).slice(0, 5)).toEqual([
        '# similar',
        'curl',
        'bbCurl',
        'cableCurl',
        '# all',
      ]);
    });

    it('has no Similar when nothing else shares the name of an exercise with no muscle group, or once a search is typed', () => {
      expect(ids(pickerListOf(exercises, [], noFilters, { swapping: 'neck' }))[0]).toBe('# all');
      expect(ids(pickerListOf(withCurls, [], { ...noFilters, query: 'curl' }, { swapping: 'curl' }))[0]).toBe(
        '# matches',
      );
    });
  });

  it('ranks a recent exercise ahead of an otherwise equal match, but never ahead of an exact name', () => {
    const presses = {
      decline: exercise('Decline Press', ['chest'], 'barbell'),
      incline: exercise('Incline Press', ['chest'], 'barbell'),
      bench: exercise('Bench Press', ['chest'], 'barbell'),
      machine: exercise('Bench Press Machine', ['chest'], 'machine'),
    };
    const search = (query: string, recent: string[]) =>
      ids(pickerListOf(presses, recent, { ...noFilters, query })).filter((id) => !/^[#+~] /.test(id));
    expect(search('cline press', [])).toEqual(['decline', 'incline']);
    expect(search('cline press', ['incline'])).toEqual(['incline', 'decline']);
    expect(search('cline press', ['bench', 'machine', 'a', 'b', 'c', 'incline'])).toEqual(['incline', 'decline']);
    expect(search('bench press', ['machine'])).toEqual(['bench', 'machine']);
  });

  it('lists the five newest logged exercises under Recent', () => {
    const list = pickerListOf(exercises, ['bench', 'row', 'curl', 'skull', 'raise', 'pullup'], noFilters);
    expect(ids(list).slice(0, 8)).toEqual(['# recent', 'bench', 'row', 'curl', 'skull', 'raise', '# all', 'neck']);
  });

  it('treats a query with no words, such as "(", as no query', () => {
    expect(pickerListOf(exercises, ['curl'], { ...noFilters, query: ' ( ' })).toEqual(
      pickerListOf(exercises, ['curl'], noFilters),
    );
  });

  it('counts the exercises it lists, a recent one once', () => {
    expect(pickerListOf(exercises, [], noFilters).count).toBe(7);
    expect(pickerListOf(exercises, ['raise', 'bench'], noFilters).count).toBe(7);
    expect(pickerListOf(exercises, ['curl'], { ...noFilters, muscle: 'arms' }).count).toBe(2);
    expect(pickerListOf(exercises, ['curl'], { ...noFilters, query: 'c' }).count).toBe(2);
    expect(pickerListOf(exercises, [], { ...noFilters, query: 'zercher' }).count).toBe(0);
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
  it('trims the name and keeps the muscles, all primary, and the equipment', () => {
    expect(customExerciseOf({ name: '  Zercher Squat ', muscles: ['quadriceps'], equipment: 'barbell' })).toEqual({
      name: 'Zercher Squat',
      category: '',
      equipment: 'barbell',
      force: null,
      instructions: '',
      level: 'beginner',
      mechanic: null,
      primaryMuscles: ['quadriceps'],
      secondaryMuscles: [],
    });
    expect(customExerciseOf({ name: 'Plank', muscles: [], equipment: undefined }).equipment).toBeNull();
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
    const next = sessionWithPickAdded(session, pick, true, noHistory);
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
    expect(sessionWithPickAdded(session, [], false, noHistory)).toBe(session);
  });
});

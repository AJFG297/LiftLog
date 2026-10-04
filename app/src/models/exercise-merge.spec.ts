import { describe, expect, it } from 'vitest';
import { stubExerciseId } from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { stubDescriptor } from '@/models/exercise-resolver';
import { ExerciseMerge, ExerciseMergeInput, ExerciseUsage, planExerciseMerges } from '@/models/exercise-merge';
import { legacyStubExerciseId } from '@/models/legacy-exercise-name';

const builtInLunges: ExerciseDescriptor = {
  ...stubDescriptor('Dumbbell Lunges'),
  equipment: 'dumbbell',
  primaryMuscles: ['quadriceps'],
  instructions: 'Step forward.',
};

function plan(
  savedExercises: Record<string, ExerciseDescriptor>,
  usage: Record<string, ExerciseUsage> = {},
  overrides: Partial<ExerciseMergeInput> = {},
): ExerciseMerge[] {
  return planExerciseMerges({
    savedExercises,
    builtInNames: { 'Dumbbell Lunges': ['Dumbbell Lunges'] },
    builtInExercises: { 'Dumbbell Lunges': builtInLunges },
    hiddenBuiltInIds: [],
    usage,
    ...overrides,
  });
}

/** The exercise table after `merges`, as the applier leaves it. */
function applied(saved: Record<string, ExerciseDescriptor>, merges: ExerciseMerge[]) {
  const result = { ...saved };
  for (const merge of merges) {
    merge.mergedIds.forEach((id) => delete result[id]);
    if (merge.survivorDescriptor) {
      result[merge.survivor.id] = merge.survivorDescriptor;
    }
  }
  return result;
}

const used = (workouts: number, firstReferenceTimeMs: number): ExerciseUsage => ({ workouts, firstReferenceTimeMs });

describe('planExerciseMerges', () => {
  it('merges a stub plural into the user exercise of the singular, filling its empty fields', () => {
    const lungesStub = legacyStubExerciseId('Lunges');
    const saved = {
      'user-lunge': stubDescriptor('Lunge'),
      [lungesStub]: { ...stubDescriptor('Lunges'), equipment: 'bodyweight', instructions: 'Step.' },
    };

    expect(plan(saved, { 'user-lunge': used(3, 100), [lungesStub]: used(5, 50) })).toEqual([
      {
        normalizedName: 'lunge',
        survivor: { id: 'user-lunge', kind: 'user' },
        mergedIds: [lungesStub],
        survivorDescriptor: { ...stubDescriptor('Lunge'), equipment: 'bodyweight', instructions: 'Step.' },
      },
    ]);
  });

  it('keeps the user exercise in the most workouts, then the one first logged earliest', () => {
    const saved = {
      a: stubDescriptor('Curl'),
      b: stubDescriptor('Curls'),
      c: { ...stubDescriptor('curls'), primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'] },
    };

    expect(plan(saved, { a: used(4, 300), b: used(4, 200), c: used(1, 100) })).toEqual([
      {
        normalizedName: 'curl',
        survivor: { id: 'b', kind: 'user' },
        mergedIds: ['a', 'c'],
        survivorDescriptor: { ...stubDescriptor('Curls'), primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'] },
      },
    ]);
    // Never logged counts as newest.
    expect(plan(saved, { c: used(0, 100) })[0]!.survivor).toEqual({ id: 'c', kind: 'user' });
  });

  it('merges stubs alone into the stub already at the id the name now derives', () => {
    const lunge = legacyStubExerciseId('Lunge');
    const lunges = legacyStubExerciseId('Lunges');
    // The old fold gave "Lunge" the key the new one gives both, so its id already is the new one.
    expect(lunge).toBe(stubExerciseId('Lunges'));

    expect(
      plan({ [lunge]: stubDescriptor('Lunge'), [lunges]: stubDescriptor('Lunges') }, { [lunges]: used(2, 10) }),
    ).toEqual([
      {
        normalizedName: 'lunge',
        survivor: { id: lunge, kind: 'stub' },
        mergedIds: [lunges],
        survivorDescriptor: stubDescriptor('Lunge'),
      },
    ]);
  });

  it('merges stubs none of which is at the derived id there, named as the one logged most', () => {
    const spaced = legacyStubExerciseId('Bench  Press');
    const plain = legacyStubExerciseId('Bench Press');

    expect(
      plan(
        { [spaced]: stubDescriptor('Bench  Press'), [plain]: stubDescriptor('Bench Press') },
        { [spaced]: used(1, 5) },
      ),
    ).toEqual([
      {
        normalizedName: 'bench press',
        survivor: { id: stubExerciseId('Bench Press'), kind: 'stub' },
        mergedIds: [spaced, plain].sort(),
        survivorDescriptor: stubDescriptor('Bench  Press'),
      },
    ]);
  });

  it('moves a stub alone in its group to the id its name now derives', () => {
    // The old fold made it `bench pres`.
    const old = legacyStubExerciseId('Bench Press');
    expect(old).not.toBe(stubExerciseId('Bench Press'));

    expect(plan({ [old]: stubDescriptor('Bench Press') })).toEqual([
      {
        normalizedName: 'bench press',
        survivor: { id: stubExerciseId('Bench Press'), kind: 'stub' },
        mergedIds: [old],
        survivorDescriptor: stubDescriptor('Bench Press'),
      },
    ]);
  });

  it('merges into a built-in the new fold matches, leaving the built-in as it is', () => {
    const singular = legacyStubExerciseId('Dumbbell Lunge');

    expect(plan({ [singular]: stubDescriptor('dumbbell lunge') })).toEqual([
      {
        normalizedName: 'dumbbell lunge',
        survivor: { id: 'Dumbbell Lunges', kind: 'builtin' },
        mergedIds: [singular],
        survivorDescriptor: undefined,
      },
    ]);
    // A user exercise with more to say fills the built-in's empty fields, which makes it an edited built-in.
    const bare = { ...builtInLunges, instructions: '' };
    expect(
      plan(
        { u: { ...stubDescriptor('Dumbbell Lunge'), instructions: 'Mine.' } },
        {},
        {
          builtInExercises: { 'Dumbbell Lunges': bare },
        },
      ),
    ).toEqual([
      {
        normalizedName: 'dumbbell lunge',
        survivor: { id: 'Dumbbell Lunges', kind: 'builtin' },
        mergedIds: ['u'],
        survivorDescriptor: { ...bare, instructions: 'Mine.' },
      },
    ]);
  });

  it('leaves an exercise the user made beside a built-in of the same name', () => {
    expect(plan({ mine: stubDescriptor('Dumbbell Lunges') })).toEqual([]);
  });

  it('never merges into a built-in the user deleted', () => {
    const singular = legacyStubExerciseId('Dumbbell Lunge');
    expect(
      plan({ [singular]: stubDescriptor('Dumbbell Lunge') }, {}, { hiddenBuiltInIds: ['Dumbbell Lunges'] }),
    ).toEqual([]);
  });

  it('keeps names that only look plural apart', () => {
    expect(
      plan({
        ab: stubDescriptor('Ab'),
        abs: stubDescriptor('Abs'),
        press: stubDescriptor('Press'),
        series: stubDescriptor('Hip Thrust Series'),
        thrust: stubDescriptor('Hip Thrust'),
      }),
    ).toEqual([]);
  });

  it('never makes one id both a survivor and merged: a stub in the way moves first', () => {
    // "Bench Presss" folded to `bench press` before, so its stub sits at Bench Press's new id.
    const bench = legacyStubExerciseId('Bench Press');
    const typo = legacyStubExerciseId('Bench Presss');
    expect(typo).toBe(stubExerciseId('Bench Press'));
    const saved = { [bench]: stubDescriptor('Bench Press'), [typo]: stubDescriptor('Bench Presss') };

    const first = plan(saved);
    expect(first).toEqual([
      {
        normalizedName: 'bench presss',
        survivor: { id: stubExerciseId('Bench Presss'), kind: 'stub' },
        mergedIds: [typo],
        survivorDescriptor: stubDescriptor('Bench Presss'),
      },
    ]);
    const second = plan(applied(saved, first));
    expect(second).toEqual([
      {
        normalizedName: 'bench press',
        survivor: { id: typo, kind: 'stub' },
        mergedIds: [bench],
        survivorDescriptor: stubDescriptor('Bench Press'),
      },
    ]);
    expect(plan(applied(applied(saved, first), second))).toEqual([]);
  });

  it('keeps a stub where it is when its new id belongs to an exercise that stays', () => {
    const bench = legacyStubExerciseId('Bench Press');
    // A stub of "Bench Presss" the user renamed: it stays put, at Bench Press's new id.
    const renamed = legacyStubExerciseId('Bench Presss');
    expect(plan({ [bench]: stubDescriptor('Bench Press'), [renamed]: stubDescriptor('My press') })).toEqual([]);
    expect(
      plan(
        {
          [bench]: stubDescriptor('Bench Press'),
          [legacyStubExerciseId('Bench  Press')]: stubDescriptor('Bench  Press'),
          [renamed]: stubDescriptor('My press'),
        },
        { [legacyStubExerciseId('Bench  Press')]: used(1, 5) },
      ),
    ).toEqual([
      {
        normalizedName: 'bench press',
        survivor: { id: legacyStubExerciseId('Bench  Press'), kind: 'stub' },
        mergedIds: [bench],
        survivorDescriptor: stubDescriptor('Bench  Press'),
      },
    ]);
  });

  it('plans nothing once applied, and nothing for a user with no duplicates', () => {
    const saved = {
      'user-lunge': stubDescriptor('Lunge'),
      [legacyStubExerciseId('Lunges')]: stubDescriptor('Lunges'),
      [legacyStubExerciseId('Bench Press')]: stubDescriptor('Bench Press'),
      [legacyStubExerciseId('Dumbbell Lunge')]: stubDescriptor('Dumbbell Lunge'),
      [legacyStubExerciseId('Sissy Squat')]: stubDescriptor('Sissy Squat'),
      'user-curl': stubDescriptor('Curl'),
      'Dumbbell Lunges': { ...builtInLunges, name: 'My lunges' },
    };
    const merges = plan(saved);
    expect(merges.map((x) => x.normalizedName)).toEqual(['bench press', 'dumbbell lunge', 'lunge']);
    expect(plan(applied(saved, merges))).toEqual([]);
  });
});

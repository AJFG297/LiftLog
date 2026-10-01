import { BuiltInPrograms, unsavedBuiltInPrograms } from '@/models/built-in-programs';
import { WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { describe, expect, it } from 'vitest';

describe('built-in-programs', () => {
  it('exposes every shipped program', () => {
    expect(Object.keys(BuiltInPrograms)).toHaveLength(7);
  });

  it.each(Object.entries(BuiltInPrograms))('%s migrates to a stable weighted shape', (_id, program) => {
    const weighted = program.sessions.flatMap((session) =>
      session.exercises.filter((e): e is WeightedExerciseBlueprint => e.type === 'WeightedExerciseBlueprint'),
    );

    expect(
      weighted.map((exercise) => ({
        name: exercise.name,
        plannedSets: exercise.plannedSets,
        resistance: exercise.resistance,
        progression: exercise.progression.map((rule) => rule.toJSON()),
        progressionKey: exercise.progressionKey(),
      })),
    ).toMatchSnapshot();
  });
});

describe('unsavedBuiltInPrograms', () => {
  it('offers every built-in program while none is saved', () => {
    expect(unsavedBuiltInPrograms({}).map(([id]) => id)).toEqual([
      'a303c855-9ed7-4ff8-ae60-11e9a573193e',
      'ac80c322-3c0f-42ba-b837-cd998adee25a',
      '347607f0-67b8-4051-bfc2-3b73fccf92d8',
      '5072c29e-1de9-44e0-865f-f65a15e860f7',
      '0d0e0860-0555-4b43-bd93-350edd49c6bd',
      '890a285b-f883-4536-a1ce-cbc9e2d90399',
      '590a285b-f883-4536-a1ce-cdc9e2d90399',
    ]);
  });

  it("leaves out the ones already saved and ignores programs of the person's own", () => {
    const saved = {
      'ac80c322-3c0f-42ba-b837-cd998adee25a': {},
      '890a285b-f883-4536-a1ce-cbc9e2d90399': {},
      'my-own-program': {},
    };

    expect(unsavedBuiltInPrograms(saved).map(([id]) => id)).toEqual([
      'a303c855-9ed7-4ff8-ae60-11e9a573193e',
      '347607f0-67b8-4051-bfc2-3b73fccf92d8',
      '5072c29e-1de9-44e0-865f-f65a15e860f7',
      '0d0e0860-0555-4b43-bd93-350edd49c6bd',
      '590a285b-f883-4536-a1ce-cdc9e2d90399',
    ]);
  });
});

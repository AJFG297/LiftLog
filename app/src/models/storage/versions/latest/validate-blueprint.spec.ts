import { describe, it, expect } from 'vitest';
import { validateLatestProgramBlueprint } from '@/models/storage/versions/latest/validate-blueprint';
import type { ProgramBlueprintJSON } from '@/models/storage/versions/latest/blueprint';
import type { BigNumberJSON, DurationJSON, LocalDateJSON } from '@/models/storage/versions/libs';

const validBlueprint: ProgramBlueprintJSON = {
  version: 3,
  name: 'Test Plan',
  lastEdited: '2024-01-01' as LocalDateJSON,
  sessions: [
    {
      version: 8,
      name: 'Day 1',
      notes: '',
      exercises: [
        {
          type: 'WeightedExerciseBlueprint',
          name: 'Squat',
          plannedSets: [
            { reps: { min: 5, max: 5 }, kind: 'working' },
            { reps: { min: 5, max: 5 }, kind: 'working' },
            { reps: { min: 5, max: 5 }, kind: 'working' },
          ],
          restBetweenSets: {
            minRest: 'PT1M' as DurationJSON,
            maxRest: 'PT3M' as DurationJSON,
            failureRest: 'PT5M' as DurationJSON,
          },
          supersetWithNext: false,
          notes: '',
          link: '',
          progression: [
            { axis: 'load', step: '2.5' as BigNumberJSON, scope: { type: 'allSets' }, trigger: 'allSetsMetTarget' },
          ],
          resistance: 'external',
          warmupSets: [],
        },
      ],
    },
  ],
};

describe('validateLatestProgramBlueprint', () => {
  it('accepts a valid latest blueprint', () => {
    expect(validateLatestProgramBlueprint(validBlueprint).ok).toBe(true);
  });

  it('rejects a blueprint missing a required field, with a message', () => {
    const { version: _version, ...withoutVersion } = validBlueprint;
    const result = validateLatestProgramBlueprint(withoutVersion);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('rejects an unknown exercise type', () => {
    const bad = {
      ...validBlueprint,
      sessions: [{ ...validBlueprint.sessions[0]!, exercises: [{ type: 'NotARealExercise' }] }],
    };
    expect(validateLatestProgramBlueprint(bad).ok).toBe(false);
  });

  describe('warm-up sets', () => {
    const withWarmups = (warmupSets: unknown[]) => ({
      ...validBlueprint,
      sessions: [
        {
          ...validBlueprint.sessions[0]!,
          exercises: [{ ...validBlueprint.sessions[0]!.exercises[0]!, warmupSets }],
        },
      ],
    });

    it('accepts percent, absolute and reps-only warm-ups', () => {
      const result = validateLatestProgramBlueprint(
        withWarmups([
          { load: { type: 'absolute', weight: { unit: 'kilograms', value: '20' } }, reps: 5 },
          { load: { type: 'percent', percent: 50 }, reps: 5 },
          { reps: 8 },
        ]),
      );
      expect(result.ok).toBe(true);
    });

    it('rejects a weighted exercise without a warmupSets list', () => {
      const { warmupSets: _warmupSets, ...exercise } = validBlueprint.sessions[0]!.exercises[0] as Extract<
        ProgramBlueprintJSON['sessions'][number]['exercises'][number],
        { type: 'WeightedExerciseBlueprint' }
      >;
      const bad = { ...validBlueprint, sessions: [{ ...validBlueprint.sessions[0]!, exercises: [exercise] }] };
      expect(validateLatestProgramBlueprint(bad).ok).toBe(false);
    });

    it.each([
      ['a load with an unknown type', { load: { type: 'bar' }, reps: 5 }],
      ['a percent load without its percent', { load: { type: 'percent' }, reps: 5 }],
      ['an absolute load without a unit', { load: { type: 'absolute', weight: { value: '20' } }, reps: 5 }],
      ['a weight written as a number', { load: { type: 'absolute', weight: { unit: 'pounds', value: 45 } }, reps: 5 }],
      ['fractional reps', { load: { type: 'percent', percent: 50 }, reps: 2.5 }],
      ['no reps', { load: { type: 'percent', percent: 50 } }],
    ])('rejects %s', (_, warmup) => {
      expect(validateLatestProgramBlueprint(withWarmups([warmup])).ok).toBe(false);
    });
  });
});

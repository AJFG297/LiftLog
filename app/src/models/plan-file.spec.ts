import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProgramBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise } from '@/models/session-models';
import { parseProgramBlueprintFile, serializeProgramBlueprint } from '@/models/plan-file';
import type { ProgramBlueprintJSON, WeightedExerciseBlueprintJSON } from '@/models/storage/versions/latest/blueprint';
import type { ProgramBlueprintJSON as InitialProgramBlueprintJSON } from '@/models/storage/versions/initial';
import type { BigNumberJSON, DurationJSON, LocalDateJSON } from '@/models/storage/versions/libs';

const validBlueprint: ProgramBlueprintJSON = {
  version: 3,
  name: 'Test Plan',
  lastEdited: '2024-01-01' as LocalDateJSON,
  sessions: [
    {
      version: 10,
      name: 'Day 1',
      notes: '',
      exercises: [
        {
          type: 'WeightedExerciseBlueprint',
          name: 'Squat',
          exerciseId: 'Squat',
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

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe('plan-file', () => {
  it('round-trips a blueprint through serialize and parse', () => {
    const blueprint = ProgramBlueprint.fromJSON(validBlueprint);
    const result = parseProgramBlueprintFile(serializeProgramBlueprint(blueprint));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blueprint.toJSON()).toEqual(validBlueprint);
    }
  });

  it('imports a plan file that names its exercises without ids, leaving them to be linked', () => {
    const [session] = validBlueprint.sessions;
    const { exerciseId: _, ...exercise } = session!.exercises[0] as WeightedExerciseBlueprintJSON;
    const namesOnly: ProgramBlueprintJSON = { ...validBlueprint, sessions: [{ ...session!, exercises: [exercise] }] };
    const parsed = parseProgramBlueprintFile(new TextEncoder().encode(JSON.stringify(namesOnly)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const imported = parsed.blueprint.sessions[0]!.exercises[0]!;
      expect(imported.name).toBe('Squat');
      expect(imported.isLinked).toBe(false);
    }
  });

  it('round-trips warm-ups, loads and units included', () => {
    const [session] = validBlueprint.sessions;
    const [exercise] = session!.exercises;
    const withWarmups: ProgramBlueprintJSON = {
      ...validBlueprint,
      sessions: [
        {
          ...session!,
          exercises: [
            {
              ...(exercise as Extract<typeof exercise, { type: 'WeightedExerciseBlueprint' }>),
              warmupSets: [
                { load: { type: 'absolute', weight: { unit: 'pounds', value: '45' as BigNumberJSON } }, reps: 5 },
                { load: { type: 'percent', percent: 50 }, reps: 5 },
                { load: { type: 'percent', percent: 70 }, reps: 3 },
              ],
            },
          ],
        },
      ],
    };
    const result = parseProgramBlueprintFile(serializeProgramBlueprint(ProgramBlueprint.fromJSON(withWarmups)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blueprint.toJSON()).toEqual(withWarmups);
    }
  });

  // A plan written in pounds keeps its unit on import, so a kilo lifter's session converts the
  // weight rather than reading 45 lb as 45 kg.
  it('converts and rounds an imported absolute warm-up into the session unit', () => {
    const [session] = validBlueprint.sessions;
    const [exercise] = session!.exercises;
    const inPounds: ProgramBlueprintJSON = {
      ...validBlueprint,
      sessions: [
        {
          ...session!,
          exercises: [
            {
              ...(exercise as Extract<typeof exercise, { type: 'WeightedExerciseBlueprint' }>),
              warmupSets: [
                { load: { type: 'absolute', weight: { unit: 'pounds', value: '45' as BigNumberJSON } }, reps: 5 },
              ],
            },
          ],
        },
      ],
    };

    const result = parseProgramBlueprintFile(encode(inPounds));

    expect(result.ok).toBe(true);
    if (result.ok) {
      const imported = result.blueprint.sessions[0]!.exercises[0]!;
      if (!(imported instanceof WeightedExerciseBlueprint)) throw new Error('expected a weighted exercise');
      expect(imported.warmupSets[0]!.load).toMatchObject({ type: 'absolute', weight: { unit: 'pounds' } });
      // 45 lb is 20.4 kg, which rounds to the exercise's 2.5 increment.
      const [warmup] = RecordedWeightedExercise.empty(imported, 'kilograms').warmupSets;
      expect(warmup!.weight.toJSON()).toEqual({ unit: 'kilograms', value: '20' });
    }
  });

  it('gives a plan file written before warm-ups existed none', () => {
    const { warmupSets: _warmupSets, ...exercise } = validBlueprint.sessions[0]!.exercises[0] as Extract<
      ProgramBlueprintJSON['sessions'][number]['exercises'][number],
      { type: 'WeightedExerciseBlueprint' }
    >;
    const beforeWarmups = {
      ...validBlueprint,
      sessions: [{ ...validBlueprint.sessions[0]!, version: 6, exercises: [exercise] }],
    };

    const result = parseProgramBlueprintFile(encode(beforeWarmups));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blueprint.toJSON()).toEqual(validBlueprint);
    }
  });

  it('rejects a file that is not valid JSON', () => {
    const result = parseProgramBlueprintFile(new TextEncoder().encode('not json'));
    expect(result).toMatchObject({ ok: false, failure: 'notAPlan' });
  });

  it('migrates a legacy (v1) plan file to the latest version', () => {
    const v1: InitialProgramBlueprintJSON = {
      name: 'Legacy Plan',
      lastEdited: '2020-06-01' as LocalDateJSON,
      sessions: [
        {
          name: 'Day 1',
          notes: '',
          exercises: [
            {
              type: 'WeightedExerciseBlueprint',
              name: 'Bench',
              sets: 3,
              repsPerSet: 5,
              weightIncreaseOnSuccess: '2.5' as BigNumberJSON,
              restBetweenSets: {
                minRest: 'PT1M' as DurationJSON,
                maxRest: 'PT3M' as DurationJSON,
                failureRest: 'PT5M' as DurationJSON,
              },
              supersetWithNext: false,
              notes: '',
              link: '',
            },
          ],
        },
      ],
    };
    const result = parseProgramBlueprintFile(encode(v1));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blueprint.name).toBe('Legacy Plan');
      expect(result.blueprint.sessions[0]!.exercises[0]!.name).toBe('Bench');
    }
  });

  it('migrates a v4 plan file, spreading its rep config across planned sets', () => {
    const v4 = {
      version: 3,
      name: 'Pyramid Plan',
      lastEdited: '2025-01-01' as LocalDateJSON,
      sessions: [
        {
          version: 4,
          name: 'Day 1',
          notes: '',
          exercises: [
            {
              type: 'WeightedExerciseBlueprint',
              name: 'Curl',
              sets: 3,
              repsConfig: {
                type: 'perSet',
                targets: [
                  { min: 12, max: 12 },
                  { min: 10, max: 10 },
                ],
              },
              restBetweenSets: {
                minRest: 'PT1M' as DurationJSON,
                maxRest: 'PT3M' as DurationJSON,
                failureRest: 'PT5M' as DurationJSON,
              },
              supersetWithNext: false,
              notes: '',
              link: '',
              progressiveOverload: { type: 'NoProgressiveOverload' },
              usesBodyweight: true,
            },
          ],
        },
      ],
    };

    const result = parseProgramBlueprintFile(encode(v4));

    expect(result.ok).toBe(true);
    if (result.ok) {
      const exercise = result.blueprint.sessions[0]!.exercises[0]!;
      expect(exercise.toJSON()).toMatchObject({
        name: 'Curl',
        resistance: 'bodyweight',
        plannedSets: [{ reps: { min: 12, max: 12 } }, { reps: { min: 10, max: 10 } }, { reps: { min: 10, max: 10 } }],
      });
    }
  });

  it('rejects a plan whose shape does not match the schema', () => {
    const result = parseProgramBlueprintFile(encode({ version: 2, name: 'Broken', sessions: 'nope' }));
    expect(result).toMatchObject({ ok: false, failure: 'notAPlan' });
  });

  // A plan written by a later release migrates forward, not backward. Telling the
  // user the file is invalid sends them hunting a problem that is in their app,
  // not their plan - so this case has to stay distinguishable.
  it('reports a plan from a newer app as needing an update, not as invalid', () => {
    const fromTheFuture = { ...validBlueprint, sessions: [{ ...validBlueprint.sessions[0]!, version: 999 }] };

    const result = parseProgramBlueprintFile(encode(fromTheFuture));

    expect(result).toMatchObject({ ok: false, failure: 'needsNewerApp' });
  });

  it('reports a program version from a newer app as needing an update', () => {
    const result = parseProgramBlueprintFile(encode({ ...validBlueprint, version: 999 }));

    expect(result).toMatchObject({ ok: false, failure: 'needsNewerApp' });
  });

  // The plan-builder skill publishes these as the reference for anyone authoring
  // a plan by hand or with an AI, so they have to survive the real import path.
  it.each(['push-pull-legs', 'couch-to-5k'])('imports the published %s example', (name) => {
    const path = join(
      __dirname,
      `../../../plugins/liftlog-plan-builder/skills/create-liftlog-plan/examples/${name}.liftlogplan`,
    );
    const result = parseProgramBlueprintFile(readFileSync(path));
    expect(result.ok).toBe(true);
  });
});

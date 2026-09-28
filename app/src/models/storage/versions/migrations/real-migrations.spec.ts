import { describe, it, expect } from 'vitest';
import {
  ProgramBlueprintJSON as InitialProgramBlueprintJSON,
  SessionBlueprintJSON as InitialSessionBlueprintJSON,
  WeightedExerciseBlueprintJSON as InitialWeightedExerciseBlueprintJSON,
  CardioExerciseBlueprintJSON,
  CardioExerciseSetBlueprintJSON,
  SessionJSON as InitialSessionJSON,
  AiPlanJSON as InitialAiPlanJSON,
  SessionUserEventJSON as InitialSessionUserEventJSON,
  RemovedSessionUserEventJSON as InitialRemovedSessionUserEventJSON,
  SharedSessionJSON as InitialSharedSessionJSON,
  SharedProgramBlueprintJSON as InitialSharedProgramBlueprintJSON,
  FollowedFeedUserJSON as InitialFollowedFeedUserJSON,
} from '@/models/storage/versions/initial';
import {
  AesKeyJSON,
  BigNumberJSON,
  DurationJSON,
  InstantJSON,
  LocalDateJSON,
  RsaPublicKeyJSON,
} from '@/models/storage/versions/libs';
import { WeightJSON, WeightUnitJSON } from '@/models/storage/versions/libs/weight';
import { programBlueprintMigrations, sessionBlueprintMigrations } from './blueprint';
import { sessionMigrations } from './session';
import { Session } from '@/models/session-models';
import { SessionBlueprint } from '@/models/blueprint-models';
import { OffsetDateTime } from '@js-joda/core';
import { makeRecordedExercise, makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { aiPlanMigrations } from './ai-plan';
import {
  followedFeedUserMigrations,
  removedSessionUserEventMigrations,
  sessionUserEventMigrations,
  sharedProgramBlueprintMigrations,
  sharedSessionMigrations,
  userEventMigrations,
} from './feed';

// ---------- branded-primitive helpers ----------
const bn = (v: string) => v as BigNumberJSON;
const dur = (v: string) => v as DurationJSON;
const date = (v: string) => v as LocalDateJSON;
const instant = (v: string) => v as InstantJSON;
const wt = (value: string, unit: WeightUnitJSON = 'kilograms'): WeightJSON => ({ unit, value: bn(value) });

// ---------- initial (v1) fixtures ----------
function initialWeighted(
  overrides: Partial<InitialWeightedExerciseBlueprintJSON> = {},
): InitialWeightedExerciseBlueprintJSON {
  return {
    type: 'WeightedExerciseBlueprint',
    name: 'Bench Press',
    sets: 3,
    repsPerSet: 5,
    weightIncreaseOnSuccess: bn('2.5'),
    restBetweenSets: { minRest: dur('PT1M'), maxRest: dur('PT3M'), failureRest: dur('PT5M') },
    supersetWithNext: false,
    notes: '',
    link: '',
    ...overrides,
  };
}

function cardioSet(): CardioExerciseSetBlueprintJSON {
  return {
    target: { type: 'time', value: dur('PT30M') },
    trackDuration: true,
    trackDistance: false,
    trackResistance: false,
    trackIncline: false,
    trackWeight: false,
    trackSteps: false,
  };
}

function initialCardio(): CardioExerciseBlueprintJSON {
  return { type: 'CardioExerciseBlueprint', name: 'Treadmill', sets: [cardioSet()], notes: '', link: '' };
}

function initialSessionBlueprint(): InitialSessionBlueprintJSON {
  return { name: 'Push Day', exercises: [initialWeighted(), initialCardio()], notes: 'session notes' };
}

function initialProgramBlueprint(): InitialProgramBlueprintJSON {
  return { name: 'PPL', sessions: [initialSessionBlueprint()], lastEdited: date('2024-01-01') };
}

function initialSession(): InitialSessionJSON {
  return {
    id: 'session-1',
    blueprint: initialSessionBlueprint(),
    recordedExercises: [
      {
        type: 'RecordedWeightedExercise',
        blueprint: initialWeighted(),
        potentialSets: [{ set: undefined, weight: wt('60') }],
        notes: '',
      },
      { type: 'RecordedCardioExercise', blueprint: initialCardio(), sets: [], notes: '' },
    ],
    date: date('2024-02-02'),
    bodyweight: wt('80'),
  };
}

describe('real migrations', () => {
  describe('the two chains agree on a weighted blueprint', () => {
    function bothChains(exercise: InitialWeightedExerciseBlueprintJSON) {
      const viaBlueprintChain = sessionBlueprintMigrations.migrate({
        name: 'Push Day',
        notes: 'session notes',
        exercises: [exercise],
      }).exercises[0];

      const recorded = sessionMigrations.migrate({
        ...initialSession(),
        recordedExercises: [
          {
            type: 'RecordedWeightedExercise',
            blueprint: exercise,
            potentialSets: [{ set: undefined, weight: wt('60') }],
            notes: '',
          },
        ],
      }).recordedExercises[0];

      if (recorded?.type !== 'RecordedWeightedExercise') {
        throw new Error('expected a recorded weighted exercise');
      }
      return { viaBlueprintChain, viaSessionChain: recorded.blueprint };
    }

    it.each([
      ['a plain exercise', initialWeighted()],
      ['a single-set exercise', initialWeighted({ sets: 1, repsPerSet: 12 })],
      ['one with no progressive overload', initialWeighted({ weightIncreaseOnSuccess: bn('0') })],
      ['one with a superset', initialWeighted({ supersetWithNext: true, notes: 'notes', link: 'https://x.test' })],
    ])('%s ends up byte-identical from either chain', (_label, exercise) => {
      const { viaBlueprintChain, viaSessionChain } = bothChains(exercise);
      expect(viaSessionChain).toEqual(viaBlueprintChain);
    });

    it('agrees when each chain is resumed from part-way through', () => {
      const partwayBlueprint = sessionBlueprintMigrations.migrateUntil(
        { name: 'Push Day', notes: 'session notes', exercises: [initialWeighted()] },
        2,
      );
      const finished = sessionBlueprintMigrations.migrate(partwayBlueprint).exercises[0];

      const partwaySession = sessionMigrations.migrateUntil(initialSession(), 2);
      const recorded = sessionMigrations.migrate(partwaySession).recordedExercises[0];

      expect(recorded?.type).toBe('RecordedWeightedExercise');
      if (recorded?.type === 'RecordedWeightedExercise') {
        expect(recorded.blueprint).toEqual(finished);
      }
    });
  });

  describe('sessionBlueprintMigrations (leaf)', () => {
    it('migrates a weighted exercise from v1 to latest: repsPerSet → plannedSets, weightIncrease → a load rule', () => {
      const result = sessionBlueprintMigrations.migrate(initialSessionBlueprint());
      const weighted = result.exercises[0]!;
      expect(result.version).toBe(8);
      expect(weighted).toMatchObject({
        type: 'WeightedExerciseBlueprint',
        plannedSets: [
          { reps: { min: 5, max: 5 }, kind: 'working' },
          { reps: { min: 5, max: 5 }, kind: 'working' },
          { reps: { min: 5, max: 5 }, kind: 'working' },
        ],
        resistance: 'external',
        progression: [{ axis: 'load', step: '2.5', scope: { type: 'allSets' }, trigger: 'allSetsMetTarget' }],
      });
      expect('repsPerSet' in weighted).toBe(false);
      expect('weightIncreaseOnSuccess' in weighted).toBe(false);
      expect('progressiveOverload' in weighted).toBe(false);
    });

    it('maps a zero weight increase to no rules at all', () => {
      const bp = initialSessionBlueprint();
      bp.exercises[0] = initialWeighted({ weightIncreaseOnSuccess: bn('0') });
      const weighted = sessionBlueprintMigrations.migrate(bp).exercises[0]!;
      expect(weighted).toMatchObject({ progression: [] });
    });

    it('passes a cardio exercise through unchanged', () => {
      const result = sessionBlueprintMigrations.migrate(initialSessionBlueprint());
      expect(result.exercises[1]).toEqual(initialCardio());
    });

    it('is idempotent', () => {
      const once = sessionBlueprintMigrations.migrate(initialSessionBlueprint());
      expect(sessionBlueprintMigrations.migrate(once)).toEqual(once);
    });
  });

  describe('programBlueprintMigrations (wrapper of sessionBlueprint)', () => {
    it('accepts and migrates a v1 program to latest', () => {
      const result = programBlueprintMigrations.migrate(initialProgramBlueprint());
      expect(result.version).toBe(3);
      expect(result.name).toBe('PPL');
      expect(result.sessions.every((s) => s.version === 8)).toBe(true);
    });

    it('accepts embedded session blueprints at mixed versions and brings them all to latest', () => {
      const v1 = initialSessionBlueprint();
      const v2 = sessionBlueprintMigrations.migrateUntil(initialSessionBlueprint(), 2);
      const v3 = sessionBlueprintMigrations.migrate(initialSessionBlueprint());

      const result = programBlueprintMigrations.migrate({
        name: 'Mixed',
        lastEdited: date('2024-03-03'),
        sessions: [v1, v2, v3],
      });

      expect(result.sessions).toHaveLength(3);
      expect(result.sessions.every((s) => s.version === 8)).toBe(true);
      // every embedded session ends up identical to migrating it directly, regardless of the version it came in at
      const expected = sessionBlueprintMigrations.migrate(initialSessionBlueprint());
      for (const session of result.sessions) {
        expect(session).toEqual(expected);
      }
    });

    it('keeps the program version at 3 even though the child blueprint bumped past it', () => {
      // the wrapper stamps its own legacy pseudo-version; the child carries its own
      const result = programBlueprintMigrations.migrate(initialProgramBlueprint());
      expect(result.version).toBe(3);
      expect(result.sessions[0]!.version).toBe(8);
    });

    it('is idempotent', () => {
      const once = programBlueprintMigrations.migrate(initialProgramBlueprint());
      expect(programBlueprintMigrations.migrate(once)).toEqual(once);
    });

    it('rejects a program from a newer app version', () => {
      expect(() =>
        programBlueprintMigrations.migrate({
          version: 4,
          name: 'future',
          lastEdited: date('2024-01-01'),
          sessions: [],
        } as never),
      ).toThrow();
    });
  });

  describe('sessionMigrations: RPE (v7 → v8)', () => {
    it('brings a v7 session up unchanged, with no RPE on any set', () => {
      const blueprint = makeWeightedBlueprint();
      const current = makeSession([blueprint]).withExercise(0, makeRecordedExercise(blueprint, [5, undefined]));
      const v7 = { ...current.toJSON(), version: 7 } as never;
      const result = sessionMigrations.migrate(v7);
      expect(result.version).toBe(10);
      expect(Session.fromJSON(result).equals(current)).toBe(true);
      expect(JSON.stringify(result)).not.toContain('"rpe"');
    });
  });

  describe('warm-ups (blueprint v6 → v7, session v8 → v9)', () => {
    it('gives every weighted blueprint an empty warm-up plan and leaves cardio alone', () => {
      const result = sessionBlueprintMigrations.migrate(initialSessionBlueprint());
      expect(result.exercises[0]).toMatchObject({ type: 'WeightedExerciseBlueprint', warmupSets: [] });
      expect(result.exercises[1]).not.toHaveProperty('warmupSets');
    });

    it('brings a v8 session up with no warm-up slots, its working sets untouched', () => {
      const blueprint = makeWeightedBlueprint();
      const current = makeSession([blueprint]).withExercise(0, makeRecordedExercise(blueprint, [5, 10, undefined]));
      const json = current.toJSON();
      const v8 = {
        ...json,
        version: 8,
        recordedExercises: json.recordedExercises.map((ex) => {
          if (ex.type !== 'RecordedWeightedExercise') {
            return ex;
          }
          const { warmupSets: _slots, ...recorded } = ex;
          const { warmupSets: _planned, ...exerciseBlueprint } = ex.blueprint;
          return { ...recorded, blueprint: exerciseBlueprint };
        }),
      } as never;

      const result = sessionMigrations.migrate(v8);

      expect(result.version).toBe(10);
      const recorded = result.recordedExercises[0];
      expect(recorded).toMatchObject({ warmupSets: [], blueprint: { warmupSets: [] } });
      expect(Session.fromJSON(result).equals(current)).toBe(true);
    });

    it('gives an initial session an empty warm-up plan and no slots', () => {
      const recorded = sessionMigrations.migrate(initialSession()).recordedExercises[0];
      expect(recorded).toMatchObject({ warmupSets: [], blueprint: { warmupSets: [] } });
    });

    it('keeps warm-ups a session already has', () => {
      const blueprint = makeWeightedBlueprint({ warmupSets: [{ load: { type: 'percent', percent: 50 }, reps: 5 }] });
      const session = makeSession([blueprint]);
      expect(sessionMigrations.migrate(session.toJSON())).toEqual(session.toJSON());
    });

    it('reaches warm-ups on a program blueprint through its sessions', () => {
      const result = programBlueprintMigrations.migrate(initialProgramBlueprint());
      expect(result.sessions[0]!.exercises[0]).toMatchObject({ warmupSets: [] });
    });

    it('reaches warm-ups on feed payloads through the sessions and plans they embed', () => {
      const event = sessionUserEventMigrations.migrate(initialSessionUserEvent());
      expect(event.session.recordedExercises[0]).toMatchObject({ warmupSets: [], blueprint: { warmupSets: [] } });

      const followed = followedFeedUserMigrations.migrate(initialFollowedFeedUser(initialProgramBlueprint()));
      expect(followed.currentPlan?.sessions[0]!.exercises[0]).toMatchObject({ warmupSets: [] });
    });
  });

  describe('set kinds (blueprint v7 → v8, session v9 → v10)', () => {
    /** The shape a set had before it carried a kind: the same JSON with every `kind` taken out. */
    function withoutKinds<T>(json: T): T {
      return JSON.parse(
        JSON.stringify(json, (key: string, value: unknown) => (key === 'kind' ? undefined : value)),
      ) as T;
    }

    it('loads a v7 session blueprint with every planned set a working set and nothing else changed', () => {
      const blueprint = new SessionBlueprint(
        'Push',
        [makeWeightedBlueprint({ sets: 3, warmupSets: [{ load: { type: 'percent', percent: 50 }, reps: 5 }] })],
        'notes',
      );
      const v7 = { ...withoutKinds(blueprint.toJSON()), version: 7 } as never;

      const result = sessionBlueprintMigrations.migrate(v7);

      expect(result.version).toBe(8);
      expect(result.exercises[0]).toMatchObject({
        plannedSets: [
          { reps: { min: 10, max: 10 }, kind: 'working' },
          { reps: { min: 10, max: 10 }, kind: 'working' },
          { reps: { min: 10, max: 10 }, kind: 'working' },
        ],
      });
      expect(SessionBlueprint.fromJSON(result).equals(blueprint)).toBe(true);
    });

    it('loads a v9 session with its working list as working sets and its warm-ups as warm-ups', () => {
      const blueprint = makeWeightedBlueprint({
        warmupSets: [
          { load: undefined, reps: 8 },
          { load: undefined, reps: 5 },
        ],
      });
      const current = makeSession([blueprint]).withExercise(
        0,
        makeRecordedExercise(blueprint, [10, 8, undefined])
          .withWarmupsFromPlan('kilograms')
          .withCycledWarmupRepCount(0, OffsetDateTime.parse('2025-04-05T09:59:00Z')),
      );
      const v9 = { ...withoutKinds(current.toJSON()), version: 9 } as never;

      const result = sessionMigrations.migrate(v9);

      expect(result.version).toBe(10);
      expect(result.recordedExercises[0]).toMatchObject({
        potentialSets: [{ kind: 'working' }, { kind: 'working' }, { kind: 'working' }],
        warmupSets: [{ kind: 'warmup' }, { kind: 'warmup' }],
        blueprint: { plannedSets: [{ kind: 'working' }, { kind: 'working' }, { kind: 'working' }] },
      });
      expect(Session.fromJSON(result).equals(current)).toBe(true);
    });

    it('keeps the kinds a session already has', () => {
      const blueprint = makeWeightedBlueprint({
        plannedSets: [
          { reps: { min: 5, max: 5 }, kind: 'working' },
          { reps: { min: 5, max: 5 }, kind: 'failure' },
          { reps: { min: 12, max: 12 }, kind: 'drop' },
          { reps: { min: 15, max: 15 }, kind: 'myo' },
        ],
      });
      const session = makeSession([blueprint]);
      expect(sessionMigrations.migrate(session.toJSON())).toEqual(session.toJSON());
    });

    it('reaches the kinds on feed payloads and shared plans through what they embed', () => {
      const event = sessionUserEventMigrations.migrate(initialSessionUserEvent());
      expect(event.session.recordedExercises[0]).toMatchObject({
        potentialSets: [{ kind: 'working' }],
        blueprint: { plannedSets: [{ kind: 'working' }, { kind: 'working' }, { kind: 'working' }] },
      });

      const followed = followedFeedUserMigrations.migrate(initialFollowedFeedUser(initialProgramBlueprint()));
      expect(followed.currentPlan?.sessions[0]!.exercises[0]).toMatchObject({
        plannedSets: [{ kind: 'working' }, { kind: 'working' }, { kind: 'working' }],
      });
    });
  });

  describe('sessionMigrations (started with an embedded blueprint, then moved away from it)', () => {
    it('strips the exercises off the stored blueprint', () => {
      const result = sessionMigrations.migrate(initialSession());
      expect(result.version).toBe(10);
      expect(result.blueprint).toEqual({ name: 'Push Day', notes: 'session notes' });
      expect('exercises' in result.blueprint).toBe(false);
    });

    it('migrates the recorded weighted exercise blueprint to latest', () => {
      const result = sessionMigrations.migrate(initialSession());
      const recorded = result.recordedExercises[0];
      expect(recorded?.type).toBe('RecordedWeightedExercise');
      if (recorded?.type === 'RecordedWeightedExercise') {
        expect(recorded.blueprint.plannedSets).toEqual([
          { reps: { min: 5, max: 5 }, kind: 'working' },
          { reps: { min: 5, max: 5 }, kind: 'working' },
          { reps: { min: 5, max: 5 }, kind: 'working' },
        ]);
        expect(recorded.blueprint).toHaveProperty('progression');
        expect('repsPerSet' in recorded.blueprint).toBe(false);
      }
    });

    it('leaves a recorded cardio exercise in the same session untouched', () => {
      const result = sessionMigrations.migrate(initialSession());
      expect(result.recordedExercises[1]).toEqual({
        type: 'RecordedCardioExercise',
        blueprint: initialCardio(),
        sets: [],
        notes: '',
      });
    });

    it('gives every recorded set the target it was chasing', () => {
      const recorded = sessionMigrations.migrate(initialSession()).recordedExercises[0];
      if (recorded?.type !== 'RecordedWeightedExercise') {
        throw new Error('expected a recorded weighted exercise');
      }
      expect(recorded.potentialSets).toEqual([
        { target: { reps: { min: 5, max: 5 } }, kind: 'working', set: undefined, weight: wt('60') },
      ]);
    });

    it('is idempotent', () => {
      const once = sessionMigrations.migrate(initialSession());
      expect(sessionMigrations.migrate(once)).toEqual(once);
    });
  });

  describe('aiPlanMigrations (wrapper of programBlueprint)', () => {
    it('migrates the embedded blueprint to latest and preserves plan fields', () => {
      const plan: InitialAiPlanJSON = {
        name: 'Strength',
        description: 'get strong',
        blueprint: initialProgramBlueprint(),
      };
      const result = aiPlanMigrations.migrate(plan);
      expect(result.version).toBe(4);
      expect(result.name).toBe('Strength');
      expect(result.description).toBe('get strong');
      expect(result.blueprint.version).toBe(3);
      expect(result.blueprint.sessions.every((s) => s.version === 8)).toBe(true);
    });

    it('stamps a v3 plan as v4, the contract the planner compares against', () => {
      const plan = aiPlanMigrations.migrate({
        name: 'Strength',
        description: '',
        blueprint: initialProgramBlueprint(),
      });
      const result = aiPlanMigrations.migrate({ ...plan, version: 3 });
      expect(aiPlanMigrations.latestVersion).toBe(4);
      expect(result).toEqual(plan);
    });
  });

  describe('feed wrappers', () => {
    it('sessionUserEvent brings its embedded session to latest', () => {
      const result = sessionUserEventMigrations.migrate(initialSessionUserEvent());
      expect(result.version).toBe(3);
      expect(result.session.version).toBe(10);
      expect(result.session.blueprint).toEqual({ name: 'Push Day', notes: 'session notes' });
    });

    it('sharedSession brings its embedded session to latest', () => {
      const shared: InitialSharedSessionJSON = { type: 'SharedSession', session: initialSession() };
      const result = sharedSessionMigrations.migrate(shared);
      expect(result.version).toBe(3);
      expect(result.session.version).toBe(10);
    });

    it('sharedProgramBlueprint brings its embedded program to latest', () => {
      const shared: InitialSharedProgramBlueprintJSON = {
        type: 'SharedProgramBlueprint',
        programBlueprint: initialProgramBlueprint(),
      };
      const result = sharedProgramBlueprintMigrations.migrate(shared);
      expect(result.version).toBe(3);
      expect(result.programBlueprint.version).toBe(3);
      expect(result.programBlueprint.sessions.every((s) => s.version === 8)).toBe(true);
    });

    it('followedFeedUser brings its currentPlan to latest', () => {
      const result = followedFeedUserMigrations.migrate(initialFollowedFeedUser(initialProgramBlueprint()));
      expect(result.version).toBe(3);
      expect(result.currentPlan?.version).toBe(3);
      expect(result.currentPlan?.sessions.every((s) => s.version === 8)).toBe(true);
    });

    it('followedFeedUser leaves an absent currentPlan absent', () => {
      const result = followedFeedUserMigrations.migrate(initialFollowedFeedUser(undefined));
      expect(result.version).toBe(3);
      expect(result.currentPlan).toBeUndefined();
    });
  });

  describe('intermediate-version inputs', () => {
    it('picks up a session part-way through its chain and finishes it (v2 → latest)', () => {
      const v2 = sessionMigrations.migrateUntil(initialSession(), 2);
      // v2 has already stripped the blueprint but not yet converted repsPerSet
      expect('exercises' in v2.blueprint).toBe(false);
      const result = sessionMigrations.migrate(v2);
      expect(result).toEqual(sessionMigrations.migrate(initialSession()));
    });

    it('does not re-run applied steps when a wrapper already holds latest children', () => {
      const latestSession = sessionBlueprintMigrations.migrate(initialSessionBlueprint());
      const result = programBlueprintMigrations.migrate({
        version: 3,
        name: 'PPL',
        lastEdited: date('2024-01-01'),
        sessions: [latestSession],
      });
      expect(result.sessions[0]).toEqual(latestSession);
    });
  });

  describe('untrusted / future-version data', () => {
    it('rejects a session from a newer app version', () => {
      expect(() => sessionMigrations.migrate({ ...initialSession(), version: 11 } as never)).toThrow();
    });

    it('rejects a feed event whose own version is from the future', () => {
      expect(() => sessionUserEventMigrations.migrate({ ...initialSessionUserEvent(), version: 9 } as never)).toThrow();
    });

    it('rejects a feed event whose embedded session is from the future', () => {
      const event = initialSessionUserEvent();
      const poisoned = { ...event, session: { ...event.session, version: 11 } };
      expect(() => sessionUserEventMigrations.migrate(poisoned as never)).toThrow();
    });
  });

  describe('userEventMigrations union', () => {
    it('dispatches a SessionUserEvent and migrates its session', () => {
      const result = userEventMigrations.migrate(initialSessionUserEvent());
      expect(result.type).toBe('SessionUserEvent');
      if (result.type === 'SessionUserEvent') {
        expect(result.session.version).toBe(10);
      }
    });

    it('passes a RemovedSessionUserEvent through', () => {
      const removed: InitialRemovedSessionUserEventJSON = {
        type: 'RemovedSessionUserEvent',
        userId: 'u1',
        eventId: 'e1',
        timestamp: instant('2024-01-01T00:00:00Z'),
        expiry: instant('2024-04-01T00:00:00Z'),
        sessionId: 'session-1',
      };
      const result = removedSessionUserEventMigrations.migrate(removed);
      expect(result).toMatchObject({ type: 'RemovedSessionUserEvent', sessionId: 'session-1' });
    });
  });

  describe('edge cases', () => {
    it('migrates a program with no sessions', () => {
      const result = programBlueprintMigrations.migrate({
        name: 'Empty',
        lastEdited: date('2024-01-01'),
        sessions: [],
      });
      expect(result).toEqual({ version: 3, name: 'Empty', lastEdited: '2024-01-01', sessions: [] });
    });

    it('migrates a session with no recorded exercises', () => {
      const result = sessionMigrations.migrate({ ...initialSession(), recordedExercises: [] });
      expect(result.version).toBe(10);
      expect(result.recordedExercises).toEqual([]);
      expect(result.blueprint).toEqual({ name: 'Push Day', notes: 'session notes' });
    });
  });
});

function initialSessionUserEvent(): InitialSessionUserEventJSON {
  return {
    type: 'SessionUserEvent',
    userId: 'u1',
    eventId: 'e1',
    timestamp: instant('2024-01-01T00:00:00Z'),
    expiry: instant('2024-04-01T00:00:00Z'),
    session: initialSession(),
  };
}

function initialFollowedFeedUser(currentPlan: InitialProgramBlueprintJSON | undefined): InitialFollowedFeedUserJSON {
  return {
    type: 'FollowedFeedUser',
    id: 'user-1',
    publicKey: 'public-key' as unknown as RsaPublicKeyJSON,
    name: 'Bob',
    currentPlan,
    aesKey: 'aes-key' as unknown as AesKeyJSON,
    followSecret: 'secret',
  };
}

import { describe, expect, it } from 'vitest';
import { LocalDate, OffsetDateTime, ZoneOffset } from '@js-joda/core';
import { v4 as uuid } from 'uuid';
import {
  selectSession,
  selectSessions,
  selectMuscles,
  staleLineages,
  selectExerciseById,
  selectExercises,
  getSessionReferenceTime,
  storedSessionsReducer,
  putStoredSession,
  updateStoredSession,
  setActiveSessionId,
  upsertStoredSessions,
  setStoredSessions,
  deleteStoredSession,
  setLatestExercisesFor,
  updateExercise,
  upsertExercises,
  deleteExercise,
  restoreExercise,
  setExercises,
  setBuiltInExercises,
  setHiddenBuiltInIds,
} from '@/store/stored-sessions';
import { SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { Weight } from '@/models/weight';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { UnknownAction } from '@reduxjs/toolkit';
import { emptyPotentialSet, filledPotentialSet, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';

function createSessionWithCompletionTime(sessionDate: LocalDate, completionTime: OffsetDateTime, name: string) {
  const blueprint = new SessionBlueprint(
    name,
    [
      makeWeightedBlueprint({
        name: `${name} Exercise`,
        sets: 1,
        repsConfig: { type: 'fixed', reps: 5 },
        progression: [],
      }),
    ],
    '',
  );
  const exerciseBlueprint = blueprint.exercises[0] as WeightedExerciseBlueprint;
  const recordedExercise = new RecordedWeightedExercise(
    exerciseBlueprint,
    [filledPotentialSet(exerciseBlueprint.repsTargetForSet(0).max, completionTime, new Weight(100, 'kilograms'))],
    undefined,
  );

  return new Session(uuid(), blueprint, [recordedExercise], sessionDate, undefined, undefined);
}

/** Shares an exercise blueprint (and so a latestExercises key) with `createSessionWithCompletionTime`. */
function createAbandonedSession(sessionDate: LocalDate, name: string) {
  const template = createSessionWithCompletionTime(sessionDate, OffsetDateTime.now(), name);
  const exercise = template.recordedExercises[0] as RecordedWeightedExercise;

  return template.with({
    recordedExercises: [exercise.with({ potentialSets: [emptyPotentialSet(0)] })],
  });
}

/** Like `createAbandonedSession`, but with a warm-up logged at `warmupTime`: no working set was done. */
function createWarmupsOnlySession(sessionDate: LocalDate, warmupTime: OffsetDateTime, name: string) {
  const template = createAbandonedSession(sessionDate, name);
  const exercise = template.recordedExercises[0] as RecordedWeightedExercise;
  return template.with({
    recordedExercises: [
      exercise.with({ warmupSets: [filledPotentialSet(5, warmupTime, new Weight(50, 'kilograms'))] }),
    ],
  });
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reduce(...actions: UnknownAction[]) {
  let state = storedSessionsReducer(undefined, { type: '@@init' });
  for (const action of actions) {
    state = storedSessionsReducer(state, action);
  }
  return state;
}

function exerciseDescriptor(overrides: Partial<ExerciseDescriptor> = {}): ExerciseDescriptor {
  return {
    name: 'Squat',
    force: null,
    level: 'beginner',
    mechanic: null,
    equipment: null,
    primaryMuscles: ['quads'],
    secondaryMuscles: [],
    instructions: '',
    category: 'strength',
    ...overrides,
  };
}

describe('storedSessions reducer', () => {
  it('putStoredSession stores the session and tracks derived values', () => {
    const session = createSessionWithCompletionTime(
      LocalDate.of(2026, 4, 10),
      OffsetDateTime.of(2026, 4, 10, 10, 0, 0, 0, ZoneOffset.UTC),
      'Squat',
    );

    const state = reduce(putStoredSession(session));

    expect(state.sessions[session.id]).toBe(session);
    expect(state.earliestSession).toBe(session);
    expect(Object.keys(state.latestExercises).length).toBe(1);
  });

  it('upsertStoredSessions adds many and tracks the earliest session', () => {
    const early = createSessionWithCompletionTime(
      LocalDate.of(2026, 1, 1),
      OffsetDateTime.of(2026, 1, 1, 10, 0, 0, 0, ZoneOffset.UTC),
      'A',
    );
    const late = createSessionWithCompletionTime(
      LocalDate.of(2026, 4, 1),
      OffsetDateTime.of(2026, 4, 1, 10, 0, 0, 0, ZoneOffset.UTC),
      'B',
    );

    const state = reduce(upsertStoredSessions([late, early]));

    expect(Object.keys(state.sessions)).toHaveLength(2);
    expect(state.earliestSession).toBe(early);
  });

  it('setStoredSessions replaces sessions and clears the carry-over cache, which startup loads from the tables', () => {
    const first = createSessionWithCompletionTime(
      LocalDate.of(2026, 4, 10),
      OffsetDateTime.of(2026, 4, 10, 10, 0, 0, 0, ZoneOffset.UTC),
      'Squat',
    );
    const replacement = createSessionWithCompletionTime(
      LocalDate.of(2026, 4, 11),
      OffsetDateTime.of(2026, 4, 11, 10, 0, 0, 0, ZoneOffset.UTC),
      'Bench',
    );

    const state = reduce(putStoredSession(first), setStoredSessions({ [replacement.id]: replacement }));

    expect(state.sessions[first.id]).toBeUndefined();
    expect(state.sessions[replacement.id]).toBe(replacement);
    expect(state.latestExercises).toEqual({});
  });

  it('a completed exercise supersedes an earlier abandoned one with the same blueprint', () => {
    const abandoned = createAbandonedSession(LocalDate.of(2026, 4, 3), 'Squat');
    const completed = createSessionWithCompletionTime(
      LocalDate.of(2026, 4, 10),
      OffsetDateTime.of(2026, 4, 10, 10, 0, 0, 0, ZoneOffset.UTC),
      'Squat',
    );

    const state = reduce(putStoredSession(abandoned), putStoredSession(completed));

    const latest = Object.values(state.latestExercises)[0] as RecordedWeightedExercise;
    expect(latest.potentialSets[0]!.weight.value.toNumber()).toBe(100);
  });

  // Carry-over reads latestExercises, so a session where only the warm-ups got logged must not
  // stand in for the last real performance.
  it('an exercise with only warm-ups logged never becomes the one carried over', () => {
    const completed = createSessionWithCompletionTime(
      LocalDate.of(2026, 4, 3),
      OffsetDateTime.of(2026, 4, 3, 10, 0, 0, 0, ZoneOffset.UTC),
      'Squat',
    );
    const warmupsOnly = createWarmupsOnlySession(
      LocalDate.of(2026, 4, 10),
      OffsetDateTime.of(2026, 4, 10, 10, 0, 0, 0, ZoneOffset.UTC),
      'Squat',
    );

    const state = reduce(putStoredSession(completed), putStoredSession(warmupsOnly));

    const latest = Object.values(state.latestExercises)[0] as RecordedWeightedExercise;
    expect(latest).toBe(completed.recordedExercises[0]);
  });

  // The reducer can't know who is latest now without the whole history, so it leaves the entry and the
  // effect re-reads the lineage from the tables (`staleLineages`, pinned in history-from-sql.spec.ts).
  it('nor when the carried-over exercise is edited down to only its warm-ups: the lineage is flagged stale', () => {
    const at = (day: number) => OffsetDateTime.of(2026, 4, day, 10, 0, 0, 0, ZoneOffset.UTC);
    const earlier = createSessionWithCompletionTime(LocalDate.of(2026, 4, 3), at(3), 'Squat');
    const latest = createSessionWithCompletionTime(LocalDate.of(2026, 4, 10), at(10), 'Squat');
    const clearedToWarmups = createWarmupsOnlySession(LocalDate.of(2026, 4, 10), at(10), 'Squat');

    const state = reduce(
      upsertStoredSessions([earlier, latest]),
      updateStoredSession({
        sessionId: latest.id,
        update: (s) => s.with({ recordedExercises: clearedToWarmups.recordedExercises }),
      }),
    );

    expect(staleLineages(state, latest.id)).toEqual([latest.recordedExercises[0]!.progressionKey()]);
    expect(staleLineages(state, earlier.id)).toEqual([]);
  });

  describe('an exercise planned twice in one session', () => {
    const at = (day: number, hour: number) => OffsetDateTime.of(2026, 4, day, hour, 0, 0, 0, ZoneOffset.UTC);
    const single = makeWeightedBlueprint({ name: 'Bench', sets: 1, progression: [] });
    const backOff = makeWeightedBlueprint({ name: 'Bench', sets: 3, progression: [] });
    const key = single.progressionKey();

    function twice(day: number, singleKg: number, backOffKg: number) {
      const performed = (blueprint: WeightedExerciseBlueprint, kg: number, hour: number) =>
        new RecordedWeightedExercise(
          blueprint,
          blueprint.plannedSets.map(() => filledPotentialSet(10, at(day, hour), new Weight(kg, 'kilograms'))),
          undefined,
        );
      return new Session(
        uuid(),
        new SessionBlueprint('Push', [single, backOff], ''),
        [performed(single, singleKg, 9), performed(backOff, backOffKg, 10)],
        LocalDate.of(2026, 4, day),
        undefined,
        undefined,
      );
    }

    it('keeps the latest of each place as a lineage of its own', () => {
      const session = twice(3, 100, 60);

      const state = reduce(putStoredSession(session));

      expect(state.latestExercises[key]).toBe(session.recordedExercises[0]);
      expect(state.latestExercises[`${key}#2` as typeof key]).toBe(session.recordedExercises[1]);
    });

    it('flags both places stale once the latest is deleted', () => {
      const earlier = twice(3, 100, 60);
      const later = twice(10, 105, 62.5);

      const state = reduce(upsertStoredSessions([earlier, later]), deleteStoredSession(later.id));

      expect(staleLineages(state, later.id)).toEqual([key, `${key}#2`]);
    });
  });

  it('updateStoredSession edits the addressed session and leaves the others alone', () => {
    const target = createSessionWithCompletionTime(
      LocalDate.of(2026, 4, 10),
      OffsetDateTime.of(2026, 4, 10, 10, 0, 0, 0, ZoneOffset.UTC),
      'Squat',
    );
    const bystander = createSessionWithCompletionTime(
      LocalDate.of(2026, 4, 11),
      OffsetDateTime.of(2026, 4, 11, 10, 0, 0, 0, ZoneOffset.UTC),
      'Bench',
    );

    const state = reduce(
      putStoredSession(target),
      putStoredSession(bystander),
      updateStoredSession({ sessionId: target.id, update: (s) => s.withUpdatedDate(LocalDate.of(2026, 5, 1)) }),
    );

    expect(state.sessions[target.id]!.date.toString()).toBe('2026-05-01');
    expect(state.sessions[bystander.id]).toBe(bystander);
  });

  it('updateStoredSession is a no-op for a session that is not stored', () => {
    const state = reduce(updateStoredSession({ sessionId: 'missing', update: (s) => s }));

    expect(state.sessions).toEqual({});
  });

  it('setActiveSessionId moves the pointer without touching what is stored', () => {
    const session = createSessionWithCompletionTime(
      LocalDate.of(2026, 4, 10),
      OffsetDateTime.of(2026, 4, 10, 10, 0, 0, 0, ZoneOffset.UTC),
      'Squat',
    );

    const state = reduce(putStoredSession(session), setActiveSessionId(session.id));

    expect(state.activeSessionId).toBe(session.id);
    expect(state.sessions[session.id]).toBe(session);
  });

  it('deleting the active session clears the pointer at it', () => {
    const session = createSessionWithCompletionTime(
      LocalDate.of(2026, 4, 10),
      OffsetDateTime.of(2026, 4, 10, 10, 0, 0, 0, ZoneOffset.UTC),
      'Squat',
    );

    const state = reduce(putStoredSession(session), setActiveSessionId(session.id), deleteStoredSession(session.id));

    expect(state.activeSessionId).toBeUndefined();
  });

  it('deleteStoredSession removes the session and leaves its carry-over entries for the effect to re-read', () => {
    const session = createSessionWithCompletionTime(
      LocalDate.of(2026, 4, 10),
      OffsetDateTime.of(2026, 4, 10, 10, 0, 0, 0, ZoneOffset.UTC),
      'Squat',
    );
    const key = session.recordedExercises[0]!.progressionKey();

    const state = reduce(putStoredSession(session), deleteStoredSession(session.id));

    expect(state.sessions[session.id]).toBeUndefined();
    expect(staleLineages(state, session.id)).toEqual([key]);
    expect(
      reduce(
        putStoredSession(session),
        deleteStoredSession(session.id),
        setLatestExercisesFor({ keys: [key], latest: {} }),
      ).latestExercises,
    ).toEqual({});
  });

  describe('derived caches after edits and deletes', () => {
    const at = (day: number, hour = 10) => OffsetDateTime.of(2026, 4, day, hour, 0, 0, 0, ZoneOffset.UTC);
    const squatOn = (day: number, hour = 10) =>
      createSessionWithCompletionTime(LocalDate.of(2026, 4, day), at(day, hour), 'Squat');
    const latestSquat = (state: ReturnType<typeof reduce>) =>
      Object.values(state.latestExercises).filter(Boolean) as RecordedWeightedExercise[];

    it('deleting the earliest session moves the earliest to the next one', () => {
      const first = squatOn(1);
      const second = squatOn(5);

      const state = reduce(upsertStoredSessions([first, second]), deleteStoredSession(first.id));

      expect(state.earliestSession).toBe(second);
    });

    it('deleting the only session clears the earliest', () => {
      const only = squatOn(1);

      const state = reduce(putStoredSession(only), deleteStoredSession(only.id));

      expect(state.earliestSession).toBeUndefined();
    });

    it('replacing every session resets the earliest', () => {
      const old = squatOn(1);
      const replacement = squatOn(5);

      const state = reduce(putStoredSession(old), setStoredSessions({ [replacement.id]: replacement }));

      expect(state.earliestSession).toBe(replacement);
    });

    it('moving the earliest session later hands the earliest to the session now first', () => {
      const first = squatOn(1);
      const second = squatOn(5);

      const state = reduce(
        upsertStoredSessions([first, second]),
        updateStoredSession({ sessionId: first.id, update: (s) => s.withUpdatedDate(LocalDate.of(2026, 4, 9)) }),
      );

      expect(state.earliestSession).toBe(second);
    });

    it('an edit that moves the latest set earlier flags the lineage stale', () => {
      const earlier = squatOn(1);
      const later = squatOn(5);
      const key = later.recordedExercises[0]!.progressionKey();

      const state = reduce(
        upsertStoredSessions([earlier, later]),
        updateStoredSession({ sessionId: later.id, update: () => squatOn(1, 8).with({ id: later.id }) }),
      );

      expect(staleLineages(state, later.id)).toEqual([key]);
    });

    it('removing an exercise from the session that held its latest flags the lineage stale', () => {
      const earlier = squatOn(1);
      const later = squatOn(5);
      const key = later.recordedExercises[0]!.progressionKey();

      const state = reduce(
        upsertStoredSessions([earlier, later]),
        updateStoredSession({ sessionId: later.id, update: (s) => s.with({ recordedExercises: [] }) }),
      );

      expect(staleLineages(state, later.id)).toEqual([key]);
    });

    it('logging a later set keeps the edited exercise as the latest, with nothing to re-read', () => {
      const earlier = squatOn(1);
      const today = squatOn(5);
      const logged = squatOn(5, 11).with({ id: today.id });

      const state = reduce(
        upsertStoredSessions([earlier, today]),
        updateStoredSession({ sessionId: today.id, update: () => logged }),
      );

      expect(latestSquat(state)).toEqual([logged.recordedExercises[0]]);
      expect(staleLineages(state, today.id)).toEqual([]);
    });

    it('an edit at the same time swaps the cached exercise for the edited one', () => {
      const today = squatOn(5);
      const heavier = today.with({
        recordedExercises: [
          (today.recordedExercises[0] as RecordedWeightedExercise).with({
            potentialSets: [filledPotentialSet(5, at(5), new Weight(110, 'kilograms'))],
          }),
        ],
      });

      const state = reduce(
        putStoredSession(today),
        updateStoredSession({ sessionId: today.id, update: () => heavier }),
      );

      expect(latestSquat(state)).toEqual([heavier.recordedExercises[0]]);
      expect(staleLineages(state, today.id)).toEqual([]);
    });

    it('setLatestExercisesFor replaces only the keys it is given', () => {
      const squat = squatOn(1);
      const bench = createSessionWithCompletionTime(LocalDate.of(2026, 4, 2), at(2), 'Bench');
      const squatKey = squat.recordedExercises[0]!.progressionKey();
      const benchKey = bench.recordedExercises[0]!.progressionKey();
      const replacement = squatOn(3);

      const state = reduce(
        upsertStoredSessions([squat, bench]),
        setLatestExercisesFor({
          keys: [squatKey],
          latest: { [squatKey]: { workoutId: replacement.id, exercise: replacement.recordedExercises[0]! } },
        }),
      );

      expect(state.latestExercises[squatKey]).toBe(replacement.recordedExercises[0]);
      expect(state.latestExercises[benchKey]).toBe(bench.recordedExercises[0]);
      expect(staleLineages(state, replacement.id)).toEqual([squatKey]);
    });
  });

  it('manages saved exercises', () => {
    const squat = exerciseDescriptor({ name: 'Squat', primaryMuscles: ['quads'] });
    const bench = exerciseDescriptor({ name: 'Bench', primaryMuscles: ['chest'] });

    let state = reduce(updateExercise({ id: '1', exercise: squat }), updateExercise({ id: '2', exercise: bench }));
    expect(state.savedExercises['1']).toBe(squat);

    state = storedSessionsReducer(state, deleteExercise('1'));
    expect(state.savedExercises['1']).toBeUndefined();

    state = storedSessionsReducer(state, setExercises({ '3': squat }));
    expect(Object.keys(state.savedExercises)).toEqual(['3']);
  });

  it('upserts restored exercises without replacing existing ones', () => {
    const existing = exerciseDescriptor({ name: 'Existing' });
    const restored = exerciseDescriptor({ name: 'Restored' });

    const state = reduce(updateExercise({ id: 'existing', exercise: existing }), upsertExercises({ restored }));

    expect(state.savedExercises).toEqual({ existing, restored });
  });

  it('merges built-in and saved exercises, with saved overriding by id and sorted by name', () => {
    const state = reduce(
      setBuiltInExercises({
        Squat: exerciseDescriptor({ name: 'Squat' }),
        Bench: exerciseDescriptor({ name: 'Bench' }),
      }),
      updateExercise({ id: 'Squat', exercise: exerciseDescriptor({ name: 'Back Squat' }) }),
      updateExercise({ id: 'uuid-1', exercise: exerciseDescriptor({ name: 'Deadlift' }) }),
    );

    const merged = selectExercises({ storedSessions: state });
    expect(Object.values(merged).map((e) => e.name)).toEqual(['Back Squat', 'Bench', 'Deadlift']);
    expect(merged['Squat']!.name).toBe('Back Squat');
  });

  it('deleting a built-in tombstones it, and restore brings it back', () => {
    let state = reduce(setBuiltInExercises({ Squat: exerciseDescriptor({ name: 'Squat' }) }));

    state = storedSessionsReducer(state, deleteExercise('Squat'));
    expect(state.hiddenBuiltInIds).toEqual(['Squat']);
    expect(selectExercises({ storedSessions: state })['Squat']).toBeUndefined();

    state = storedSessionsReducer(state, restoreExercise('Squat'));
    expect(state.hiddenBuiltInIds).toEqual([]);
    expect(selectExercises({ storedSessions: state })['Squat']).toBeDefined();
  });

  it('editing a hidden built-in un-hides it', () => {
    let state = reduce(
      setBuiltInExercises({ Squat: exerciseDescriptor({ name: 'Squat' }) }),
      setHiddenBuiltInIds(['Squat']),
    );

    state = storedSessionsReducer(
      state,
      updateExercise({ id: 'Squat', exercise: exerciseDescriptor({ name: 'Squat v2' }) }),
    );
    expect(state.hiddenBuiltInIds).toEqual([]);
    expect(selectExercises({ storedSessions: state })['Squat']!.name).toBe('Squat v2');
  });
});

// ─── Selectors ────────────────────────────────────────────────────────────────

describe('storedSessions selectors', () => {
  const squat = (date: LocalDate, time: OffsetDateTime, name = 'Squat') =>
    createSessionWithCompletionTime(date, time, name);

  it('selectSessions and selectSession read the session map', () => {
    const session = squat(LocalDate.of(2026, 4, 10), OffsetDateTime.of(2026, 4, 10, 10, 0, 0, 0, ZoneOffset.UTC));
    const state = { storedSessions: reduce(putStoredSession(session)) };

    expect(selectSessions(state)).toHaveLength(1);
    expect(selectSession(state, session.id)).toBe(session);
  });

  it('selectSessions keeps its reference while only the workout in progress changes', () => {
    const done = squat(LocalDate.of(2026, 4, 1), OffsetDateTime.of(2026, 4, 1, 10, 0, 0, 0, ZoneOffset.UTC));
    const inProgress = squat(LocalDate.of(2026, 4, 8), OffsetDateTime.of(2026, 4, 8, 10, 0, 0, 0, ZoneOffset.UTC));
    const before = reduce(upsertStoredSessions([done, inProgress]), setActiveSessionId(inProgress.id));

    const edited = storedSessionsReducer(
      before,
      updateStoredSession({ sessionId: inProgress.id, update: (s) => s.withUpdatedDate(LocalDate.of(2026, 4, 9)) }),
    );

    // Everything expensive - streak, personal records, volume - memoizes off this array, and the
    // History tab is mounted behind the workout screen. A new reference here re-runs all of it per tap.
    expect(edited.sessions).not.toBe(before.sessions);
    expect(selectSessions({ storedSessions: edited })).toBe(selectSessions({ storedSessions: before }));
  });

  it('selectMuscles returns sorted distinct muscles and selectExerciseById reads one', () => {
    const state = {
      storedSessions: reduce(
        updateExercise({
          id: '1',
          exercise: exerciseDescriptor({ primaryMuscles: ['quads'], secondaryMuscles: ['glutes'] }),
        }),
        updateExercise({ id: '2', exercise: exerciseDescriptor({ primaryMuscles: ['glutes', 'chest'] }) }),
      ),
    };

    expect(selectMuscles(state)).toEqual(['chest', 'glutes', 'quads']);
    expect(selectExerciseById(state, '1')!.secondaryMuscles).toEqual(['glutes']);
  });
});

// ─── getSessionReferenceTime ──────────────────────────────────────────────────

describe('getSessionReferenceTime', () => {
  it('uses the last recorded set time when the session is started', () => {
    const time = OffsetDateTime.of(2026, 4, 10, 9, 30, 0, 0, ZoneOffset.UTC);
    const session = createSessionWithCompletionTime(LocalDate.of(2026, 4, 10), time, 'Squat');
    expect(getSessionReferenceTime(session).toEpochSecond()).toBe(time.toEpochSecond());
  });

  it('falls back to the start of the session date when nothing is recorded', () => {
    const blueprint = new SessionBlueprint(
      'Empty',
      [
        makeWeightedBlueprint({
          name: 'Squat',
          sets: 1,
          repsConfig: { type: 'fixed', reps: 5 },
          progression: [],
        }),
      ],
      '',
    );
    const exercise = new RecordedWeightedExercise(
      blueprint.exercises[0] as WeightedExerciseBlueprint,
      [emptyPotentialSet(100)],
      undefined,
    );
    const session = new Session(uuid(), blueprint, [exercise], LocalDate.of(2026, 4, 10), undefined, undefined);

    expect(
      getSessionReferenceTime(session)
        .toLocalDate()
        .equals(LocalDate.of(2026, 4, 10)),
    ).toBe(true);
  });
});

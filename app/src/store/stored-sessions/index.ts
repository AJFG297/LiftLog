import { RecordedExercise, Session } from '@/models/session-models';
import { lineageKeys, ProgressionKey } from '@/models/blueprint-models';
import { OffsetDateTime, ZoneId } from '@js-joda/core';
import { createAction, createSelector, createSlice, PayloadAction, WritableDraft } from '@reduxjs/toolkit';
import { shallowEqual } from 'react-redux';
import Enumerable from 'linq';
import { ExerciseDescriptor, musclesOf } from '@/models/exercise-models';
import type { LatestPerformance } from '@/services/workout-repository';

interface StoredSessionState {
  isHydrated: boolean;
  sessions: Record<string, Session>;
  // The workout in progress. It lives in `sessions` like any other; this only says which one it is.
  activeSessionId: string | undefined;
  // The latest performance of each lineage, keyed by `lineageKeys`, which is what carry-over reads. Loaded
  // from the workout tables at startup (`WorkoutRepository.latestPerLineage`), moved forward by the
  // reducers below, and re-read for a lineage a write may have moved back (see `staleLineages`).
  latestExercises: Record<ProgressionKey, RecordedExercise | undefined>;
  // The workout each entry of `latestExercises` came from, so a write to that workout knows which entries
  // it can have changed.
  latestExerciseWorkoutIds: Record<ProgressionKey, string>;
  // Read-only catalog resolved for the current locale, keyed by the exercise's English name.
  builtInExercises: Record<string, ExerciseDescriptor>;
  // User-created exercises and copy-on-write edits of built-ins.
  savedExercises: Record<string, ExerciseDescriptor>;
  // Built-in ids the user deleted, hidden from the merged list.
  hiddenBuiltInIds: string[];
  filteredExerciseIds: string[];
  earliestSession: Session | undefined;
}

const initialState: StoredSessionState = {
  isHydrated: false,
  sessions: {},
  activeSessionId: undefined,
  latestExercises: {},
  latestExerciseWorkoutIds: {},
  builtInExercises: {},
  savedExercises: {},
  hiddenBuiltInIds: [],
  filteredExerciseIds: [],
  earliestSession: undefined,
};

function mergeExercises(
  builtIn: Record<string, ExerciseDescriptor>,
  saved: Record<string, ExerciseDescriptor>,
  hidden: string[],
): Record<string, ExerciseDescriptor> {
  const merged: Record<string, ExerciseDescriptor> = { ...builtIn, ...saved };
  hidden.forEach((id) => delete merged[id]);
  return Object.fromEntries(Object.entries(merged).sort((a, b) => a[1].name.localeCompare(b[1].name)));
}

/**
 * Every session the user has finished with. The workout in progress is deliberately absent, because
 * this is the input to every whole-history aggregate - streak, personal records, volume scales, the
 * month list - and the History tab stays mounted behind the workout screen.
 *
 * The shallow result check is what makes that hold: `sessions` changes identity on each tap, so this
 * recomputes, but handing back the previous array keeps everything downstream memoized. Use
 * `selectSession` to look a session up by id, active or not.
 */
const selectFinishedSessions = createSelector(
  [(state: StoredSessionState) => state.sessions, (state: StoredSessionState) => state.activeSessionId],
  (sessions, activeSessionId) => Object.values(sessions).filter((session) => session.id !== activeSessionId),
  { memoizeOptions: { resultEqualityCheck: shallowEqual } },
);

const storedSessionsSlice = createSlice({
  name: 'storedSessions',
  initialState,
  reducers: {
    setIsHydrated(state, action: PayloadAction<boolean>) {
      state.isHydrated = action.payload;
    },
    setStoredSessions(state, action: PayloadAction<Record<string, Session>>) {
      state.sessions = action.payload;
      state.latestExercises = {};
      state.latestExerciseWorkoutIds = {};
      state.earliestSession = undefined;
      Object.values(action.payload).forEach((session) => {
        recordEarliest(state, session);
      });
    },

    /** The whole carry-over cache, as read from the workout tables. */
    setLatestExercises(state, action: PayloadAction<Record<ProgressionKey, LatestPerformance>>) {
      state.latestExercises = {};
      state.latestExerciseWorkoutIds = {};
      setLatestFor(state, Object.keys(action.payload) as ProgressionKey[], action.payload);
    },

    /** Replaces the cache's entries for `keys` with what the tables hold; a key with no entry is dropped. */
    setLatestExercisesFor(
      state,
      action: PayloadAction<{ keys: readonly ProgressionKey[]; latest: Record<ProgressionKey, LatestPerformance> }>,
    ) {
      setLatestFor(state, action.payload.keys, action.payload.latest);
    },

    upsertStoredSessions(state, action: PayloadAction<Session[]>) {
      action.payload.forEach((session) => {
        storeSession(state, session);
      });
    },

    putStoredSession(state, action: PayloadAction<Session>) {
      storeSession(state, action.payload);
    },

    /** Applies an edit to one session, addressed by id so it cannot land on the wrong one. */
    updateStoredSession(
      state,
      action: PayloadAction<{
        sessionId: string;
        update: (session: Session) => Session;
      }>,
    ) {
      const session = state.sessions[action.payload.sessionId] as Session | undefined;
      if (!session) {
        return;
      }
      storeSession(state, action.payload.update(session));
    },

    setActiveSessionId(state, action: PayloadAction<string | undefined>) {
      state.activeSessionId = action.payload;
    },

    // Cache entries that came from the deleted workout are left for the effect, which re-reads those
    // lineages from the tables once the delete has landed (see `staleLineages`).
    deleteStoredSession(state, action: PayloadAction<string>) {
      const deletedSession = state.sessions[action.payload];
      delete state.sessions[action.payload];
      if (state.activeSessionId === action.payload) {
        state.activeSessionId = undefined;
      }

      if (deletedSession && state.earliestSession?.id === deletedSession.id) {
        recomputeEarliestSession(state);
      }
    },
    updateExercise(state, action: PayloadAction<{ id: string; exercise: ExerciseDescriptor }>) {
      state.savedExercises[action.payload.id] = action.payload.exercise;
      state.hiddenBuiltInIds = state.hiddenBuiltInIds.filter((x) => x !== action.payload.id);
    },
    upsertExercises(state, action: PayloadAction<Record<string, ExerciseDescriptor>>) {
      Object.assign(state.savedExercises, action.payload);
      state.hiddenBuiltInIds = state.hiddenBuiltInIds.filter((x) => !action.payload[x]);
    },
    deleteExercise(state, action: PayloadAction<string>) {
      if (state.builtInExercises[action.payload]) {
        // Deleting a built-in tombstones it (its override row, if any, is kept for undo).
        if (!state.hiddenBuiltInIds.includes(action.payload)) {
          state.hiddenBuiltInIds.push(action.payload);
        }
      } else {
        delete state.savedExercises[action.payload];
      }
    },
    restoreExercise(state, action: PayloadAction<string>) {
      state.hiddenBuiltInIds = state.hiddenBuiltInIds.filter((x) => x !== action.payload);
    },
    setExercises(state, action: PayloadAction<Record<string, ExerciseDescriptor>>) {
      state.savedExercises = action.payload;
    },
    setBuiltInExercises(state, action: PayloadAction<Record<string, ExerciseDescriptor>>) {
      state.builtInExercises = action.payload;
    },
    setHiddenBuiltInIds(state, action: PayloadAction<string[]>) {
      state.hiddenBuiltInIds = action.payload;
    },
    setFilteredExerciseIds(state, action: PayloadAction<string[]>) {
      state.filteredExerciseIds = action.payload;
    },
  },

  selectors: {
    selectLatestExercises: createSelector([(state: StoredSessionState) => state.latestExercises], (exercises) =>
      Object.fromEntries(Object.entries(exercises).map(([key, exercise]) => [key, exercise ? exercise : undefined])),
    ),
    selectSessions: selectFinishedSessions,
    selectSession: createSelector(
      [(state: StoredSessionState) => state.sessions, (_, id: string) => id],
      (sessions, id) => sessions[id],
    ),
    selectActiveSessionId: (state: StoredSessionState) => state.activeSessionId,

    selectActiveSession: (state: StoredSessionState) =>
      state.activeSessionId === undefined ? undefined : state.sessions[state.activeSessionId],

    selectExercises: createSelector(
      [
        (state: StoredSessionState) => state.builtInExercises,
        (state: StoredSessionState) => state.savedExercises,
        (state: StoredSessionState) => state.hiddenBuiltInIds,
      ],
      mergeExercises,
    ),
  },
});

/**
 * Stores a session, new or replacing one, and moves the carry-over cache forward. An entry that came from
 * the replaced session is swapped for what the new version holds at that lineage when that is as late or
 * later; logging a set is that case, so it never reads the tables. Anything else that came from this
 * session (an exercise moved earlier, cleared or removed) is stale now: {@link staleLineages} finds those
 * for the effect, which re-reads them once the write has landed.
 */
function storeSession(state: WritableDraft<StoredSessionState>, session: Session) {
  const previous = state.sessions[session.id] as Session | undefined;
  state.sessions[session.id] = session;

  for (const [key, cached] of Object.entries(state.latestExercises) as [ProgressionKey, RecordedExercise][]) {
    if (state.latestExerciseWorkoutIds[key] !== session.id) {
      continue;
    }
    const replacement = latestWithKey(session, key);
    if (replacement?.latestTime && cached.latestTime && !replacement.latestTime.isBefore(cached.latestTime)) {
      state.latestExercises[key] = replacement;
    }
  }
  recordLatest(state, session);

  if (previous && state.earliestSession?.id === session.id) {
    if (session.date.isAfter(previous.date)) {
      recomputeEarliestSession(state);
    } else {
      state.earliestSession = session;
    }
  }
  recordEarliest(state, session);
}

/**
 * The lineages a write to `workoutId` leaves in doubt, to be re-read from the tables: those whose cached
 * latest came from that workout and may not hold any more (the workout is gone, or its exercise there is
 * unlogged or earlier than what is cached), and those the workout now ties with another workout's entry to
 * the instant, since the tables, not the order of writes, break that tie.
 */
export function staleLineages(state: StoredSessionState, workoutId: string): ProgressionKey[] {
  const session = state.sessions[workoutId] as Session | undefined;
  const stale = (Object.keys(state.latestExerciseWorkoutIds) as ProgressionKey[]).filter((key) => {
    if (state.latestExerciseWorkoutIds[key] !== workoutId) {
      return false;
    }
    const cached = state.latestExercises[key];
    const current = session && latestWithKey(session, key);
    return !(current?.latestTime && cached?.latestTime && !current.latestTime.isBefore(cached.latestTime));
  });
  for (const [key, exercise] of session ? lineagesOf(session) : []) {
    const cached = state.latestExercises[key];
    if (
      state.latestExerciseWorkoutIds[key] !== workoutId &&
      exercise.latestTime &&
      cached?.latestTime?.isEqual(exercise.latestTime)
    ) {
      stale.push(key);
    }
  }
  return stale;
}

function latestWithKey(session: Session, key: ProgressionKey): RecordedExercise | undefined {
  const exercise = lineagesOf(session).find(([lineage]) => lineage === key)?.[1];
  return exercise?.latestTime ? exercise : undefined;
}

/** Each of `session`'s exercises with its lineage (see {@link lineageKeys}). */
function lineagesOf(session: Session): [ProgressionKey, RecordedExercise][] {
  const keys = lineageKeys(session.recordedExercises);
  return session.recordedExercises.map((exercise, index) => [keys[index]!, exercise]);
}

/**
 * Moves the cache forward to `session`'s performances that came after what it holds. A performance at the
 * same instant as another workout's entry is left to {@link staleLineages}, so the tables decide the tie.
 */
function recordLatest(state: WritableDraft<StoredSessionState>, session: Session) {
  for (const [key, exercise] of lineagesOf(session)) {
    const current = state.latestExercises[key];
    if (exercise.latestTime && (!current?.latestTime || current.latestTime.isBefore(exercise.latestTime))) {
      state.latestExercises[key] = exercise;
      state.latestExerciseWorkoutIds[key] = session.id;
    }
  }
}

function setLatestFor(
  state: WritableDraft<StoredSessionState>,
  keys: readonly ProgressionKey[],
  latest: Record<ProgressionKey, LatestPerformance>,
) {
  for (const key of keys) {
    const performance = latest[key];
    if (performance) {
      state.latestExercises[key] = performance.exercise;
      state.latestExerciseWorkoutIds[key] = performance.workoutId;
    } else {
      delete state.latestExercises[key];
      delete state.latestExerciseWorkoutIds[key];
    }
  }
}

function recomputeEarliestSession(state: WritableDraft<StoredSessionState>) {
  state.earliestSession = undefined;
  for (const session of Object.values(state.sessions) as Session[]) {
    recordEarliest(state, session);
  }
}

function recordEarliest(state: WritableDraft<StoredSessionState>, session: Session) {
  if (!state.earliestSession || state.earliestSession.date.isAfter(session.date)) {
    state.earliestSession = session;
  }
}

export const initializeStoredSessionsStateSlice = createAction('initializeStoredSessionsStateSlice');

export const {
  setIsHydrated,
  setStoredSessions,
  setLatestExercises,
  setLatestExercisesFor,
  upsertStoredSessions,
  putStoredSession,
  updateStoredSession,
  setActiveSessionId,
  deleteStoredSession,
  updateExercise,
  upsertExercises,
  deleteExercise,
  restoreExercise,
  setExercises,
  setBuiltInExercises,
  setHiddenBuiltInIds,
  setFilteredExerciseIds,
} = storedSessionsSlice.actions;

export const {
  selectSessions,
  selectSession,
  selectActiveSession,
  selectActiveSessionId,
  selectExercises,
  selectLatestExercises,
} = storedSessionsSlice.selectors;

/** Fired when a session is done being edited: publish it, export it, and re-derive what depends on it. */
export const sessionFinished = createAction<string>('sessionFinished');

export const selectExerciseById = createSelector(
  [selectExercises, (_, id: string) => id],
  (exercises, id) => exercises[id],
);

export const selectMuscles = createSelector([selectExercises], (exercises) =>
  Enumerable.from(Object.entries(exercises))
    .selectMany(([, x]) => musclesOf(x))
    .distinct()
    .orderBy((x) => x)
    .toArray(),
);

export const selectExerciseIds = createSelector([selectExercises], (exercises) => Object.keys(exercises));

export const storedSessionsReducer = storedSessionsSlice.reducer;

export function getSessionReferenceTime(session: Session): OffsetDateTime {
  return (
    session.lastExercise?.lastActivityTime ??
    session.date.atStartOfDay().atZone(ZoneId.systemDefault()).toOffsetDateTime()
  );
}

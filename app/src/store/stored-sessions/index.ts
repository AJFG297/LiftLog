import { RecordedExercise, Session } from '@/models/session-models';
import { lineageKeys, ProgressionKey } from '@/models/blueprint-models';
import { OffsetDateTime, ZoneId } from '@js-joda/core';
import { createAction, createSelector, createSlice, PayloadAction, WritableDraft } from '@reduxjs/toolkit';
import Enumerable from 'linq';
import { ExerciseDescriptor, musclesOf } from '@/models/exercise-models';
import type { LatestPerformance } from '@/services/workout-repository';

interface StoredSessionState {
  isHydrated: boolean;
  // The workouts open in memory, by id: the one in progress and the two slots below, no others. The rest of
  // the history stays in the workout tables until a screen reads it (`WorkoutRepository`).
  sessions: Record<string, Session>;
  // The workout in progress, if any.
  activeSessionId: string | undefined;
  // The past workout open in the history editor (`openSessionForEditing`). Only opening another replaces
  // it, so nothing else that happens meanwhile can close it under the editor.
  editingSessionId: string | undefined;
  // The workout last put or just finished, which its summary still shows (`openSessionForSummary` after a
  // restart). The next put or finish replaces it.
  recentSessionId: string | undefined;
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
}

const initialState: StoredSessionState = {
  isHydrated: false,
  sessions: {},
  activeSessionId: undefined,
  editingSessionId: undefined,
  recentSessionId: undefined,
  latestExercises: {},
  latestExerciseWorkoutIds: {},
  builtInExercises: {},
  savedExercises: {},
  hiddenBuiltInIds: [],
  filteredExerciseIds: [],
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

const storedSessionsSlice = createSlice({
  name: 'storedSessions',
  initialState,
  reducers: {
    setIsHydrated(state, action: PayloadAction<boolean>) {
      state.isHydrated = action.payload;
    },
    /** Startup: the workout in progress as stored, or none. Nothing else of the history is loaded. */
    setActiveSession(state, action: PayloadAction<Session | undefined>) {
      const session = action.payload;
      state.sessions = session ? { [session.id]: session } : {};
      state.activeSessionId = session?.id;
      state.editingSessionId = undefined;
      state.recentSessionId = undefined;
    },

    /**
     * Opens a workout read from the tables in a slot. A copy already open is newer than the tables can be, so
     * it is kept; the workout in progress takes no slot.
     */
    openSession(state, action: PayloadAction<{ session: Session; slot: OpenSlot }>) {
      const { session, slot } = action.payload;
      if (!state.sessions[session.id]) {
        state.sessions[session.id] = session;
      }
      openIn(state, slot, session.id);
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

    /** Writes many workouts, for a restore or an import. They are not opened; one already open is updated. */
    upsertStoredSessions(state, action: PayloadAction<Session[]>) {
      action.payload.forEach((session) => {
        storeSession(state, session);
      });
    },

    /**
     * Writes a workout and keeps it open: where it already is, or else in the recent slot. The editor's
     * workout is never closed by it, nor by starting a workout, which puts it before making it active.
     */
    putStoredSession(state, action: PayloadAction<Session>) {
      const isOpen = !!state.sessions[action.payload.id];
      state.sessions[action.payload.id] = action.payload;
      storeSession(state, action.payload);
      if (!isOpen) {
        openIn(state, 'recent', action.payload.id);
      }
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

    /** The workout that stops being in progress moves to the recent slot, where its summary reads it. */
    setActiveSessionId(state, action: PayloadAction<string | undefined>) {
      const previous = state.activeSessionId;
      state.activeSessionId = action.payload;
      if (previous !== undefined && previous !== action.payload && state.sessions[previous]) {
        openIn(state, 'recent', previous);
      } else {
        closeOthers(state);
      }
    },

    // Cache entries that came from the deleted workout are left for the effect, which re-reads those
    // lineages from the tables once the delete has landed (see `staleLineages`).
    deleteStoredSession(state, action: PayloadAction<string>) {
      delete state.sessions[action.payload];
      if (state.activeSessionId === action.payload) {
        state.activeSessionId = undefined;
      }
      if (state.editingSessionId === action.payload) {
        state.editingSessionId = undefined;
      }
      if (state.recentSessionId === action.payload) {
        state.recentSessionId = undefined;
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
    /** An open workout by id: the one in progress, or the one in the editing slot. */
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
 * Stores a session, new or replacing one: in memory only if it is open, and in the carry-over cache, which it
 * moves forward. An entry that came from the replaced session is swapped for what the new version holds at
 * that lineage when that is as late or later; logging a set is that case, so it never reads the tables.
 * Anything else that came from this session (an exercise moved earlier, cleared or removed) is stale now:
 * {@link staleLineages} finds those for the effect, which re-reads them once the write has landed.
 */
function storeSession(state: WritableDraft<StoredSessionState>, session: Session) {
  if (state.sessions[session.id]) {
    state.sessions[session.id] = session;
  }

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
}

/** Where an open workout other than the one in progress is held: see `editingSessionId`, `recentSessionId`. */
export type OpenSlot = 'editing' | 'recent';

/** Puts an open workout in `slot`, unless it is the one in progress, and closes what that slot held. */
function openIn(state: WritableDraft<StoredSessionState>, slot: OpenSlot, sessionId: string) {
  if (sessionId !== state.activeSessionId) {
    if (slot === 'editing') {
      state.editingSessionId = sessionId;
    } else {
      state.recentSessionId = sessionId;
    }
  }
  closeOthers(state);
}

/** Drops from memory every workout but the one in progress and the ones in the two slots. */
function closeOthers(state: WritableDraft<StoredSessionState>) {
  for (const id of Object.keys(state.sessions)) {
    if (id !== state.activeSessionId && id !== state.editingSessionId && id !== state.recentSessionId) {
      delete state.sessions[id];
    }
  }
}

/**
 * The lineages a write to `workoutId` leaves in doubt, to be re-read from the tables: those whose cached
 * latest came from that workout and may not hold any more (the workout is gone, or its exercise there is
 * unlogged or earlier than what is cached), and those the workout now ties with another workout's entry to
 * the instant, since the tables, not the order of writes, break that tie.
 */
export function staleLineages(state: StoredSessionState, workoutId: string, written?: Session): ProgressionKey[] {
  // A workout written and then closed (another put took its slot before the write landed) is judged by
  // what was written.
  const session = (state.sessions[workoutId] as Session | undefined) ?? written;
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

export const initializeStoredSessionsStateSlice = createAction('initializeStoredSessionsStateSlice');

/** Loads a workout from the tables into the editing slot, for the screen that edits it. */
export const openSessionForEditing = createAction<string>('openSessionForEditing');

/** Loads a workout from the tables into the recent slot, for its summary opened by link or after a restart. */
export const openSessionForSummary = createAction<string>('openSessionForSummary');

export const {
  setIsHydrated,
  setActiveSession,
  openSession,
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

export const { selectSession, selectActiveSession, selectActiveSessionId, selectExercises, selectLatestExercises } =
  storedSessionsSlice.selectors;

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

import { AddEffectFn, RootState } from '@/store/store';
import {
  deleteExercise,
  deleteStoredSession,
  initializeStoredSessionsStateSlice,
  openSession,
  setSessionNotFound,
  openSessionForEditing,
  openSessionForSummary,
  putStoredSession,
  restoreExercise,
  selectSession,
  sessionFinished,
  setActiveSession,
  setActiveSessionId,
  setBuiltInExercises,
  setExercises,
  setHiddenBuiltInIds,
  setIsHydrated,
  setLatestExercises,
  setLatestExercisesFor,
  staleLineages,
  updateExercise,
  updateStoredSession,
  upsertExercises,
  upsertStoredSessions,
} from './index';
import { progressionKeyOf } from '@/models/blueprint-models';
import { WorkoutRepository } from '@/services/workout-repository';
import type { Session } from '@/models/session-models';
import { Dispatch } from '@reduxjs/toolkit';
import { fetchUpcomingSessions } from '@/store/program';
import { addUnpublishedSessionId } from '@/store/feed';
import { setStatsIsDirty } from '@/store/stats';
import { setPreferredLanguage } from '@/store/settings';
import { exercisesSchema } from '@/db/schema';
import { writeAtomically } from '@/db/helpers';
import { samePersistedContent } from '@/services/workout-rows';
import { eq, sql } from 'drizzle-orm';
import { toRecord } from '@/utils/reduce';
import { fromExerciseDescriptorJSON, toExerciseDescriptorJSON } from '@/models/exercise-models';
import { exerciseDescriptorMigrations } from '@/models/storage/versions/migrations';
import { loadBuiltInExercises } from '@/services/exercise-catalog';
import { missingStubs } from '@/models/exercise-resolver';
import { readHiddenBuiltInIds, writeHiddenBuiltInIds } from '@/services/hidden-built-in-exercises';

export function applyStoredSessionsEffects(addEffect: AddEffectFn) {
  // Dispatched AFTER settings, so we can safely access settings
  addEffect(
    initializeStoredSessionsStateSlice,
    async (
      _,
      { cancelActiveListeners, getState, dispatch, extra: { keyValueStore, db, logger, workoutRepository } },
    ) => {
      cancelActiveListeners();
      if (!getState().settings.isHydrated) {
        throw new Error('Settings must be hydrated before stored sessions');
      }
      // All startup reads of the history: the workout in progress and the carry-over cache. Neither grows
      // with the number of workouts; every screen reads the rest from the tables when it is shown.
      await logger.time('initializeStoredSessions', async () => {
        const [active, latest] = await Promise.all([workoutRepository.active(), workoutRepository.latestPerLineage()]);
        dispatch(setActiveSession(active));
        dispatch(setLatestExercises(latest));
      });

      const savedExercises = (await db.select().from(exercisesSchema)).reduce(
        toRecord(
          (x) => x.id,
          (x) => fromExerciseDescriptorJSON(exerciseDescriptorMigrations.migrate(x.payload)),
        ),
        {},
      );
      dispatch(setExercises(savedExercises));

      const builtInExercises = await loadBuiltInExercises(getState().settings.preferredLanguage);
      dispatch(setBuiltInExercises(builtInExercises));

      dispatch(setHiddenBuiltInIds(await readHiddenBuiltInIds(keyValueStore)));

      dispatch(setIsHydrated(true));
      dispatch(fetchUpcomingSessions());
    },
  );

  addEffect([openSessionForEditing, openSessionForSummary], async (action, { getState, dispatch, extra }) => {
    if (!openSessionForEditing.match(action) && !openSessionForSummary.match(action)) {
      return;
    }
    const sessionId = action.payload;
    const slot = openSessionForEditing.match(action) ? 'editing' : 'recent';
    // The read waits for any write before it, so a workout put just before it is opened is read as put.
    const session = selectSession(getState(), sessionId) ?? (await extra.workoutRepository.get(sessionId));
    dispatch(session ? openSession({ session, slot }) : setSessionNotFound(sessionId));
  });

  // Re-resolve the built-in catalog when the language changes (startup load is handled above).
  addEffect(setPreferredLanguage, async (action, { getState, dispatch }) => {
    if (!getState().storedSessions.isHydrated) {
      return;
    }
    dispatch(setBuiltInExercises(await loadBuiltInExercises(action.payload)));
  });

  // Completion, not content: a session is only exported and queued for the feed once the user is done
  // with it, otherwise every recorded set would fire a health export.
  addEffect(sessionFinished, async (action, { getState, dispatch, extra: { healthExportService, logger } }) => {
    const state = getState();
    const workout = selectSession(state, action.payload);
    if (!workout) {
      return;
    }
    if (workout.withoutUnloggedRpe() !== workout) {
      dispatch(updateStoredSession({ sessionId: workout.id, update: (s) => s.withoutUnloggedRpe() }));
    }

    if (state.storedSessions.activeSessionId === workout.id) {
      dispatch(setActiveSessionId(undefined));
    }
    const { builtInExercises, savedExercises } = state.storedSessions;
    const stubs = missingStubs(
      workout.recordedExercises.filter((x) => x.isStarted).map((x) => x.blueprint),
      (id) => id in builtInExercises || id in savedExercises,
    );
    if (Object.keys(stubs).length) {
      dispatch(upsertExercises(stubs));
    }
    dispatch(addUnpublishedSessionId(workout.id));
    dispatch(setStatsIsDirty(true));
    dispatch(fetchUpcomingSessions());

    if (!state.settings.exportToHealthAggregator || !healthExportService.canExport()) {
      return;
    }
    try {
      await healthExportService.exportWorkout(workout);
    } catch (e) {
      logger.error('Failed to sync to health aggregator', e);
    }
  });

  addEffect(deleteStoredSession, async (action, { getState, dispatch, extra: { logger, workoutRepository } }) => {
    await logger.time('deleteStoredSession', () => workoutRepository.delete(action.payload));
    await refreshStaleLineages(action.payload, getState, dispatch, workoutRepository);
  });
  addEffect(deleteStoredSession, async (action, { stateAfterReduce, extra: { healthExportService, logger } }) => {
    const workoutId = action.payload;
    if (!stateAfterReduce.settings.exportToHealthAggregator || !healthExportService.canExport()) {
      return;
    }
    try {
      await healthExportService.deleteWorkout(workoutId);
    } catch (e) {
      logger.error('Failed to delete workout from HealthConnect', e);
    }
  });

  // Content only. The `active` flag has a single writer below, so a recorded set never touches it.
  addEffect(
    [putStoredSession, updateStoredSession],
    async (
      action,
      { getState, dispatch, stateBeforeReduce, stateAfterReduce, extra: { logger, workoutRepository } },
    ) => {
      const sessionId = putStoredSession.match(action)
        ? action.payload.id
        : updateStoredSession.match(action)
          ? action.payload.sessionId
          : undefined;
      if (sessionId === undefined) {
        return;
      }
      // A rest timer or a running cardio timer isn't stored, so an update that changes only those writes
      // nothing. That is most updates while resting.
      if (updateStoredSession.match(action)) {
        if (__DEV__ && !selectSession(stateBeforeReduce, sessionId)) {
          // The reducer drops it: a screen must open a past workout (`openSessionForEditing`) to edit it.
          logger.warn('updateStoredSession for a workout that is not open; nothing was written', { sessionId });
        }
        const before = selectSession(stateBeforeReduce, sessionId);
        const after = selectSession(stateAfterReduce, sessionId);
        if (before && after && samePersistedContent(before, after)) {
          return;
        }
      }
      // Read at write time rather than from stateAfterReduce, so a slow write still stores the newest
      // content if a later edit overtakes it.
      const session = selectSession(getState(), sessionId);
      if (!session) {
        return;
      }
      await logger.time('persistStoredSession', () => workoutRepository.put(session));
      await refreshStaleLineages(sessionId, getState, dispatch, workoutRepository, session);
    },
  );

  addEffect(setActiveSessionId, async (action, { getState, extra: { logger, workoutRepository } }) => {
    await logger.time('setActiveSessionId', () => {
      const sessionId = action.payload;
      return workoutRepository.setActive(sessionId === undefined ? undefined : selectSession(getState(), sessionId));
    });
  });

  addEffect(
    upsertStoredSessions,
    async (action, { cancelActiveListeners, dispatch, extra: { logger, workoutRepository } }) => {
      cancelActiveListeners();
      await logger.time('upsertStoredSessions', () => workoutRepository.putMany(action.payload));
      // A restore or import can move any lineage back; cheaper to re-read them all than to work out which.
      dispatch(setLatestExercises(await workoutRepository.latestPerLineage()));
    },
  );

  addEffect(deleteExercise, async (action, { stateAfterReduce, extra: { db, keyValueStore } }) => {
    if (stateAfterReduce.storedSessions.builtInExercises[action.payload]) {
      // Built-ins are tombstoned rather than removed; their override row (if any) is kept for undo.
      await writeHiddenBuiltInIds(keyValueStore, stateAfterReduce.storedSessions.hiddenBuiltInIds);
    } else {
      await db.delete(exercisesSchema).where(eq(exercisesSchema.id, action.payload));
    }
  });

  addEffect(restoreExercise, async (_, { stateAfterReduce, extra: { keyValueStore } }) => {
    await writeHiddenBuiltInIds(keyValueStore, stateAfterReduce.storedSessions.hiddenBuiltInIds);
  });

  addEffect(updateExercise, async (action, { extra: { db } }) => {
    await db
      .insert(exercisesSchema)
      .values({
        id: action.payload.id,
        payload: toExerciseDescriptorJSON(action.payload.exercise),
      })
      .onConflictDoUpdate({
        target: exercisesSchema.id,
        set: {
          payload: sql.raw(`excluded.${exercisesSchema.payload.name}`),
        },
      });
  });

  addEffect(upsertExercises, async (action, { extra: { db } }) => {
    const exercises = Object.entries(action.payload).map(([id, exercise]) => ({
      id,
      payload: toExerciseDescriptorJSON(exercise),
    }));
    if (!exercises.length) {
      return;
    }
    await db
      .insert(exercisesSchema)
      .values(exercises)
      .onConflictDoUpdate({
        target: exercisesSchema.id,
        set: {
          payload: sql.raw(`excluded.${exercisesSchema.payload.name}`),
        },
      });
  });

  addEffect(setExercises, async (action, { stateAfterReduce, extra: { db } }) => {
    if (!stateAfterReduce.storedSessions.isHydrated) {
      return;
    }
    const rows = Object.entries(action.payload).map(([id, exercise]) => ({
      id,
      payload: toExerciseDescriptorJSON(exercise),
    }));
    await writeAtomically(db, (tx) => [
      tx.delete(exercisesSchema),
      ...(rows.length ? [tx.insert(exercisesSchema).values(rows)] : []),
    ]);
  });
}

/**
 * Re-reads from the tables the lineages whose cached latest came from `workoutId` and may have moved back
 * (see `staleLineages`), once that workout's write has landed. The reducer has already moved every
 * lineage it could forward, so this only runs for the rare edit or delete of a latest performance; logging
 * a set reads nothing.
 *
 * The repository runs its writes and this read in the order they were issued, so the read sees every write
 * before it and a later write's own refresh follows this one. A lineage the reducer has moved on meanwhile
 * belongs to that later write and is left to its refresh.
 */
async function refreshStaleLineages(
  workoutId: string,
  getState: () => RootState,
  dispatch: Dispatch,
  workoutRepository: WorkoutRepository,
  written?: Session,
) {
  const { storedSessions } = getState();
  const stale = staleLineages(storedSessions, workoutId, written);
  if (!stale.length) {
    return;
  }
  const snapshot = storedSessions.latestExercises;
  const latest = await workoutRepository.latestPerLineage({
    progressionKeys: [...new Set(stale.map(progressionKeyOf))],
  });
  const { latestExercises } = getState().storedSessions;
  const keys = stale.filter((key) => latestExercises[key] === snapshot[key]);
  if (keys.length) {
    dispatch(setLatestExercisesFor({ keys, latest }));
    dispatch(fetchUpcomingSessions());
  }
}

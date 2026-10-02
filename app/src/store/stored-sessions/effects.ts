import { AddEffectFn } from '@/store/store';
import {
  deleteExercise,
  deleteStoredSession,
  initializeStoredSessionsStateSlice,
  putStoredSession,
  restoreExercise,
  selectSession,
  sessionFinished,
  setActiveSessionId,
  setBuiltInExercises,
  setExercises,
  setHiddenBuiltInIds,
  setIsHydrated,
  setStoredSessions,
  updateExercise,
  updateStoredSession,
  upsertExercises,
  upsertStoredSessions,
} from './index';
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

// Built-ins the user deleted, so they stay hidden across restarts and locale switches.
const hiddenBuiltInExerciseIdsStorageKey = 'HiddenBuiltInExerciseIdList';
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
      await logger.time('initializeStoredSessions', async () => {
        const { workouts, activeWorkoutId } = await workoutRepository.loadAll();
        dispatch(setStoredSessions(Object.fromEntries(workouts.map((x) => [x.id, x]))));
        // Only when there is one: dispatching `undefined` would clear every flag in the table.
        if (activeWorkoutId) {
          dispatch(setActiveSessionId(activeWorkoutId));
        }
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

      const hiddenBuiltInIds = JSON.parse(
        (await keyValueStore.getItem(hiddenBuiltInExerciseIdsStorageKey)) ?? '[]',
      ) as string[];
      dispatch(setHiddenBuiltInIds(hiddenBuiltInIds));

      dispatch(setIsHydrated(true));
      dispatch(fetchUpcomingSessions());
    },
  );

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

  addEffect(deleteStoredSession, async (action, { extra: { logger, workoutRepository } }) => {
    await logger.time('deleteStoredSession', () => workoutRepository.delete(action.payload));
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
    async (action, { getState, stateBeforeReduce, stateAfterReduce, extra: { logger, workoutRepository } }) => {
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
    },
  );

  addEffect(setActiveSessionId, async (action, { getState, extra: { logger, workoutRepository } }) => {
    await logger.time('setActiveSessionId', () => {
      const sessionId = action.payload;
      return workoutRepository.setActive(sessionId === undefined ? undefined : selectSession(getState(), sessionId));
    });
  });

  addEffect(upsertStoredSessions, async (action, { cancelActiveListeners, extra: { logger, workoutRepository } }) => {
    cancelActiveListeners();
    await logger.time('upsertStoredSessions', () => workoutRepository.putMany(action.payload));
  });

  addEffect(deleteExercise, async (action, { stateAfterReduce, extra: { db, keyValueStore } }) => {
    if (stateAfterReduce.storedSessions.builtInExercises[action.payload]) {
      // Built-ins are tombstoned rather than removed; their override row (if any) is kept for undo.
      await keyValueStore.setItem(
        hiddenBuiltInExerciseIdsStorageKey,
        JSON.stringify(stateAfterReduce.storedSessions.hiddenBuiltInIds),
      );
    } else {
      await db.delete(exercisesSchema).where(eq(exercisesSchema.id, action.payload));
    }
  });

  addEffect(restoreExercise, async (_, { stateAfterReduce, extra: { keyValueStore } }) => {
    await keyValueStore.setItem(
      hiddenBuiltInExerciseIdsStorageKey,
      JSON.stringify(stateAfterReduce.storedSessions.hiddenBuiltInIds),
    );
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

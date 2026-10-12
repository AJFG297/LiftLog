import { LocalDate } from '@js-joda/core';
import { fetchOverallStats, OVERALL_STATS_DAYS, setOverallStats, setStatsIsDirty } from './index';
import { AddEffectFn } from '@/store/store';
import {
  deleteStoredSession,
  initializeStoredSessionsStateSlice,
  putStoredSession,
  updateStoredSession,
  upsertStoredSessions,
} from '@/store/stored-sessions';

import { sleep } from '@/utils/sleep';
import { RemoteData } from '@/models/remote';
import { selectPreferredWeightUnit } from '../settings';
import { calculateStats } from '@/store/stats/calculate-stats';

export function applyStatsEffects(addEffect: AddEffectFn) {
  // Stats are read from the workout tables, so they are stale once a write has *committed* - which is after
  // the action the effect below sees. A fetch between the two would read the old rows and clear the flag,
  // so the repository marks them stale again after each commit. Writes of the workout in progress are
  // skipped as below; `setActive` isn't, since finishing is what makes a workout count.
  let unsubscribe = () => {};
  addEffect(initializeStoredSessionsStateSlice, (_, { getState, dispatch, extra: { workoutRepository } }) => {
    unsubscribe();
    unsubscribe = workoutRepository.subscribe(({ workoutIds, activeChanged }) => {
      const activeSessionId = getState().storedSessions.activeSessionId;
      if (!activeChanged && workoutIds.every((id) => id === activeSessionId)) {
        return;
      }
      dispatch(setStatsIsDirty(true));
    });
  });

  addEffect(fetchOverallStats, async (_, { getState, dispatch, extra: { workoutRepository } }) => {
    const before = getState();

    if (before.stats.overallView.isLoading() || !before.stats.isDirty || !before.storedSessions.isHydrated) {
      return;
    }

    dispatch(setOverallStats(RemoteData.loading()));
    // Cleared before calculating rather than after, so a write that lands meanwhile marks the stats stale
    // again instead of being overwritten by a result that doesn't include it.
    dispatch(setStatsIsDirty(false));
    await sleep(200);
    const state = getState();
    try {
      const today = LocalDate.now();
      const timeframe = { from: today.minusDays(OVERALL_STATS_DAYS), to: today };
      const sessions = await workoutRepository.finishedBetween(timeframe.from, timeframe.to);
      const stats = calculateStats(sessions, selectPreferredWeightUnit(state), timeframe);
      dispatch(setOverallStats(RemoteData.success(stats)));
    } catch (e) {
      dispatch(setOverallStats(RemoteData.error(e)));
      dispatch(setStatsIsDirty(true));
    }
  });

  // Stats cover finished sessions only, so a set recorded in the workout in progress changes nothing and
  // is skipped here; `sessionFinished` marks them stale when that workout ends.
  addEffect(
    [putStoredSession, updateStoredSession, upsertStoredSessions, deleteStoredSession],
    async (action, { dispatch, stateAfterReduce }) => {
      if (stateAfterReduce.stats.isDirty) {
        return;
      }
      const sessionId = putStoredSession.match(action)
        ? action.payload.id
        : updateStoredSession.match(action)
          ? action.payload.sessionId
          : undefined;
      if (sessionId !== undefined && sessionId === stateAfterReduce.storedSessions.activeSessionId) {
        return;
      }
      dispatch(setStatsIsDirty(true));
    },
  );
}

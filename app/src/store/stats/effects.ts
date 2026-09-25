import { setOverallViewTime, setStatsIsDirty } from './index';
import { LocalDate } from '@js-joda/core';
import { fetchOverallStats, setOverallStats } from './index';
import { AddEffectFn } from '@/store/store';
import {
  deleteStoredSession,
  putStoredSession,
  selectSessionsBy,
  updateStoredSession,
  upsertStoredSessions,
} from '@/store/stored-sessions';

import { sleep } from '@/utils/sleep';
import { RemoteData } from '@/models/remote';
import { selectPreferredWeightUnit } from '../settings';
import { calculateStats } from '@/store/stats/calculate-stats';

export function applyStatsEffects(addEffect: AddEffectFn) {
  addEffect(fetchOverallStats, async (_, { getState, dispatch }) => {
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
      let timeframe = state.stats.overallViewTime;
      if (timeframe === 'all-time') {
        if (!state.storedSessions.earliestSession) {
          dispatch(setOverallStats(RemoteData.error('No sessions')));
          dispatch(setStatsIsDirty(true));
          return;
        }
        timeframe = {
          from: state.storedSessions.earliestSession.date,
          to: LocalDate.now(),
        };
      }
      const stats = calculateStats(
        selectSessionsBy(state, timeframe.from, timeframe.to),
        selectPreferredWeightUnit(state),
        timeframe,
      );
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

  addEffect(setOverallViewTime, async (_, { dispatch }) => {
    dispatch(setStatsIsDirty(true));
    dispatch(fetchOverallStats());
  });
}

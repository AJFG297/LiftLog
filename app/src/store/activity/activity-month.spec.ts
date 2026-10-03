import { describe, expect, it } from 'vitest';
import { combineReducers } from '@reduxjs/toolkit';
import { LocalDate, YearMonth } from '@js-joda/core';
import { NO_OWN_ACTIVITY, selectActivityMonth } from '@/store/activity';
import { settingsReducer } from '@/store/settings';
import feedReducer from '@/store/feed';
import {
  putStoredSession,
  setActiveSessionId,
  storedSessionsReducer,
  updateStoredSession,
} from '@/store/stored-sessions';
import { makeSession, makeWeightedBlueprint, tick } from '@/models/session-models/__test__/helpers';
import type { RootState } from '@/store/store';

const reducer = combineReducers({
  settings: settingsReducer,
  feed: feedReducer,
  storedSessions: storedSessionsReducer,
});

describe('selectActivityMonth', () => {
  // The History calendar stays mounted under the workout screen and reads this on every store change. It is
  // fed by the workout tables (`own`) and the feed, so a set logged in the workout in progress must hand back
  // the month already computed rather than build it again.
  it('hands back the same month while sets are logged in the workout in progress', () => {
    const live = makeSession([makeWeightedBlueprint()]);
    let state = [putStoredSession(live), setActiveSessionId(live.id)].reduce(
      (current, action) => reducer(current, action),
      reducer(undefined, { type: '@@init' }),
    );
    const params = { own: NO_OWN_ACTIVITY, yearMonth: YearMonth.of(2026, 4), today: LocalDate.of(2026, 4, 10) };
    const before = selectActivityMonth(state as unknown as RootState, params);

    state = reducer(
      state,
      updateStoredSession({ sessionId: live.id, update: (s) => s.withCycledExerciseReps(0, 0, tick()) }),
    );

    expect(selectActivityMonth(state as unknown as RootState, params)).toBe(before);
  });
});

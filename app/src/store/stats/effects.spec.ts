import { describe, expect, it } from 'vitest';
import { combineReducers } from '@reduxjs/toolkit';
import { LocalDate } from '@js-joda/core';
import { applyStatsEffects } from '@/store/stats/effects';
import { fetchOverallStats, statsReducer } from '@/store/stats';
import { settingsReducer } from '@/store/settings';
import {
  deleteStoredSession,
  putStoredSession,
  setActiveSessionId,
  setIsHydrated,
  storedSessionsReducer,
  updateStoredSession,
  upsertStoredSessions,
} from '@/store/stored-sessions';
import { createAddEffectTestBed } from '@/utils/__test__/add-effect-testbed';
import { EmptySession, Session } from '@/models/session-models';

const reducer = combineReducers({
  settings: settingsReducer,
  stats: statsReducer,
  storedSessions: storedSessionsReducer,
});

function setup(stored: Session[], activeSessionId?: string) {
  const testBed = createAddEffectTestBed({ reducer });
  applyStatsEffects(testBed.addEffect);
  testBed.dispatch(upsertStoredSessions(stored));
  if (activeSessionId) {
    testBed.dispatch(setActiveSessionId(activeSessionId));
  }
  // Freshly calculated: nothing is stale until a write below.
  testBed.setState({ stats: { ...testBed.getState().stats, isDirty: false } });
  return testBed;
}

const finished = EmptySession.with({ id: 'finished', date: LocalDate.parse('2026-04-01') });
const active = EmptySession.with({ id: 'active', date: LocalDate.parse('2026-04-02') });

describe('stats staleness', () => {
  it('editing a finished session marks stats stale', async () => {
    const testBed = setup([finished, active], active.id);

    await testBed.dispatchHandled(
      updateStoredSession({ sessionId: finished.id, update: (s) => s.withUpdatedDate(LocalDate.parse('2026-03-01')) }),
    );

    expect(testBed.getState().stats.isDirty).toBe(true);
  });

  it('putting a finished session marks stats stale', async () => {
    const testBed = setup([finished]);

    await testBed.dispatchHandled(putStoredSession(finished.with({ date: LocalDate.parse('2026-03-01') })));

    expect(testBed.getState().stats.isDirty).toBe(true);
  });

  it('deleting a session marks stats stale', async () => {
    const testBed = setup([finished]);

    await testBed.dispatchHandled(deleteStoredSession(finished.id));

    expect(testBed.getState().stats.isDirty).toBe(true);
  });

  it('importing sessions marks stats stale', async () => {
    const testBed = setup([]);

    await testBed.dispatchHandled(upsertStoredSessions([finished]));

    expect(testBed.getState().stats.isDirty).toBe(true);
  });

  it('recording a set in the workout in progress leaves stats alone', async () => {
    const testBed = setup([finished, active], active.id);

    await testBed.dispatchHandled(updateStoredSession({ sessionId: active.id, update: (s) => s.with({}) }));

    expect(testBed.getState().stats.isDirty).toBe(false);
  });

  it('an edit while stats are being calculated leaves them stale for the next fetch', async () => {
    const testBed = setup([finished]);
    testBed.dispatch(setIsHydrated(true));
    testBed.setState({ stats: { ...testBed.getState().stats, isDirty: true } });

    const fetching = testBed.dispatchHandled(fetchOverallStats());
    await testBed.dispatchHandled(
      updateStoredSession({ sessionId: finished.id, update: (s) => s.withUpdatedDate(LocalDate.parse('2026-03-01')) }),
    );
    await fetching;

    expect(testBed.getState().stats.overallView.isSuccess()).toBe(true);
    expect(testBed.getState().stats.isDirty).toBe(true);
  });
});

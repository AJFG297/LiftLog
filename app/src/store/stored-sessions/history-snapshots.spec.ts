import { beforeAll, describe, expect, it, vi } from 'vitest';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { DayOfWeek, LocalDate, YearMonth } from '@js-joda/core';
import Enumerable from 'linq';
import type { RootState } from '@/store/store';
import { settingsReducer } from '@/store/settings';
import feedReducer from '@/store/feed';
import { statsReducer } from '@/store/stats';
import {
  getSessionReferenceTime,
  selectHistoryPersonalRecords,
  selectLatestExercises,
  selectPreviousComparableSession,
  selectRecentlyCompletedExercises,
  selectSessions,
  selectSessionsBy,
  selectSessionsInMonth,
  setIsHydrated,
  storedSessionsReducer,
  upsertStoredSessions,
} from '@/store/stored-sessions';
import { selectActivityMonth, selectStreakStats, selectVolumeScales } from '@/store/activity';
import { calculateStats } from '@/store/stats/calculate-stats';
import { selectPreferredWeightUnit, setFirstDayOfWeek } from '@/store/settings';
import { ProgressRepository } from '@/services/progress-repository';
import { Session } from '@/models/session-models';
import { describeExercise, describeSession, loadHistoryFixture, normalize } from '@/utils/__test__/history-fixture';

/**
 * Characterization snapshots of every whole-history aggregate over the 420-session fixture. They pin what
 * the app computes today so the storage rewrite (docs/plans/relational-storage.md) can prove it computes
 * the same thing. Any snapshot change must be deliberate and listed in the PR that makes it.
 *
 * Selectors that read "today" take it as an argument; the rest of the clock dependence is the system zone,
 * which sessions without a recorded set fall back to, so that is pinned too.
 */
vi.stubEnv('TZ', 'UTC');

// The fixture runs from 2023-07-05 to 2026-05-31; a few days after, so the current week is part-trained.
const TODAY = LocalDate.parse('2026-06-03');

let sessions: Session[];
let store: ReturnType<typeof createHistoryStore>;

// The slices the history aggregates read. The app's root reducer lives beside `createServices`, which
// can't load under Vitest.
function createHistoryStore() {
  return configureStore({
    reducer: combineReducers({
      settings: settingsReducer,
      feed: feedReducer,
      stats: statsReducer,
      storedSessions: storedSessionsReducer,
    }),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

/**
 * Loads history the way a backup restore does. Later storage tickets point this at their own hydration so
 * the same assertions keep running.
 */
function loadHistory(target: ReturnType<typeof createHistoryStore>, history: Session[]) {
  target.dispatch(upsertStoredSessions(history));
  target.dispatch(setIsHydrated(true));
}

const state = () => store.getState() as unknown as RootState;

beforeAll(() => {
  sessions = loadHistoryFixture();
  store = createHistoryStore();
  store.dispatch(setFirstDayOfWeek(DayOfWeek.MONDAY));
  loadHistory(store, sessions);
});

describe('history aggregates over the 420-session fixture', () => {
  it('loads every session as finished history', () => {
    expect(sessions).toHaveLength(420);
    expect(selectSessions(state())).toHaveLength(420);
    expect(state().storedSessions.earliestSession?.date.toString()).toBe('2023-07-05');
  });

  it('latest recorded exercise per progression key', () => {
    const latest = selectLatestExercises(state());
    expect(Object.keys(latest).length).toBeGreaterThan(0);
    expect(normalize(latest)).toMatchSnapshot();
  });

  it('recently completed exercises per movement', () => {
    const movementKeys = Enumerable.from(sessions)
      .selectMany((x) => x.recordedExercises)
      .select((x) => x.movementKey())
      .distinct()
      .orderBy((x) => x)
      .toArray();
    const lookup = selectRecentlyCompletedExercises(state(), undefined);
    expect(Object.fromEntries(movementKeys.map((key) => [key, lookup(key).map(describeExercise)]))).toMatchSnapshot();
  });

  it('recently completed exercises leave out the session being viewed', () => {
    const newest = Enumerable.from(sessions)
      .orderByDescending((x) => getSessionReferenceTime(x).toEpochSecond())
      .first();
    const lookup = selectRecentlyCompletedExercises(state(), newest.id);
    expect(
      Object.fromEntries(
        newest.recordedExercises.map((exercise) => [
          exercise.movementKey(),
          lookup(exercise.movementKey()).slice(0, 3).map(describeExercise),
        ]),
      ),
    ).toMatchSnapshot();
  });

  it('previous comparable session for every session', () => {
    const previous = Object.fromEntries(
      [...sessions]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((session) => {
          const match = selectPreviousComparableSession(state(), session);
          return [describeSession(session), match ? describeSession(match) : null];
        }),
    );
    expect(previous).toMatchSnapshot();
  });

  it('sessions in each month', () => {
    const months: Record<string, string[]> = {};
    for (let ym = YearMonth.of(2023, 6); !ym.isAfter(YearMonth.of(2026, 6)); ym = ym.plusMonths(1)) {
      months[ym.toString()] = selectSessionsInMonth(state(), ym).map(describeSession);
    }
    expect(months).toMatchSnapshot();
  });

  it('sessions in a date range', () => {
    const ranges: [string, string][] = [
      ['2023-07-05', '2023-07-05'],
      ['2024-01-01', '2024-03-31'],
      ['2025-12-25', '2026-01-07'],
      ['2026-05-01', '2026-06-03'],
    ];
    expect(
      Object.fromEntries(
        ranges.map(([from, to]) => [
          `${from}..${to}`,
          selectSessionsBy(state(), LocalDate.parse(from), LocalDate.parse(to)).map(describeSession).sort(),
        ]),
      ),
    ).toMatchSnapshot();
  });

  it('streak stats', () => {
    const days = ['2023-07-05', '2024-02-14', '2025-06-30', '2026-05-31', TODAY.toString(), '2026-07-01'];
    const streaks: Record<string, unknown> = {};
    for (const firstDay of [DayOfWeek.MONDAY, DayOfWeek.SUNDAY]) {
      store.dispatch(setFirstDayOfWeek(firstDay));
      for (const day of days) {
        streaks[`${firstDay.toString()} ${day}`] = normalize(selectStreakStats(state(), LocalDate.parse(day)));
      }
    }
    store.dispatch(setFirstDayOfWeek(DayOfWeek.MONDAY));
    expect(streaks).toMatchSnapshot();
  });

  it('activity calendar months and volume scales', () => {
    const months = ['2023-07', '2024-11', '2025-08', '2026-05', '2026-06'].map((x) => YearMonth.parse(x));
    const calendar = Object.fromEntries(
      months.map((yearMonth) => {
        const month = selectActivityMonth(state(), { yearMonth, today: TODAY });
        return [
          yearMonth.toString(),
          {
            crossesFeedHorizon: month.crossesFeedHorizon,
            // One line per week: date:level/sessionCount with flags, so a diff points at the day.
            rows: month.rows.map((row) =>
              row.cells
                .map(
                  (cell) =>
                    `${cell.date.toString()}:${cell.level}/${cell.sessionCount}` +
                    `${cell.isToday ? 'T' : ''}${cell.isFuture ? 'F' : ''}${cell.isOutsideFocus ? 'O' : ''}` +
                    `${cell.isBeyondFeedHorizon ? 'H' : ''}`,
                )
                .join(' '),
            ),
          },
        ];
      }),
    );
    expect({ scales: normalize(selectVolumeScales(state())), calendar }).toMatchSnapshot();
  });

  it('per-session personal records', () => {
    expect(normalize(selectHistoryPersonalRecords(state()))).toMatchSnapshot();
  });

  it('overall stats, all-time and last 90 days', () => {
    const earliest = state().storedSessions.earliestSession!.date;
    const unit = selectPreferredWeightUnit(state());
    const ranges = {
      allTime: { from: earliest, to: TODAY },
      last90Days: { from: TODAY.minusDays(90), to: TODAY },
    };
    const stats = Object.fromEntries(
      Object.entries(ranges).map(([name, range]) => [
        name,
        normalize(calculateStats(selectSessionsBy(state(), range.from, range.to), unit, range)),
      ]),
    );
    expect(stats).toMatchSnapshot();
  });

  it('ordered sessions for plaintext export', () => {
    const ordered = new ProgressRepository(state).getOrderedSessions().select(describeSession).toArray();
    expect(ordered).toHaveLength(420);
    expect(ordered).toMatchSnapshot();
  });
});

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { DayOfWeek, LocalDate, YearMonth } from '@js-joda/core';
import Enumerable from 'linq';
import type { RootState } from '@/store/store';
import {
  getSessionReferenceTime,
  selectHistoryPersonalRecords,
  selectLatestExercises,
  selectPreviousComparableSession,
  selectRecentlyCompletedExercises,
  selectSessions,
  selectSessionsBy,
  selectSessionsInMonth,
  initializeStoredSessionsStateSlice,
} from '@/store/stored-sessions';
import { selectActivityMonth, selectStreakStats, selectVolumeScales } from '@/store/activity';
import { calculateStats } from '@/store/stats/calculate-stats';
import { GranularStatisticView } from '@/store/stats';
import { normalizeExerciseName } from '@/models/blueprint-models';
import { linkExerciseIds } from '@/services/data-migrations/link-exercise-ids';
import { selectPreferredWeightUnit, setFirstDayOfWeek, setIsHydrated as setSettingsIsHydrated } from '@/store/settings';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { createEffectStore } from '@/utils/__test__/effect-store';
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
let store: Awaited<ReturnType<typeof loadHistory>>;

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  time: async (_: string, action: () => unknown) => action(),
};

/**
 * Loads history the way the app does: the fixture is bulk-inserted through the repository, the way a backup
 * restore or CSV import writes it, then hydrated by the real startup effect from the workout tables.
 */
async function loadHistory(history: Session[]) {
  const db = drizzle(await openDatabaseAsync(':memory:'));
  await new DatabaseMigrationService(db, silentLogger as never, { importOldData: async () => {} }).migrate();
  const workoutRepository = new WorkoutRepository(db);
  await workoutRepository.putMany(history);
  // The fixture predates exercise ids, like a development install's history: startup links it by name.
  await linkExerciseIds(db);

  const harness = createEffectStore({
    db,
    workoutRepository,
    logger: silentLogger as never,
    keyValueStore: { getItem: () => Promise.resolve(null) } as never,
  });
  applyStoredSessionsEffects(harness.addEffect);
  harness.store.dispatch(setSettingsIsHydrated(true));
  harness.store.dispatch(setFirstDayOfWeek(DayOfWeek.MONDAY));
  harness.store.dispatch(initializeStoredSessionsStateSlice());
  await harness.settle();
  expect(silentLogger.error).not.toHaveBeenCalled();
  return harness.store;
}

const state = () => store.getState() as unknown as RootState;

/**
 * Keys carry exercise ids, which for anything outside the catalog are uuids. Snapshots label them by the
 * exercise's name instead - normalised for a movement, as its key used to be - so they read, and so a diff
 * against the name-keyed snapshots shows only real changes in grouping.
 */
function exerciseName(id: string): string {
  const { savedExercises, builtInExercises } = state().storedSessions;
  return savedExercises[id]?.name ?? builtInExercises[id]?.name ?? id;
}
/** `Object.fromEntries` over labelled keys, failing if two different keys would share a label. */
function byLabel<T>(entries: [label: string, key: string, value: T][]): Record<string, T> {
  const keysByLabel = new Map<string, string>();
  for (const [label, key] of entries) {
    const existing = keysByLabel.get(label);
    if (existing !== undefined && existing !== key) {
      throw new Error(`"${label}" labels both ${existing} and ${key}: two exercises would read as one`);
    }
    keysByLabel.set(label, key);
  }
  return Object.fromEntries(entries.map(([label, , value]) => [label, value]));
}
function labelMovement(key: string): string {
  const split = key.lastIndexOf('|');
  return `${normalizeExerciseName(exerciseName(key.slice(0, split)))}${key.slice(split)}`;
}

beforeAll(async () => {
  sessions = loadHistoryFixture();
  store = await loadHistory(sessions);
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
    // Labelled by the latest exercise's own name, which is what the key held before it held an id.
    const labelled = byLabel(
      Object.entries(latest).map(([key, exercise]) => [
        `${exercise!.blueprint.name}${key.slice(key.search(/_(Weighted|Cardio)ExerciseBlueprint_/))}`,
        key,
        normalize(exercise),
      ]),
    );
    expect(labelled).toMatchSnapshot();
  });

  it('recently completed exercises per movement', () => {
    // From the stored sessions, whose exercises startup linked; the fixture's own are still unlinked.
    const movementKeys = Enumerable.from(selectSessions(state()))
      .selectMany((x) => x.recordedExercises)
      .select((x) => x.movementKey())
      .distinct()
      .orderBy((x) => x)
      .toArray();
    const lookup = selectRecentlyCompletedExercises(state(), undefined);
    expect(
      byLabel(movementKeys.map((key) => [labelMovement(key), key, lookup(key).map(describeExercise)])),
    ).toMatchSnapshot();
  });

  it('recently completed exercises leave out the session being viewed', () => {
    const newest = Enumerable.from(selectSessions(state()))
      .orderByDescending((x) => getSessionReferenceTime(x).toEpochSecond())
      .first();
    const lookup = selectRecentlyCompletedExercises(state(), newest.id);
    expect(
      byLabel(
        newest.recordedExercises.map((exercise) => [
          labelMovement(exercise.movementKey()),
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
        normalize(withoutIds(calculateStats(selectSessionsBy(state(), range.from, range.to), unit, range))),
      ]),
    );
    expect(stats).toMatchSnapshot();
  });

  // The ids a stat row carries are what `exerciseName` already labels it by.
  function withoutIds(stats: GranularStatisticView) {
    return {
      ...stats,
      weightedExerciseStats: stats.weightedExerciseStats.map(({ exerciseId: _, movementKey: __, ...rest }) => rest),
    };
  }

  it('ordered sessions for plaintext export', () => {
    const ordered = new ProgressRepository(state).getOrderedSessions().select(describeSession).toArray();
    expect(ordered).toHaveLength(420);
    expect(ordered).toMatchSnapshot();
  });
});

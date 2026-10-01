import { beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { DayOfWeek, LocalDate, YearMonth } from '@js-joda/core';
import Enumerable from 'linq';
import type { RootState } from '@/store/store';
import {
  getSessionReferenceTime,
  selectLatestExercises,
  selectPreviousComparableSession,
  selectRecentlyCompletedExercises,
  selectSessions,
  initializeStoredSessionsStateSlice,
} from '@/store/stored-sessions';
import {
  calculateStreak,
  OWN_USER_KEY,
  OwnActivity,
  ownActivityOf,
  selectActivityMonth,
  trainingDatesOf,
} from '@/store/activity';
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
 * Characterization snapshots of every history aggregate over the 420-session fixture. They pin what the
 * app computed from the whole history in Redux, so the storage rewrite (docs/plans/relational-storage.md)
 * can prove it computes the same thing: the History, calendar, streak, records and stats cases are now fed
 * by `WorkoutRepository`'s queries, the carry-over cases still by the selectors. Any snapshot change must
 * be deliberate and listed in the PR that makes it.
 *
 * Selectors that read "today" take it as an argument; the rest of the clock dependence is the system zone,
 * which sessions without a recorded set fall back to, so that is pinned too.
 */
vi.stubEnv('TZ', 'UTC');

// The fixture runs from 2023-07-05 to 2026-05-31; a few days after, so the current week is part-trained.
const TODAY = LocalDate.parse('2026-06-03');

let sessions: Session[];
let store: Awaited<ReturnType<typeof loadHistory>>['store'];
let repository: WorkoutRepository;
/** What `useOwnActivity` would hand the calendar and streak. */
let own: OwnActivity;

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
  return { store: harness.store, workoutRepository };
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
  ({ store, workoutRepository: repository } = await loadHistory(sessions));
  own = ownActivityOf(await repository.dailyActivity(), await repository.volumeScale());
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
        `${exercise!.blueprint.name}${key.slice(key.search(/_(Weighted|Cardio)ExerciseBlueprint(_|$)/))}`,
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

  it('sessions in each month', async () => {
    const months: Record<string, string[]> = {};
    for (let ym = YearMonth.of(2023, 6); !ym.isAfter(YearMonth.of(2026, 6)); ym = ym.plusMonths(1)) {
      months[ym.toString()] = (await repository.finishedBetween(ym.atDay(1), ym.atEndOfMonth())).map(describeSession);
    }
    expect(months).toMatchSnapshot();
  });

  it('sessions in a date range', async () => {
    const ranges: [string, string][] = [
      ['2023-07-05', '2023-07-05'],
      ['2024-01-01', '2024-03-31'],
      ['2025-12-25', '2026-01-07'],
      ['2026-05-01', '2026-06-03'],
    ];
    const inRange: Record<string, string[]> = {};
    for (const [from, to] of ranges) {
      const found = await repository.finishedBetween(LocalDate.parse(from), LocalDate.parse(to));
      inRange[`${from}..${to}`] = found.map(describeSession).sort();
    }
    expect(inRange).toMatchSnapshot();
  });

  it('streak stats', () => {
    const days = ['2023-07-05', '2024-02-14', '2025-06-30', '2026-05-31', TODAY.toString(), '2026-07-01'];
    const streaks: Record<string, unknown> = {};
    for (const firstDay of [DayOfWeek.MONDAY, DayOfWeek.SUNDAY]) {
      for (const day of days) {
        streaks[`${firstDay.toString()} ${day}`] = normalize(
          calculateStreak(trainingDatesOf(own), firstDay, LocalDate.parse(day)),
        );
      }
    }
    expect(streaks).toMatchSnapshot();
  });

  it('activity calendar months and volume scales', () => {
    const months = ['2023-07', '2024-11', '2025-08', '2026-05', '2026-06'].map((x) => YearMonth.parse(x));
    const calendar = Object.fromEntries(
      months.map((yearMonth) => {
        const month = selectActivityMonth(state(), { own, yearMonth, today: TODAY });
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
    // The feed is empty here, so the scales are the user's own, keyed as the selectors key them.
    expect({ scales: normalize(new Map([[OWN_USER_KEY, own.scale]])), calendar }).toMatchSnapshot();
  });

  it('per-session personal records', async () => {
    expect(normalize(await repository.personalRecords())).toMatchSnapshot();
  });

  it('overall stats, all-time and last 90 days', async () => {
    const earliest = (await repository.earliestDate())!;
    expect(earliest.toString()).toBe('2023-07-05');
    const unit = selectPreferredWeightUnit(state());
    const ranges = {
      allTime: { from: earliest, to: TODAY },
      last90Days: { from: TODAY.minusDays(90), to: TODAY },
    };
    const stats: Record<string, unknown> = {};
    for (const [name, range] of Object.entries(ranges)) {
      const inRange = await repository.finishedBetween(range.from, range.to);
      stats[name] = normalize(withoutIds(calculateStats(inRange, unit, range)));
    }
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

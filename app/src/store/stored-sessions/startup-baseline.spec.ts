import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { LocalDate, YearMonth } from '@js-joda/core';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { sessionsSchema } from '@/db/schema';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import {
  initializeStoredSessionsStateSlice,
  selectHistoryPersonalRecords,
  selectRecentlyCompletedExercises,
  selectSessionsInMonth,
} from '@/store/stored-sessions';
import { selectActivityMonth, selectActivityWeek, selectStreakStats } from '@/store/activity';
import { setIsHydrated as setSettingsIsHydrated } from '@/store/settings';
import { createEffectStore } from '@/utils/__test__/effect-store';
import { generateSyntheticHistory } from '@/utils/__test__/synthetic-history';

/**
 * Startup baseline for the storage rewrite (PM-9; compared against in PM-14). Not part of the normal suite:
 *
 *   npm run bench:startup
 *
 * Seeds an in-memory database with a synthetic history, then measures a cold start the way the app does
 * one: run migrations, hydrate stored sessions (read every row, migrate its payload, build `Session`
 * instances, derive the caches), then the first pass of the whole-history selectors the home and History
 * screens run on mount. Heap is what a hydrated store retains over an empty one, after a forced GC.
 *
 * Numbers come from Node against libsql, not a phone against expo-sqlite, so compare them only with other
 * runs of this script on the same machine.
 */
const SESSION_COUNT = Number(process.env.LIFTLOG_BENCH_SESSIONS ?? 5000);
const RUNS = Number(process.env.LIFTLOG_BENCH_RUNS ?? 5);
const TODAY = LocalDate.parse('2026-06-01');

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  time: async (_: string, action: () => unknown) => action(),
};

function heapUsedMb() {
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
  gc?.();
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

async function seedDatabase(count: number) {
  const expoDb = await openDatabaseAsync(':memory:');
  const db = drizzle(expoDb);
  await new DatabaseMigrationService(db, silentLogger as never, { importOldData: async () => {} }).migrate();
  const sessions = generateSyntheticHistory({ count, end: TODAY });
  for (let i = 0; i < sessions.length; i += 500) {
    await db
      .insert(sessionsSchema)
      .values(sessions.slice(i, i + 500).map((x) => ({ id: x.id, active: false, payload: x.toJSON() })));
  }
  return db;
}

async function coldStart(db: Awaited<ReturnType<typeof seedDatabase>>, expectedSessions: number) {
  const started = performance.now();

  await new DatabaseMigrationService(db, silentLogger as never, { importOldData: async () => {} }).migrate();
  const harness = createEffectStore({
    db,
    logger: silentLogger as never,
    keyValueStore: { getItem: () => Promise.resolve(null) } as never,
  });
  applyStoredSessionsEffects(harness.addEffect);
  harness.store.dispatch(setSettingsIsHydrated(true));
  harness.store.dispatch(initializeStoredSessionsStateSlice());
  await harness.settle();
  const hydrated = performance.now();

  const state = harness.getState();
  selectStreakStats(state, TODAY);
  selectActivityWeek(state, TODAY);
  selectActivityMonth(state, { yearMonth: YearMonth.from(TODAY), today: TODAY });
  selectSessionsInMonth(state, YearMonth.from(TODAY));
  selectHistoryPersonalRecords(state);
  // What the workout screen asks for each exercise it shows.
  for (const exercise of Object.values(state.storedSessions.sessions)[0]?.recordedExercises ?? []) {
    selectRecentlyCompletedExercises(state, undefined)(exercise.movementKey());
  }
  const interactive = performance.now();

  expect(silentLogger.error).not.toHaveBeenCalled();
  expect(state.storedSessions.isHydrated).toBe(true);
  expect(Object.keys(state.storedSessions.sessions)).toHaveLength(expectedSessions);
  return {
    migrateAndHydrateMs: hydrated - started,
    firstAggregatesMs: interactive - hydrated,
    totalMs: interactive - started,
    store: harness.store,
  };
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

describe.skipIf(!process.env.LIFTLOG_BENCH)('startup baseline', () => {
  it(`cold start with ${SESSION_COUNT} sessions`, { timeout: 600_000 }, async () => {
    const db = await seedDatabase(SESSION_COUNT);
    const emptyDb = await seedDatabase(0);

    // Heap first, while nothing has held a history yet. An empty start loads the modules and the exercise
    // catalog, so the difference is what the history itself costs. It is measured once: module-level
    // selectors memoize their last input, so a later run's baseline would still hold an earlier history.
    await coldStart(emptyDb, 0);
    const heapBefore = heapUsedMb();
    const first = await coldStart(db, SESSION_COUNT);
    const retainedHeapMb = heapUsedMb() - heapBefore;
    expect(first.store.getState().storedSessions.isHydrated).toBe(true);

    // The first start above doubles as JIT warm-up, so none of these include it.
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const { store: _, ...timings } = await coldStart(db, SESSION_COUNT);
      runs.push(timings);
    }

    const summary = {
      sessions: SESSION_COUNT,
      runs: RUNS,
      gcExposed: typeof (globalThis as { gc?: unknown }).gc === 'function',
      node: process.version,
      medianMigrateAndHydrateMs: Math.round(median(runs.map((x) => x.migrateAndHydrateMs))),
      medianFirstAggregatesMs: Math.round(median(runs.map((x) => x.firstAggregatesMs))),
      medianTotalMs: Math.round(median(runs.map((x) => x.totalMs))),
      retainedHeapMb: Math.round(retainedHeapMb * 10) / 10,
    };
    // Straight to stdout: Vitest's console interception drops logs from passing tests.
    process.stdout.write(`\nSTARTUP_BASELINE ${JSON.stringify(summary, null, 2)}\n`);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { Client, InStatement } from '@libsql/client';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { LocalDate } from '@js-joda/core';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { applyStoredSessionsEffects } from '@/store/stored-sessions/effects';
import { initializeStoredSessionsStateSlice } from '@/store/stored-sessions';
import { setIsHydrated as setSettingsIsHydrated } from '@/store/settings';
import { createEffectStore } from '@/utils/__test__/effect-store';
import { generateSyntheticHistory } from '@/utils/__test__/synthetic-history';

const END = LocalDate.parse('2026-06-01');

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  time: async (_: string, action: () => unknown) => action(),
};

interface Statement {
  sql: string;
  rows: number;
}

/**
 * Hydrates the store over `count` finished workouts and one in progress, the way the app starts, and
 * returns every statement the startup effect issued with the rows each returned.
 */
async function hydrate(count: number) {
  const client = (await openDatabaseAsync(':memory:')) as unknown as Client;
  const db = drizzle(client as never);
  await new DatabaseMigrationService(db, silentLogger as never, { importOldData: async () => {} }).migrate();
  const workoutRepository = new WorkoutRepository(db);
  const history = generateSyntheticHistory({ count: count + 1, end: END });
  await workoutRepository.putMany(history.slice(0, count));
  await workoutRepository.setActive(history[count]!.with({ id: 'in-progress' }));

  const statements: Statement[] = [];
  const execute = client.execute.bind(client);
  client.execute = (async (statement: InStatement) => {
    const result = await execute(statement);
    statements.push({ sql: typeof statement === 'string' ? statement : statement.sql, rows: result.rows.length });
    return result;
  }) as Client['execute'];
  const wholeHistory = vi.spyOn(workoutRepository, 'loadAll');

  const harness = createEffectStore({
    db,
    workoutRepository,
    logger: silentLogger as never,
    keyValueStore: { getItem: () => Promise.resolve(null) } as never,
  });
  applyStoredSessionsEffects(harness.addEffect);
  harness.store.dispatch(setSettingsIsHydrated(true));
  harness.store.dispatch(initializeStoredSessionsStateSlice());
  await harness.settle();

  expect(silentLogger.error).not.toHaveBeenCalled();
  expect(wholeHistory).not.toHaveBeenCalled();
  return { statements, state: harness.getState() };
}

const rowsRead = (statements: Statement[]) => statements.reduce((total, x) => total + x.rows, 0);
/** A statement's shape: an `in` list reads as one placeholder, however many ids it holds. */
const shapes = (statements: Statement[]) => statements.map((x) => x.sql.replace(/\(\?(, \?)*\)/g, '(?)'));

describe('startup reads of the history', () => {
  it('are the same bounded queries over 300 workouts as over 3,000', { timeout: 60_000 }, async () => {
    const small = await hydrate(300);
    const large = await hydrate(3000);

    // Only the workout in progress is loaded into the store.
    for (const { state } of [small, large]) {
      expect(state.storedSessions.isHydrated).toBe(true);
      expect(Object.keys(state.storedSessions.sessions)).toEqual(['in-progress']);
      expect(state.storedSessions.activeSessionId).toBe('in-progress');
    }
    // Ten times the history issues the very same statements: none is chunked by the number of workouts.
    expect(shapes(large.statements)).toEqual(shapes(small.statements));
    expect(large.statements).toHaveLength(12);
    // And each returns a bounded number of rows: the workout in progress, the latest performance of each
    // lineage (rebuilt from the few workouts that hold them) and the exercise list. 3,000 workouts are
    // about 70,000 rows; startup reads well under a thousand of them, as it does for 300.
    expect(rowsRead(large.statements)).toBeLessThan(1000);
    expect(rowsRead(large.statements)).toBeLessThan(rowsRead(small.statements) * 1.5);
  });
});

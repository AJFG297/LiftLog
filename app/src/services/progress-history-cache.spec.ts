import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { LocalDate } from '@js-joda/core';
import { WorkoutRepository } from '@/services/workout-repository';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { progressHistoryCacheFor, ProgressHistoryCache } from '@/services/progress-history-cache';
import { generateSyntheticHistory } from '@/utils/__test__/synthetic-history';
import { buildProgressHistory } from '@/store/stats/progress-history';
import { stubExerciseId } from '@/models/blueprint-models';

const today = LocalDate.parse('2026-06-01');
const logger = { info() {}, warn() {}, error() {}, debug() {} };
const history = generateSyntheticHistory({ count: 8, end: today });

describe('ProgressHistoryCache', () => {
  let database: ReturnType<typeof drizzle>;
  let repository: WorkoutRepository;
  let cache: ProgressHistoryCache;
  beforeEach(async () => {
    const db = drizzle(await openDatabaseAsync(':memory:'));
    database = db;
    await new DatabaseMigrationService(db, logger as never, { importOldData: async () => {} }).migrate();
    repository = new WorkoutRepository(db);
    await repository.putMany(history);
    cache = progressHistoryCacheFor(repository);
  });

  it('is lazy, shared per repository, and deduplicates concurrent and subsequent reads', async () => {
    const reads = vi.spyOn(repository, 'finishedBetween');
    expect(reads).not.toHaveBeenCalled();
    expect(progressHistoryCacheFor(repository)).toBe(cache);
    const pending = cache.read(today);
    expect(cache.read(today)).toBe(pending);
    const first = await pending;
    expect(await cache.read(today)).toBe(first);
    expect(reads).toHaveBeenCalledTimes(1);
    const expected = await repository.finishedBetween(today.minusYears(1), today);
    expect(first).toEqual(buildProgressHistory(expected.reverse()));
    expect(progressHistoryCacheFor(new WorkoutRepository({} as never))).not.toBe(cache);
  });

  it('refreshes correctly after insert, edit, delete, import, merge, and active changes', async () => {
    let previous = await cache.read(today);
    const assertFresh = async () => {
      const current = await cache.read(today);
      expect(current).not.toBe(previous);
      const expected = await repository.finishedBetween(today.minusYears(1), today);
      expect(current).toEqual(buildProgressHistory(expected.reverse()));
      previous = current;
    };
    const added = history[0]!.with({ id: 'added' });
    await repository.put(added);
    await assertFresh();
    await repository.put(added.with({ date: today.minusDays(1) }));
    await assertFresh();
    await repository.delete(added.id);
    await assertFresh();
    await repository.prepareImport([added]).write();
    await assertFresh();
    await repository.repointExercises(
      new Map([[added.recordedExercises[0]!.blueprint.exerciseId, stubExerciseId('Merged movement')]]),
    );
    await assertFresh();
    await repository.setActive(added);
    await assertFresh();
    await repository.setActive(undefined);
    await assertFresh();
  });

  it('ignores committed active-only content updates but refreshes for a mixed import', async () => {
    const active = history[0]!.with({ id: 'active' });
    await repository.setActive(active);
    const first = await cache.read(today);
    const reads = vi.spyOn(repository, 'finishedBetween');
    await repository.put(active.with({ date: today.minusDays(1) }));
    await repository.putCurrent(() => active, active);
    expect(await cache.read(today)).toBe(first);
    expect(reads).not.toHaveBeenCalled();
    await repository.putMany([active, history[0]!.with({ id: 'finished' })]);
    expect(await cache.read(today)).not.toBe(first);
  });

  it('discards an interrupted read before returning to any waiting caller', async () => {
    const old = await repository.finishedBetween(today.minusYears(1), today);
    let resolve!: (value: typeof old) => void;
    const gate = new Promise<typeof old>((yes) => {
      resolve = yes;
    });
    const reads = vi.spyOn(repository, 'finishedBetween').mockImplementationOnce(() => gate);
    const first = cache.read(today);
    await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(1));
    await repository.put(history[0]!.with({ id: 'during-load' }));
    const second = cache.read(today);
    expect(second).toBe(first);
    resolve(old);
    const result = await first;
    expect(await second).toBe(result);
    expect(result.workouts.some((w) => w.workoutId === 'during-load')).toBe(true);
    expect(reads).toHaveBeenCalledTimes(2);
    expect(await cache.read(today)).toBe(result);
  });

  it('does not invalidate for a rolled-back write', async () => {
    const first = await cache.read(today);
    vi.spyOn(database, 'transaction').mockImplementationOnce(() => {
      throw new Error('rollback');
    });
    await expect(repository.put(history[0]!.with({ id: 'failed' }))).rejects.toThrow('rollback');
    expect(await cache.read(today)).toBe(first);
  });

  it('invalidates conservatively if classifying a committed write fails', async () => {
    const first = await cache.read(today);
    vi.spyOn(database, 'select').mockImplementationOnce(() => {
      throw new Error('classification failed');
    });
    await repository.put(history[0]!.with({ id: 'committed' }));
    const current = await cache.read(today);
    expect(current).not.toBe(first);
    expect(current.workouts.some((w) => w.workoutId === 'committed')).toBe(true);
  });

  it('can retry a failed read', async () => {
    vi.spyOn(repository, 'earliestDate').mockRejectedValueOnce(new Error('read failed'));
    await expect(cache.read(today)).rejects.toThrow('read failed');
    expect((await cache.read(today)).workouts).toHaveLength(history.length);
  });

  it('refreshes on a new date and caches empty history', async () => {
    const future = history[0]!.with({ id: 'tomorrow', date: today.plusDays(1) });
    await repository.put(future);
    const first = await cache.read(today);
    expect(first.workouts.some((w) => w.workoutId === future.id)).toBe(false);
    expect((await cache.read(today.plusDays(1))).workouts.some((w) => w.workoutId === future.id)).toBe(true);
    const emptyRepository = new WorkoutRepository({} as never);
    vi.spyOn(emptyRepository, 'earliestDate').mockResolvedValue(undefined);
    const empty = progressHistoryCacheFor(emptyRepository);
    const value = await empty.read(today);
    expect(value.workouts).toEqual([]);
    expect(await empty.read(today)).toBe(value);
  });
});

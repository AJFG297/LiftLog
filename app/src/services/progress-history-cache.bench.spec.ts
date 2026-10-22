import { describe, expect, it, vi } from 'vitest';
import type { Client, InStatement } from '@libsql/client';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { LocalDate } from '@js-joda/core';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { progressHistoryCacheFor } from '@/services/progress-history-cache';
import * as progress from '@/store/stats/progress-history';
import { generateSyntheticHistory } from '@/utils/__test__/synthetic-history';

// Node/libsql data-path timings, not route/render timings. Alternate the order of the pre-cache
// algorithm and the cache against the same seeded database, discarding the first trial as warm-up.
const RUNS = Number(process.env.LIFTLOG_BENCH_RUNS ?? 5);
const today = LocalDate.parse('2026-06-01');
const logger = { info() {}, warn() {}, error() {}, debug() {} };
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const round = (n: number) => Math.round(n * 1000) / 1000;
async function reference(repository: WorkoutRepository) {
  const earliest = await repository.earliestDate();
  return progress.buildProgressHistory(earliest ? (await repository.finishedBetween(earliest, today)).reverse() : []);
}
interface Sample {
  ms: number;
  sqlReads: number;
  modelBuilds: number;
}

describe.skipIf(!process.env.LIFTLOG_BENCH)('Progress navigation benchmark', () => {
  for (const count of [500, 5000])
    it(`${count} workouts`, { timeout: 240_000 }, async () => {
      const client = await openDatabaseAsync(':memory:');
      const db = drizzle(client);
      await new DatabaseMigrationService(db, logger as never, { importOldData: async () => {} }).migrate();
      const history = generateSyntheticHistory({ count, end: today });
      await new WorkoutRepository(db).putMany(history);
      const build = vi.spyOn(progress, 'buildProgressHistory');
      let sqlReads = 0;
      const sqlClient = client as unknown as Client;
      const execute = sqlClient.execute.bind(sqlClient);
      sqlClient.execute = ((statement: InStatement) => {
        const sql = typeof statement === 'string' ? statement : statement.sql;
        if (/^\s*(select|with)\b/i.test(sql)) sqlReads++;
        return execute(statement);
      }) as Client['execute'];
      const samples: Record<string, Sample[]> = {};
      async function measure(name: string, load: () => Promise<progress.ProgressHistory>, keep: boolean) {
        const reads = sqlReads,
          builds = build.mock.calls.length,
          start = performance.now();
        const value = await load();
        if (keep)
          (samples[name] ??= []).push({
            ms: performance.now() - start,
            sqlReads: sqlReads - reads,
            modelBuilds: build.mock.calls.length - builds,
          });
        build.mockClear();
        return value;
      }
      for (let run = 0; run <= RUNS; run++) {
        for (const variant of run % 2 ? ['cached', 'reference'] : ['reference', 'cached']) {
          const repository = new WorkoutRepository(db);
          const cache = variant === 'cached' ? progressHistoryCacheFor(repository) : undefined;
          const load = () => (cache ? cache.read(today) : reference(repository));
          const first = await measure(`${variant}.cold`, load, run > 0);
          for (let route = 0; route < 3; route++) {
            const next = await measure(`${variant}.warm`, load, run > 0);
            expect(next.workouts.length).toBe(first.workouts.length);
            if (cache) expect(next).toBe(first);
          }
          const added = history.at(-1)!.with({ id: 'benchmark-refresh' });
          await repository.put(added);
          const refreshed = await measure(`${variant}.refresh`, load, run > 0);
          expect(refreshed.workouts.some((w) => w.workoutId === added.id)).toBe(true);
          await repository.delete(added.id);
        }
      }
      const summary = Object.fromEntries(
        Object.entries(samples).map(([name, values]) => [
          name,
          {
            ms: round(median(values.map((v) => v.ms))),
            sqlReads: median(values.map((v) => v.sqlReads)),
            modelBuilds: median(values.map((v) => v.modelBuilds)),
            samples: values.length,
          },
        ]),
      );
      expect(summary['cached.warm']!.sqlReads).toBe(0);
      expect(summary['cached.warm']!.modelBuilds).toBe(0);
      build.mockRestore();
      // Approximate retained JS models for four mounted screens, excluding React/native allocations.
      const gc = (globalThis as { gc?: () => void }).gc;
      let memory: Record<string, number> | undefined;
      if (gc) {
        const heap = () => {
          gc();
          gc();
          return process.memoryUsage().heapUsed / 1024 / 1024;
        };
        const retained: Record<string, number[]> = { reference: [], cached: [] };
        async function retainedModels(variant: string): Promise<number> {
          const baseline = heap();
          const repository = new WorkoutRepository(db);
          const cache = variant === 'cached' ? progressHistoryCacheFor(repository) : undefined;
          const models: progress.ProgressHistory[] = [];
          for (let screen = 0; screen < 4; screen++)
            models.push(await (cache ? cache.read(today) : reference(repository)));
          const delta = heap() - baseline;
          expect(models).toHaveLength(4);
          return delta;
        }
        for (const variant of ['reference', 'cached']) {
          for (let run = 0; run < 3; run++) retained[variant]!.push(await retainedModels(variant));
        }
        memory = Object.fromEntries(Object.entries(retained).map(([name, values]) => [name, round(median(values))]));
      }
      process.stdout.write(
        `PROGRESS_BENCH ${JSON.stringify({ count, runs: RUNS, node: process.version, summary, fourScreenRetainedHeapMb: memory })}\n`,
      );
      await client.closeAsync();
    });
});

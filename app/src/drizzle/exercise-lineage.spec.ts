import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { asc, sql } from 'drizzle-orm';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { workoutExercisesSchema } from '@/db/schema';
import { lineageKeys } from '@/models/blueprint-models';
import { makeCardioBlueprint, makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';

/**
 * Migration 0013 adds `workout_exercise.lineage` and fills it for the rows already stored, which the app
 * otherwise writes from `lineageKeys`. Its backfill must number them the same way.
 */
describe('0013_exercise_lineage', () => {
  it('fills the lineage of stored exercises as lineageKeys numbers them', async () => {
    const db = drizzle(await openDatabaseAsync(':memory:'));
    await new DatabaseMigrationService(db, { info: vi.fn() } as never, { importOldData: async () => {} }).migrate();
    const bench = makeWeightedBlueprint({ name: 'Bench', exerciseId: 'Bench' });
    const squat = makeWeightedBlueprint({ name: 'Squat', exerciseId: 'Squat' });
    const sessions = [
      makeSession([bench, squat, bench, makeCardioBlueprint(), bench]),
      makeSession([squat, bench]),
    ];
    await new WorkoutRepository(db).putMany(sessions);
    // Rows as a build before the column wrote them.
    await db.update(workoutExercisesSchema).set({ lineage: '' });

    const migration = readFileSync(resolve(__dirname, '0013_exercise_lineage.sql'), 'utf8');
    const backfill = migration.split('--> statement-breakpoint').find((x) => x.trim().startsWith('UPDATE'))!;
    // The drizzle types are expo's synchronous driver; under Vitest it is libsql, which is async.
    await Promise.resolve(db.run(sql.raw(backfill)));

    for (const session of sessions) {
      const rows = await db
        .select({ lineage: workoutExercisesSchema.lineage })
        .from(workoutExercisesSchema)
        .where(sql`${workoutExercisesSchema.workoutId} = ${session.id}`)
        .orderBy(asc(workoutExercisesSchema.position));
      expect(rows.map((x) => x.lineage)).toEqual(lineageKeys(session.recordedExercises));
    }
    expect(lineageKeys(sessions[0]!.recordedExercises).filter((x) => x.includes('#'))).toEqual([
      'Bench_WeightedExerciseBlueprint#2',
      'Bench_WeightedExerciseBlueprint#3',
    ]);
  });
});

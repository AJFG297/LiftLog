import { createClient } from '@libsql/client';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import type { Session } from '@/models/session-models';
import { WorkoutRepository } from '@/services/workout-repository';

import { createFixture } from './fixture';

const WEIGHTED_SETS_QUERY = `
  SELECT position, reps, weight_value, weight_unit, completed_at
  FROM weighted_set
  WHERE workout_id = 'browser-workout'
  ORDER BY exercise_position, position
`.trim();

const ACTIVE_WORKOUT_QUERY = `
  SELECT *
  FROM workout
  WHERE active = 1
`.trim();

export interface VerificationDatabase {
  load(): Promise<Session>;
  save(session: Session): Promise<void>;
  evidence(): Promise<unknown>;
  close(): void;
}

export async function openVerificationDatabase(databasePath: string): Promise<VerificationDatabase> {
  const resolvedDatabasePath = resolve(databasePath);
  await mkdir(dirname(resolvedDatabasePath), { recursive: true });

  const client = createClient({ url: `file:${resolvedDatabasePath}` });
  const database = drizzle(client);
  const migrationsFolder = resolve(process.cwd(), 'src/drizzle');
  await migrate(database, { migrationsFolder });

  // WorkoutRepository uses only Drizzle's shared SQLite query API. The application types it to the
  // Expo driver, while this Node-only verifier supplies the equivalent libSQL driver used by its tests.
  const repository = new WorkoutRepository(database as unknown as ExpoSQLiteDatabase);
  if (!(await repository.active())) {
    await repository.setActive(createFixture());
  }

  return {
    async load() {
      const activeSession = await repository.active();
      if (!activeSession) {
        throw new Error('The verification database has no active workout');
      }
      return activeSession;
    },

    async save(session) {
      await repository.setActive(session);
    },

    async evidence() {
      const [weightedSets, activeWorkout] = await Promise.all([
        client.execute(WEIGHTED_SETS_QUERY),
        client.execute(ACTIVE_WORKOUT_QUERY),
      ]);

      return {
        databasePath: resolvedDatabasePath,
        query: {
          weightedSets: WEIGHTED_SETS_QUERY,
          activeWorkout: ACTIVE_WORKOUT_QUERY,
        },
        weightedSets: weightedSets.rows,
        activeWorkout: activeWorkout.rows[0] ?? null,
      };
    },

    close() {
      client.close();
    },
  };
}

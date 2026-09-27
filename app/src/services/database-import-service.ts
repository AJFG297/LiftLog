import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { dataMigrationsSchema } from '@/db/schema';
import { KeyValueStore } from './key-value-store';
import { PreferenceService } from './preference-service';

import {
  dedupeBuiltInExercises,
  dedupeBuiltInExercisesDataMigration,
} from '@/services/data-migrations/dedupe-builtin-exercises';
import { importBackends, importBackendsDataMigration } from '@/services/data-migrations/import-backends';
import {
  seedBackendAssignments,
  seedBackendAssignmentsDataMigration,
} from '@/services/data-migrations/seed-backend-assignments';

export interface DatabaseImporter {
  importOldData(): Promise<void>;
}

export class DatabaseImportService implements DatabaseImporter {
  // DO NOT Add a dependency to getState here, it gets messy quick
  constructor(
    private readonly db: ExpoSQLiteDatabase,
    private readonly keyValueStore: KeyValueStore,
    private readonly preferenceService: PreferenceService,
  ) {}

  async importOldData(): Promise<void> {
    const now = performance.now();
    const dataMigrationsRun = (await this.db.select().from(dataMigrationsSchema)).map((x) => x.id);

    if (!dataMigrationsRun.includes(dedupeBuiltInExercisesDataMigration)) {
      await dedupeBuiltInExercises(this.db, this.keyValueStore);
    }
    if (!dataMigrationsRun.includes(importBackendsDataMigration)) {
      await importBackends(this.db, this.preferenceService);
    }
    if (!dataMigrationsRun.includes(seedBackendAssignmentsDataMigration)) {
      await seedBackendAssignments(this.db);
    }

    console.info('Imported old data to DB in ' + (performance.now() - now) + 'ms');
  }
}

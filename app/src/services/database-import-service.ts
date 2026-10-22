import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { dataMigrationsSchema } from '@/db/schema';
import { KeyValueStore } from './key-value-store';
import { PreferenceService } from './preference-service';

import {
  dedupeBuiltInExercises,
  dedupeBuiltInExercisesDataMigration,
} from '@/services/data-migrations/dedupe-builtin-exercises';
import { readHiddenBuiltInIds } from '@/services/hidden-built-in-exercises';
import { importBackends, importBackendsDataMigration } from '@/services/data-migrations/import-backends';
import { linkExerciseIds, linkExerciseIdsDataMigration } from '@/services/data-migrations/link-exercise-ids';
import { linkRoutineIds, linkRoutineIdsDataMigration } from '@/services/data-migrations/link-routine-ids';
import { mergeExerciseNames, mergeExerciseNamesDataMigration } from '@/services/data-migrations/merge-exercise-names';
import { rekeyProgression, rekeyProgressionDataMigration } from '@/services/data-migrations/rekey-progression';
import { restoreMuscleRoles, restoreMuscleRolesDataMigration } from '@/services/data-migrations/restore-muscle-roles';
import {
  seedBackendAssignments,
  seedBackendAssignmentsDataMigration,
} from '@/services/data-migrations/seed-backend-assignments';

export interface DatabaseImporter {
  importOldData(): Promise<void>;
}

export class DatabaseImportService implements DatabaseImporter {
  constructor(
    private readonly db: ExpoSQLiteDatabase,
    private readonly keyValueStore: KeyValueStore,
    private readonly preferenceService: PreferenceService,
    private readonly inWriteOrder: (operation: () => Promise<void>) => Promise<void> = (operation) => operation(),
  ) {}

  async importOldData(): Promise<void> {
    await this.inWriteOrder(() => this.importDatabase());
  }

  private async importDatabase(): Promise<void> {
    const now = performance.now();
    const dataMigrationsRun = (await this.db.select().from(dataMigrationsSchema)).map((x) => x.id);

    if (!dataMigrationsRun.includes(dedupeBuiltInExercisesDataMigration)) {
      await dedupeBuiltInExercises(this.db, this.keyValueStore);
    }
    if (!dataMigrationsRun.includes(restoreMuscleRolesDataMigration)) {
      await restoreMuscleRoles(this.db);
    }
    if (!dataMigrationsRun.includes(importBackendsDataMigration)) {
      await importBackends(this.db, this.preferenceService);
    }
    if (!dataMigrationsRun.includes(seedBackendAssignmentsDataMigration)) {
      await seedBackendAssignments(this.db);
    }
    // After the built-in de-dup, so names match the exercises that are left.
    if (!dataMigrationsRun.includes(linkExerciseIdsDataMigration)) {
      await linkExerciseIds(this.db);
    }
    if (!dataMigrationsRun.includes(rekeyProgressionDataMigration)) {
      await rekeyProgression(this.db);
    }
    // After linking, which made the stubs it merges.
    if (!dataMigrationsRun.includes(mergeExerciseNamesDataMigration)) {
      await mergeExerciseNames(this.db, await readHiddenBuiltInIds(this.keyValueStore));
    }
    // After the plans are in their latest shape. A restored backup calls `linkRoutineIds` itself:
    // this flag is already set on the device, and the backup's programs are not in the database yet.
    if (!dataMigrationsRun.includes(linkRoutineIdsDataMigration)) {
      await linkRoutineIds(this.db);
    }

    console.info('Imported old data to DB in ' + (performance.now() - now) + 'ms');
  }
}

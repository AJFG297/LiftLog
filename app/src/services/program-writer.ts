import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import type { RootState } from '@/store';
import { programsSchema } from '@/db/schema';
import { writeAtomically } from '@/db/helpers';

export class ProgramWriter {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly db: ExpoSQLiteDatabase,
    private readonly getState: () => RootState,
  ) {}

  run<T>(operation: (flush: () => Promise<void>) => Promise<T>): Promise<T> {
    const run = this.tail.then(() => operation(() => this.flushCurrent()));
    this.tail = run.catch(() => undefined);
    return run;
  }

  flush(): Promise<void> {
    return this.run((flush) => flush());
  }

  private async flushCurrent(): Promise<void> {
    await writeAtomically(this.db, (tx) => {
      const { savedPrograms, activePlanId } = this.getState().program;
      const rows = Object.entries(savedPrograms).map(([id, program]) => ({
        id,
        active: id === activePlanId,
        payload: program.toJSON(),
      }));
      return [tx.delete(programsSchema), ...(rows.length ? [tx.insert(programsSchema).values(rows)] : [])];
    });
  }
}

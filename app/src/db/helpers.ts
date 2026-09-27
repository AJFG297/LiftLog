import { Column, sql } from 'drizzle-orm';
import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { AnySQLiteTable, IndexColumn } from 'drizzle-orm/sqlite-core';

type JsonTableValue<T, K> = {
  id: K;
  payload: T;
};

export async function upsert<T, K>(
  db: ExpoSQLiteDatabase,
  schema: AnySQLiteTable & {
    id: IndexColumn;
    payload: Column & { _: { $type: T } };
  },
  values: JsonTableValue<T, K>[],
) {
  if (!values.length) {
    return;
  }
  await db
    .insert(schema)
    .values(values)
    .onConflictDoUpdate({
      target: schema.id,
      set: {
        payload: sql.raw(`excluded.${schema.payload.name}`),
      },
    });
}

export type Transaction = Parameters<Parameters<ExpoSQLiteDatabase['transaction']>[0]>[0];

/**
 * Runs the statements `build` returns in one transaction, in order.
 *
 * On a device the expo-sqlite driver is synchronous: its `transaction()` commits as soon as the callback
 * returns, so an `async` callback commits before any statement it awaits has run. Each `run()` here
 * executes on the spot instead, inside the transaction. Under Vitest the driver is libsql, which is
 * async; its `run()` returns a promise, so the rest are chained behind it and the transaction awaits them.
 */
export async function writeAtomically(
  db: ExpoSQLiteDatabase,
  build: (tx: Transaction) => { run(): unknown }[],
): Promise<void> {
  // Typed as the synchronous driver; `Promise.resolve` also covers the async one.
  await Promise.resolve(
    db.transaction((tx) => {
      let pending: Promise<unknown> | undefined;
      for (const statement of build(tx)) {
        if (pending) {
          pending = pending.then(() => statement.run());
          continue;
        }
        const result = statement.run();
        if (result instanceof Promise) {
          pending = result;
        }
      }
      return pending as never;
    }),
  );
}

# Import ownership verification

`HistoryImport.apply` owns acknowledgement from hydration through persistence, committed-round identity
repair, latest-state flush, and cache refresh. Ordinary program and descriptor writes use the same queues.
SQL transactions serialize per database, while reducers remain synchronous during awaits.

The pre-change middleware probe failed on premature success, concurrent duplicate insertion, and retry
that skipped committed identity repair. The production-owner integration suite now exercises these paths
against real SQLite, along with every failure stage, current-state edits, logged open workouts, startup
markers, and independent stores.

The import is several durable transactions. Failure retains earlier writes and reports completed and
possible stages. A duplicate retry repairs remaining state before acknowledging unchanged input.

Run `npx vitest run src/services/history-import.spec.ts --maxWorkers=2` from `app/` for focused proof.
The full gates are Vitest with two workers, `npm run typecheck`, `npm run lint`, and `npm run format:check`.
Native verification and pinned screenshots are supplied separately by the parent after fresh review.

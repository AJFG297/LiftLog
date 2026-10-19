# Agent-friendly architecture

Approved on 2026-10-12 and implemented as a stack the operator lands:
[transaction boundary](https://github.com/AJFG297/LiftLog/pull/56),
[import completion](https://github.com/AJFG297/LiftLog/pull/57), then
[workout entry](https://github.com/AJFG297/LiftLog/pull/58).
Each PR body records its exact verifier head, checks and any unverified scenario.

Keep the repository, Redux and domain-model boundaries. The changes move temporal coordination into
small owners and enforce the paths that bypass them. The [evidence appendix](./agent-friendly-architecture-evidence.md)
records the repair census, experiments, rejected alternatives and reproduction commands.

## Why these three changes

The investigation sampled the latest 120 non-merge commits touching `app/` at `0f446e73` and inspected
all 37 repair-labelled patches. Seven were primarily about async ordering or cache ownership; six were
about workout-entry semantics. These are repair counts, with follow-ups counted separately. They do not
measure independent incidents, agent error rates or authorship. The historical faulty instances were
already mitigated; current experiments determined which boundaries still needed work.

| Priority | Decisive evidence | Boundary |
| --- | --- | --- |
| Transaction access | Existing lint accepted two historical unsafe files; the new restriction rejects their three calls. | Raw transaction access belongs only to `db/helpers.ts`. Callers use `writeAtomically`. |
| Import completion | A real effect showed success before a controlled workout write failed; duplicate retry could skip unfinished repair. | `HistoryImport.apply` awaits the required stages and returns a completion outcome. Program and descriptor writers read current state inside ordered writes. |
| Workout entry | Removing the queue failed tap order. A per-store queue preserved it, and the add/swap prototype removed keys and callback assembly from callers. | `exerciseEntry` owns add, swap and editor-save coordination for one store, with one queue per workout. |

## Ownership and use

```ts
const result = await services.historyImport.apply({ kind: 'external', data: parsed });
// The caller translates the outcome; only completion produces its success message.

void services.exerciseEntry.add({ workoutId, picked, asSuperset, onAdded });
const target = services.exerciseEntry.target({ workoutId, index });
if (target) void services.exerciseEntry.swap({ target, picked: replacement });
```

| Owner | Responsibility |
| --- | --- |
| `services/history-import.ts` | Import FIFO, hydration, linking, external dedupe, durable completion, repair, cache refresh and failure outcome. |
| `ProgramWriter` and `DescriptorWriter` | Current-state table snapshots shared by ordinary effects, startup and import. Queue composition stays private. |
| `WorkoutRepository` | Workout rows, active flags, ordered reads/writes and notifications. A bounded prepared-import intent protects later ordinary edits and deletions. |
| `store/stored-sessions/exercise-entry.ts` | Per-store/per-workout FIFO, opaque targets, carry-over lookup and fallback, current-state application and first-added callback. |
| `models/exercise-pick.ts` and existing session models | The existing pick defaults, superset append, progression, warm-ups, logged-set preservation and replacement/edit calculations. |
| `services/index.ts` | Instantiates the owners once per store and exposes their intended capabilities. |

The add hook, live swap caller and editor draft pass domain input to the entry owner. The editor
captures its target when dismissed, as before. Swap uses the captured movement guard; edit uses the
stricter captured-blueprint identity guard after any asynchronous lookup. Targets belong to their
creating owner and apply only while their workout is open and the command guard holds. They make no
stronger promise about arbitrary reorders. A failed history lookup retains the existing logged fallback behavior.

The cache-only entry path dispatches and calls `onAdded` before its promise is returned. Requests for
one workout retain tap order; different workouts and stores have independent queues. Live set logging
keeps its existing synchronous path. Picker list and route-result handling stay with their UI owners.
The old public carry-over callback helper and hook were removed with the caller migration.

## Import durability

`complete`, `unchanged` and `failed` are distinct outcomes. A failure records its stage, known completed
stages, possible writes and committed merge rounds. Earlier commits can remain; retry repeats repair
and cache refresh even when there are no new workout IDs. Own backups retain linked IDs and never
resume an imported workout. External imports retain deterministic IDs and first-import-wins policy.
Feed restore keeps its separate confirmation after local data completes.

Import acquires the program writer before the descriptor writer, then uses repository and connection
write ordering. Private flush capabilities avoid queue re-entry. Each committed merge round repoints
current routines, descriptors and open workouts before later awaits or notifications. Current-state
reads at the atomic write boundary preserve ordinary saves made while an import waits. If both a
survivor and loser descriptor changed, the survivor edit wins; otherwise a changed loser follows the
survivor. The closed-workout fallback follows only merge rounds committed after its write was queued.

The prepared import intent is registered immediately before private Redux application and removed in
`finally`. A later ordinary content write, activation write or deletion supersedes its matching row.
The import emits only rows it wrote and awaits superseding write outcomes outside the repository
reservation, preventing a queue cycle. A failed superseding write produces failure rather than false
completion. Current activation callers put content before activating; a future activation-only caller
must preserve or revise that invariant.

## Enforcement and verification

Focused ESLint rules direct unsafe access to the owning operation. They cover supported static
transaction access, private import composition and entry bypasses, with legal and forbidden fixtures.
Factory runtime loading is restricted to the composition root; type-only imports remain legal.
Dynamic property/module construction, aliased loaders and arbitrary intermediary laundering are
outside the fences' stated guarantee. Existing Hermes restrictions remain effective.

Each phase requires the app suite, typecheck, lint and formatting, plus two independent source reviews
before Android verification. Import proof uses real rows and injected failures across stages,
committed-round retry, ordinary save/delete overlap, recovery and store isolation. Entry proof retains
the 21 existing cases and adds synchronous dispatch, isolation, stale/foreign/closed targets, editor
identity and literal SQLite values. Start/repeat comparisons retain their own production paths.

Android replay follows `verify-liftlog/PROCESS.md` through real screens and the file picker. Fixtures
provide only starting conditions; SQL snapshots check side effects. Changed screens use matching
before/after light/dark screenshots pinned on `pr-assets`. A scenario that cannot run is explicitly
NOT RUN, never represented as a passing device result. Phase B's controlled Android save/merge
interleaving remains NOT RUN; its real SQLite/libsql probes are separate evidence. The operator retains
landing authority for the linear stack.

## Deferred changes and rollback

The independent prototype cross-judge preferred a smaller store-scoped queue. The entry-owner pilot
was retained because all three callers lose carry-over keys and raw mutation assembly while keeping
the behavioral floor. This demonstrates fewer caller obligations, not measured agent speed or future
reliability. A tested scoped queue remains the rollback option if that benefit does not hold.

Stable routine-occurrence IDs need a separate navigation-reachability investigation. Progress SQL
optimization needs a device measurement. Record policies retain their intentional differences. A
feature-folder rewrite, command bus and persistence framework had no demonstrated advantage in this
investigation. Manual and AI-assisted plan creation continue using the same editable draft; the
workout-history import owner is a separate path.

Revert the transaction rule independently if needed. Revert entry owner and callers together, retaining
the tested store-scoped queue if appropriate. Reverting import code leaves durable data in place;
inspect partial data and rerun repair. There is no schema or wire-format migration in this stack.

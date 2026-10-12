# Architecture evidence and reproduction

## Repair census

Pinned source: `0f446e7336c803209e9279a2adbf9b873fd0dead`. Sample: all reachable non-merge commits touching
`app/`, ordered by committer timestamp descending, with Git traversal order breaking ties; take 120.
There were 37 explicit repair-labelled commits and 83 other commits; 26 repairs changed test paths.
Primary categories below are mutually exclusive. Multiple follow-ups in one PR count separately.

The classification came from patch inspection. Assistance trailers establish assistance, not fault
introduction or responsibility. No agent-versus-human failure rate is inferred. The mitigation column
records source inspected at the pinned revision, not an independent runtime replay of every repair.
Precursor commits were not uniformly proven introducing commits.

| Primary category | Repairs /37 |
| --- | --- |
| async cache ordering | 7 |
| entry path semantics | 6 |
| migration integrity | 4 |
| stats population and window | 4 |
| presentation and empty state | 4 |
| history resource lifetime | 3 |
| numeric display consistency | 3 |
| native gesture containment | 2 |
| untouched edit roundtrip | 1 |
| identity name fold | 1 |
| search ranking | 1 |
| foreground date refresh | 1 |

| Repair commit | Primary category | Fault described by the patch | Mitigation inspected at the pinned revision |
| --- | --- | --- | --- |
| [bda439ee](https://github.com/AJFG297/LiftLog/commit/bda439eed0add4b7504d63a87a924ba282513966) | untouched edit roundtrip | Rest 2:22 displayed as 2:20 and saving without moving a wheel rewrote it. | restWithPick preserves the original Rest when the pick equals its initial rounded position. |
| [674f292b](https://github.com/AJFG297/LiftLog/commit/674f292b05a3dd0a29bafb1b048d92935a987911) | native gesture containment | Dragging near wheel numbers, units or side margins still dragged the native sheet. | GestureDetector now owns each full-width column. |
| [adf3b2d7](https://github.com/AJFG297/LiftLog/commit/adf3b2d7537b93f978cf69ae19d75fd8dd142cb2) | native gesture containment | The second nested scroll wheel could yield a drag to the Android sheet, including at scroll edges. | A pan gesture replaces nested ScrollViews. |
| [2638d8dc](https://github.com/AJFG297/LiftLog/commit/2638d8dc39b7aa977c5e99b2a9bf22268d793688) | async cache ordering | Adding a set while a swap awaited carry-over changed blueprint identity and silently discarded the valid swap. | The swap compares movement identity and applies to the current plan. |
| [03f50c6a](https://github.com/AJFG297/LiftLog/commit/03f50c6a683b3b369b0ba6ad0e366f664349c396) | async cache ordering | A failed previous-workout read fell back to a cache with own-workout entries filtered away and lost useful numbers silently. | Read failure logs an error and uses current own-workout cache numbers for affected keys. |
| [ab21cd7c](https://github.com/AJFG297/LiftLog/commit/ab21cd7cdfe16c64181dd96f870bcb7e90acef05) | async cache ordering | Repeat depended on callers passing their subscribed cache snapshot. | SessionService.repeatSession reads the store on invocation. |
| [c998a983](https://github.com/AJFG297/LiftLog/commit/c998a98303ca71b88865a3d96dd4462fa884d022) | async cache ordering | A second add could land before an earlier add that awaited a database read. | withCarryOver queues operations by session id and reads state when each runs. |
| [eab1de3f](https://github.com/AJFG297/LiftLog/commit/eab1de3f5decd7d91c177e272ca5f2aaec051878) | entry path semantics | Previous chose the newest performance in any occurrence rather than the occurrence an added exercise carried from. | carriedFrom derives the planned lineage or the current workout position lineage. |
| [1a1e1285](https://github.com/AJFG297/LiftLog/commit/1a1e12852074cf19a954082145bfbf252034b65b) | entry path semantics | The newly unified repeat path used routine targets and lost targets changed just for that workout. | repeatBlueprint copies recorded working-set targets and kinds while routineFromSession stays distinct. |
| [7c67b2ad](https://github.com/AJFG297/LiftLog/commit/7c67b2ad89f42098e8908ae293dbdcde3fd16d0a) | async cache ordering | Filtering own-workout cache entries removed the only cached entry and made an already logged exercise enter at zero. | withCarryOver queries only affected keys with excludeWorkoutId. |
| [5bdfdd34](https://github.com/AJFG297/LiftLog/commit/5bdfdd34fcbd9730e55d176003223244c5816548) | entry path semantics | Choosing another exercise in the exercise editor still bypassed swap carry-over. | sessionWithExerciseEdited routes changed movement identity through sessionWithExerciseReplaced. |
| [fc39fb56](https://github.com/AJFG297/LiftLog/commit/fc39fb561f0c5a7ca6619dfe88b1df616615b116) | entry path semantics | Do again cloned old weights instead of opening at latest performance plus earned progression. | repeatSession uses createNewSession and the shared per-exercise carry-over path. |
| [290f1a0c](https://github.com/AJFG297/LiftLog/commit/290f1a0c09753b3369ddb1bb102e63bd2ce725f5) | entry path semantics | Swap retained the old movement weights under the new exercise identity. | sessionWithExerciseSwapped opens the new movement on its own carry-over and preserves logged sets. |
| [61bbad5a](https://github.com/AJFG297/LiftLog/commit/61bbad5a1c48b64310c7944eeade0661074a4a46) | entry path semantics | Add exercise built empty recorded sets instead of the values a routine carried over. | Session.withAddedExercise accepts an opened RecordedExercise; picker opens it with nextRecordedExercise. |
| [74905828](https://github.com/AJFG297/LiftLog/commit/749058286e0c9fb5eb80b82b1f89c8ceb1c6ea58) | migration integrity | Merging a user exercise into a built-in discarded user-written instructions when built-in text was nonempty. | joinInstructions appends missing user paragraphs. |
| [194526b8](https://github.com/AJFG297/LiftLog/commit/194526b8994c2c9fb209e8f640067fa81be27c3e) | migration integrity | Merging an older backup before restore could pick a different survivor from the device and restore split identities. | Run mergeExerciseNames on device after workouts are written and repoint store plans. |
| [b0403f01](https://github.com/AJFG297/LiftLog/commit/b0403f019ab19d737d2ab1995e3093eb746be566) | migration integrity | A stub target id could also be a merged source in the same round, merging different movements accidentally. | withoutOverlap delays occupied-target groups and asserts survivor/source disjointness. |
| [7b57e64d](https://github.com/AJFG297/LiftLog/commit/7b57e64d30fa07c568eae2708a62d7ddf5b60231) | identity name fold | Blindly stripping es/s split Lunge and Lunges and damaged names like Bench Press. | One rule-table fold singularizes the final word; a rerunnable migration repairs stored ids. |
| [913548df](https://github.com/AJFG297/LiftLog/commit/913548df4e6f38e05035ecb7d7e5466c561f66a1) | stats population and window | Profile count filtered to started workouts but since date included unstarted workouts. | startedWorkouts returns both values from one SQL population. |
| [880fbdc5](https://github.com/AJFG297/LiftLog/commit/880fbdc55e4a56cd6d51c1e337f2fb0d2e0f3bc2) | history resource lifetime | Changing movement retained the earlier movement page limit and displayed its retained history. | Page state and retained query response each carry movement identity. |
| [020226f8](https://github.com/AJFG297/LiftLog/commit/020226f89574bc1602b93a6cdd870d1d6975b3ce) | history resource lifetime | A linked summary after restart treated a workout missing from memory as gone although SQL held it. | Summary requests openSessionForSummary by id and distinguishes not found. |
| [ffdae69b](https://github.com/AJFG297/LiftLog/commit/ffdae69b3f4392a0e8f93af76135ecd1aa9b4f99) | history resource lifetime | A put, start or finish reused the editor slot and closed the workout being edited. | Separate editing and recent slots with independent replacement lifetimes. |
| [0b9d580d](https://github.com/AJFG297/LiftLog/commit/0b9d580d955518fa394a171ce4db9bcbbe9e107d) | async cache ordering | latestPlanned could run before an earlier unawaited write under async database execution. | latestPlanned participates in the repository issue-order queue. |
| [268267f7](https://github.com/AJFG297/LiftLog/commit/268267f7862c2c38dea835a7938e779ca85efecd) | async cache ordering | Equal-time performances left cache winner dependent on write order instead of SQL tie-breaks. | staleLineages re-reads ties to let repository ordering decide. |
| [24cfce1e](https://github.com/AJFG297/LiftLog/commit/24cfce1ef151d5a7740f38bf2847c06491e44c64) | presentation and empty state | A zero-gain badge rendered and a record set wrapped. | Only render nonzero signed gain; constrain set text to one line. |
| [58baf880](https://github.com/AJFG297/LiftLog/commit/58baf880d06be4d87da4de19f656c6df94894139) | numeric display consistency | Coarse conversion rounding could show a true gain as a fall. | shownChange increases precision until shown direction agrees with unrounded converted direction. |
| [8c7d31cb](https://github.com/AJFG297/LiftLog/commit/8c7d31cb0619422ecb810307edd307b3a899cf8f) | presentation and empty state | Record gain typography differed from approved board and exercise heading vanished with no filtered matches. | Shared row uses intended numeric typography; heading survives empty filtered list. |
| [f63305c8](https://github.com/AJFG297/LiftLog/commit/f63305c8e634a52bb94223f76118eaf24f6fa578) | numeric display consistency | Records and All exercises independently rounded to tenths unlike Strength. | Their view models use shared shownWeight/shownChange. |
| [ec93aacf](https://github.com/AJFG297/LiftLog/commit/ec93aacff89d34108b13b97be13ec229acd85f61) | search ranking | All exercises filtered fuzzy matches but still ranked most recent rather than best match. | Retain fuzzy score and sort by score, then recency. |
| [21b73506](https://github.com/AJFG297/LiftLog/commit/21b7350656128f32b68e80a16e131fa941c860c3) | migration integrity | Muscle-role migration rewrote already correct exercise payloads. | Return no planned write when primary and secondary lists already match. |
| [e8c665b3](https://github.com/AJFG297/LiftLog/commit/e8c665b36a14d495592a94a4f142ad43abb1a587) | presentation and empty state | Longest-run metric label and its amount were structured as a single body string. | Use separate label and numeric value. |
| [e6ba58da](https://github.com/AJFG297/LiftLog/commit/e6ba58da27c4538d3048b11c146590ad2b8eca20) | numeric display consistency | Strength rounded estimates and displayed deltas separately, producing amounts inconsistent with approved display rules. | Centralize shownWeight/shownChange before rendering; formatters no longer re-round shown values. |
| [e9bcd277](https://github.com/AJFG297/LiftLog/commit/e9bcd27736136bd8c9cc2aaef936b4e57a85d1cc) | presentation and empty state | Training without a complete history week looked empty without explaining when averages appear. | Show first-full-week copy when averagedWeeks is zero. |
| [75f13e9f](https://github.com/AJFG297/LiftLog/commit/75f13e9f2882b20757554dd43ef4cc483485fbe6) | stats population and window | Averages treated days before the first workout as rest in a partial first history week. | firstFullWeek excludes that week unless history began on its first day. |
| [e4b04d37](https://github.com/AJFG297/LiftLog/commit/e4b04d37f9e52908581c8455e40c4374865c0a79) | stats population and window | N-week selection produced N complete weeks plus this week, hence N+1 bars. | progressPeriod constructs N-1 complete weeks plus this week. |
| [bf18c960](https://github.com/AJFG297/LiftLog/commit/bf18c9607caf96229acbb8ac7f0c1024ab059e88) | stats population and window | Progress since and averages started at an earlier workout with nothing logged. | firstDate comes from first started WorkoutPoint. |
| [b79745d9](https://github.com/AJFG297/LiftLog/commit/b79745d9acea5bb5f2b3c3f2f2a6d831865b4b51) | foreground date refresh | Mounted tab date stayed at the initial day after foregrounding on a later day. | AppState active refreshes date only when calendar day changed. |

## Experiments that changed the design

- Existing lint accepted two historical unsafe-transaction files. A focused restriction rejected their
  three calls. Review then found static template and TypeScript-wrapper bypasses; phase A added cases
  for both before its clean verdict. Dynamic property construction stays outside the guarantee.
- A real import effect emitted success before a controlled write rejected. A program-listener race
  committed an obsolete snapshot. These supported one awaitable import and shared current-state writers.
- An import-only prototype could not preserve reconciliation after a later round failed. Committed-round
  callbacks now reconcile before the next await, with retry cases covering partially durable stages.
- First implementation review proved five restore races: edits in active, editing and recent slots;
  an edited slot closed before completion; and deletion resurrection. The prepared-import boundary fixed
  all five. Eight additional independent SQLite probes exercised queued writes, failure and recovery.
- Removing entry FIFO failed tap order. A store-scoped queue preserved the existing 21 cases. An isolated
  owner prototype routed 15 principal add/swap cases through its API and passed a synchronous-cache probe;
  editor/read-failure and start/repeat principal paths were still unchanged in that experiment.
- The implementation migrates editor and read-failure paths as well. It reuses five picker construction
  functions; a static comparison found equivalence after comments and formatting were removed. The
  shipped suite retains 21 original cases and adds 12 owner cases, with 60 focused lint cases, including factory and static-template/type-only boundary cases.

The four candidate prototypes were compared under the same behavior checks. The cross-judge preferred
existing entry APIs plus a store-scoped queue. The approved pilot instead tests whether moving add,
swap and edit coordination into one owner removes obligations from all three callers. File count and
Node duration were not used as productivity or device-performance results.

## Repeat the shipped checks

From `app/` on the stack tip:

```sh
npx vitest run test/storage-boundary.spec.ts test/import-ownership.spec.ts test/exercise-entry-boundary.spec.ts --maxWorkers=2
npx vitest run src/services/history-import.spec.ts src/store/stored-sessions/history-from-sql.spec.ts src/store/stored-sessions/carry-over-entry-paths.spec.ts --maxWorkers=2
npx vitest run --maxWorkers=2
npm run typecheck
npm run lint
npm run format:check
```

The fixtures exercise real listener middleware and SQLite/libsql rows. They assert literal sets,
exercise order, carried weights, superset flags, active flags and deletion results. Stage failures and
queue pauses expose completion and ordering rather than merely testing implementation calls.

Phase A's verifier head is `8984b3c05ff06f7208da023482b2071bdb0e1556`; phase B's is
`3025446a752cd881d6786e65917579e9d3f10b7b`. The entry PR body supplies its final exact verifier head.
Verdicts, current counts and pinned screenshots live in
[PR56](https://github.com/AJFG297/LiftLog/pull/56),
[PR57](https://github.com/AJFG297/LiftLog/pull/57) and
[PR58](https://github.com/AJFG297/LiftLog/pull/58).

## Android proof and limits

Main controls at `62860e01` showed imported/restore success despite a real `BEFORE INSERT` trigger
rejecting the repair marker. The reviewed phase B head showed incomplete messages in light and dark.
Re-import with no new IDs still failed while the trigger remained. A saved partial-import fixture with
only that trigger removed offline allowed a duplicate-only retry to complete. A changed same-ID CSV
kept the original 42 kg / 10 reps values. A backup whose source had active=1 restored into inactive history,
with no workout-in-progress bar. A fresh external import reported completion and persisted one row.

Run `20261012-203504` used the reviewed checkout's cold Metro bundle, isolated cache and owned emulator.
Native diagnostics identify stage repair and the real SQLite rejection; SQL snapshots verify the
retained rows. Before/after assets are pinned to `6a484f7459cef339328ae088e18870bc29b6c67c` on `pr-assets`.
Starting fixtures come from actual UI-created or imported state. Fixture edits prepare fault/recovery
conditions offline; the feature itself always runs through real screens.

Controlled overlapping save/merge on Android is **NOT RUN**: the UI does not expose a deterministic
pause in the persistence window. Real SQLite/libsql overlap tests do not establish expo-sqlite ordering.
iOS and remote/feed services were not exercised. Entry picker/editor replay is recorded in its PR body
at the final reviewed head. No native result at main is attributed to the new owner.

The delivery uses available Codex review models; the requested external provider/role types were
unavailable. Two independent scoped reviewers substitute for them. GitHub reports no CI checks, so
local gate receipts are described as local evidence. The operator owns landing; no merge or auto-merge
is part of this run.

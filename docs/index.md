# Docs index

Every doc in this directory, with a one-line description of what it covers. Skim this before starting
work to find the docs relevant to your area, and update it whenever you add, remove, or repurpose a doc.

## Architecture and patterns

- [Storage.md](./Storage.md) - the two on-device storage layers: preferences (`PreferenceService`, one
  file per key) and user data (SQLite via Drizzle). Both are injected into Redux effects via `extra`.
  Covers which to use, how to add to each, the relational workout tables behind `WorkoutRepository` and
  its reads, how workouts reference exercises by id (the `ExerciseResolver`, the name fold, the plural merge
  and the key columns), what
  startup loads (only the workout in progress and the carry-over cache), the slots past workouts are
  opened into (the history editor's, and the recent one a summary reads), and the snapshots,
  startup-reads test and benchmark that guard it.
- [Migrations.md](./Migrations.md) - the `createMigrations()` chain in `app/src/models/storage/versions/`
  that brings previously-persisted JSON up to the shape the app expects, and how to shape a data migration
  that rewrites rows (planner, re-runnable applier, dry run). Read alongside `Storage.md`.
- [WorkoutWorker.md](./WorkoutWorker.md) - the platform-specific, message-driven execution environment
  for an in-progress workout (persistent notifications, background timers, system UI). Redux stays the
  source of truth; the worker is disposable.

- [Theming.md](./Theming.md) - the colour tokens in `useAppTheme().tokens`: fixed warm neutrals plus an
  accent family generated from the user's colour, which token to use for what, the contrast guarantees,
  Match wallpaper, and how the Paper scheme for unconverted screens is mapped from them. Also the type:
  Geist and Geist Mono embedded at build time, and when to use `numeric` / `numberStyle` / `tabularText`.
- [Components.md](./Components.md) - the redesign's own primitives in `components/presentation/foundation/`
  (Card, Chip, ChipRow, SearchField, SegmentedControl, RoundIconButton, ListRow, SetBadge, ProgressBar,
  Toast), their accessibility rules (roles, labels, 44pt targets via `hitSlopFor`), the native-sheet
  convention (`formSheetOptions` + `SheetHeader`), haptics, and the `liftlog://dev/components` screen.

## Features

- [Home.md](./Home.md) - the four tabs (Home, Routines, Progress, You) and which route folders they hold,
  why history and the feed aren't tabs, and the Home screen: the Up next card, the 7 and 30-day views
  and where their numbers come from, derived routine colours, the history cards, and the
  workout-in-progress bar above the tab bar.
- [LiveWorkout.md](./LiveWorkout.md) - the workout in progress: focus mode one exercise or superset at a
  time, the exercise strip, the Up next bar and the All exercises sheet, the rest pill and rest sheet
  (steps, presets, saving a rest to the routine), and how pages, the next set, focus, reordering and the
  Today target are worked out from the session. Also logging a set: the set table's placeholders, typing
  on the number pad, drafts, undo, RPE, Add set and the set-type sheet.
- [Routines.md](./Routines.md) - programs and routines: the Routines screen (active program, routines,
  other programs, the built-in library, and why changing the active program always asks), the program page,
  and the routine editor: its draft with Save and Cancel, the routine's colour, set rows on the number pad,
  the rest row and its wheel sheet, the progression presets and how they map to rules, and superset-safe moves.
- [WorkoutDetail.md](./WorkoutDetail.md) - a past workout, opened from history: the header, stats row and set
  tables (e1RM, PR tags, the comparison with last time), Do again, Save as routine (into the active plan), and the
  overflow menu's edit, share and delete with Undo.
- [ExercisePicker.md](./ExercisePicker.md) - choosing exercises for a routine or a workout: add (many, in
  tap order, optionally as a superset) and swap (one), how the pick comes back through the store, the list
  (Recent, fuzzy matches, muscle and equipment chips), creating a custom exercise, and the catalog's limits.
- [Progress.md](./Progress.md) - the Progress tab, Records and All exercises, and the model they share:
  `buildProgressHistory`'s one walk over the finished history (points per movement and workout, dated
  records), the `RecordLedger` that is the one implementation of the record rules, `progressSince` for a
  window's change, where `useProgressHistory` loads it from, how a range's weeks and averages are counted,
  and how amounts are rounded (`progress-amounts.ts`).
- [FeedProcess.md](./FeedProcess.md) - the opt-in social feed: the follow/accept flow, what is and isn't
  visible to the server, and the end-to-end encryption model (AES-CBC payloads, RSA-PSS signatures).
- [Progression.md](./Progression.md) - how last session's numbers carry into today from the best set,
  whatever the set count (and why weight carries but reps usually do not), and how the progressive
  overload rules move them. Covers rule order, limits and starting over, rules that can never run, and
  the two ways to set up double progression. Ends with pointers to the code.
- [NumberPad.md](./NumberPad.md) - the in-screen number pad for weight and reps: how a field's buffer
  behaves (placeholder, typing, ± steps), the step per equipment and unit, the accessory row (plate
  maths, per dumbbell, on the stack, RPE chips), and the bar and plate preferences behind plate maths.
- [PlanFileFormat.md](./PlanFileFormat.md) - the `.liftlogplan` file format, how plans are imported and
  exported (exercises linked by name, `exerciseId` optional), and the Claude skill that authors plan files
  against the schema.
- [PlaintextExport.md](./PlaintextExport.md) — CSV/JSON export of workout data, including which fields
  are included, their order and how it is read in batches. Explicitly _not_ a backup mechanism; LiftLog
  cannot read these files back.
- [CsvImport.md](./CsvImport.md) — user guide for Import from other apps (FitNotes-style and
  StrongLifts-style CSV); contributor notes at the end. Separate from plaintext export.
- [RemoteBackup.md](./RemoteBackup.md) — the automatic remote backup: the app-side settings, the HTTPS
  requirement, and the contract a self-hosted backup endpoint must satisfy.

## Running it yourself

- [PhoneBuilds.md](./PhoneBuilds.md) - getting a change onto the two Android phones: when a change needs a
  new build and when an EAS Update is enough (the fingerprint runtime version), the commands for each,
  rollback, and keeping both phones on the same version.
- [SelfHosting.md](./SelfHosting.md) — quickstart for running your own backend: a copy-paste Docker
  Compose file, how to point the app at it, and the environment variables that switch on the feed,
  remote backup, and AI planner. Pairs with the [backend README](../backend/README.md).
- [Backends.md](./Backends.md) — the app side: creating backends, assigning the feed, AI planner and
  remote backup to different ones, custom headers for API keys and forward auth, and why moving the
  feed destroys the account. Read alongside `SelfHosting.md`.

## Decisions

- [adr/0001-own-backend-no-upstream-compatibility.md](./adr/0001-own-backend-no-upstream-compatibility.md)
  - the fork talks only to its own backend and keeps no compatibility with upstream LiftLog (wire
  formats, backups, hosted service); what that frees up and what still must stay compatible.
- [adr/0002-own-visual-language.md](./adr/0002-own-visual-language.md) - content surfaces are
  our own components on the theme tokens; system chrome (tabs, sheets, menus, switches, pickers) stays
  native via expo-ui; react-native-paper is phased out screen by screen.
- [adr/0003-relational-workout-storage.md](./adr/0003-relational-workout-storage.md) - workouts are
  relational rows with the blueprint as JSON, exercises have stable ids, history is read on demand through
  `WorkoutRepository`, and Redux holds only the workout in progress, an editing slot and small caches
  (relational-storage plan decisions D1-D7).

## Plans

- [plans/relational-storage.md](./plans/relational-storage.md) - the plan (assuming no existing users,
  own backend only) to replace session JSON blobs with relational tables and put stable exercise IDs on
  blueprints, done (PM-9 to PM-14): key decisions, target schema, each phase with what was settled while
  doing it, the formats that must keep working, and the follow-ups left.
- [plans/redesign.md](./plans/redesign.md) - the plan for the "Clarity" UI redesign, in progress: design
  summary, key decisions (own visual language, a user-chosen accent over fixed neutrals, fonts, new tabs,
  set types, sheets, number pad), the phased screen-by-screen rollout and where it stands, verification
  and risks.

## Generated

- [schemas/](./schemas) - JSON schemas generated from the app's models: `ai-plan/`,
  `program-blueprint/`, `workout-worker/`. Regenerate with `npm run json-schema` from `app/`; never
  hand-edit.
- [img/](./img) - images referenced by the docs above.

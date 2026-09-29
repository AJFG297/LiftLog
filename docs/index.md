# Docs index

Every doc in this directory, with a one-line description of what it covers. Skim this before starting
work to find the docs relevant to your area, and update it whenever you add, remove, or repurpose a doc.

## Architecture and patterns

- [Storage.md](./Storage.md) - the two on-device storage layers: preferences (`PreferenceService`, one
  file per key) and user data (SQLite via Drizzle). Both are injected into Redux effects via `extra`.
  Covers which to use, how to add to each, the relational workout tables behind `WorkoutRepository`, how
  workouts reference exercises by id (the `ExerciseResolver` and the key columns), the startup hydration
  order, and the history snapshots and startup benchmark that guard it.
- [Migrations.md](./Migrations.md) - the `createMigrations()` chain in `app/src/models/storage/versions/`
  that brings previously-persisted JSON up to the shape the app expects. Read alongside `Storage.md`.
- [WorkoutWorker.md](./WorkoutWorker.md) - the platform-specific, message-driven execution environment
  for an in-progress workout (persistent notifications, background timers, system UI). Redux stays the
  source of truth; the worker is disposable.

- [Theming.md](./Theming.md) - the colour tokens in `useAppTheme().tokens`: fixed warm neutrals plus an
  accent family generated from the user's colour, which token to use for what, the contrast guarantees,
  Match wallpaper, and how the Paper scheme for unconverted screens is mapped from them. Also the type:
  Geist and Geist Mono embedded at build time, and when to use `numeric` / `numberStyle` / `tabularText`.
- [Components.md](./Components.md) - the redesign's own primitives in `components/presentation/foundation/`
  (Card, Chip, SegmentedControl, RoundIconButton, ListRow, SetBadge, ProgressBar, Toast), their
  accessibility rules (roles, labels, 44pt targets via `hitSlopFor`), the native-sheet convention
  (`formSheetOptions` + `SheetHeader`), haptics, and the `liftlog://dev/components` screen.

## Features

- [LiveWorkout.md](./LiveWorkout.md) - the workout in progress: focus mode one exercise or superset at a
  time, the exercise strip, the Up next bar and the All exercises sheet, and how pages, the next set,
  focus, reordering and the Today target are worked out from the session.
- [FeedProcess.md](./FeedProcess.md) - the opt-in social feed: the follow/accept flow, what is and isn't
  visible to the server, and the end-to-end encryption model (AES-CBC payloads, RSA-PSS signatures).
- [Progression.md](./Progression.md) - how last session's
  numbers carry into today (and why weight carries but reps usually do not), and how the progressive
  overload rules move them. Covers rule order, limits and starting over, rules that can never run, and
  the two ways to set up double progression. Ends with pointers to the code.
- [NumberPad.md](./NumberPad.md) - the in-screen number pad for weight and reps: how a field's buffer
  behaves (placeholder, typing, ± steps), the step per equipment and unit, the accessory row (plate
  maths, per dumbbell, on the stack, RPE chips), and the bar and plate preferences behind plate maths.
- [PlanFileFormat.md](./PlanFileFormat.md) - the `.liftlogplan` file format, how plans are imported and
  exported (exercises linked by name, `exerciseId` optional), and the Claude skill that authors plan files
  against the schema.
- [PlaintextExport.md](./PlaintextExport.md) — CSV/JSON export of workout data, including which fields
  are included. Explicitly _not_ a backup mechanism; LiftLog cannot read these files back.
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

## Plans

- [plans/relational-storage.md](./plans/relational-storage.md) - the plan (assuming no existing users,
  own backend only) to replace session JSON blobs with relational tables and put stable exercise IDs on
  blueprints, in progress: phases 0 and 1 are done, phase 2 (history reads from SQL) is next. Key
  decisions, target schema, phases, and the formats that must keep working.
- [plans/redesign.md](./plans/redesign.md) - the plan for the "Clarity" UI redesign, in progress: design
  summary, key decisions (own visual language, a user-chosen accent over fixed neutrals, fonts, new tabs,
  set types, sheets, number pad), the phased screen-by-screen rollout and where it stands, verification
  and risks.

## Generated

- [schemas/](./schemas) - JSON schemas generated from the app's models: `ai-plan/`,
  `program-blueprint/`, `workout-worker/`. Regenerate with `npm run json-schema` from `app/`; never
  hand-edit.
- [img/](./img) - images referenced by the docs above.

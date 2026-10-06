# Browser verification prototype

This prototype tests whether Codex cloud agents can verify shared LiftLog behavior without starting an
Android emulator. It runs headless Chromium against a local page. No hosted website or backend account
is required. The implementation is isolated in `app/browser-verification/`.

Use the [browser verification skill](../.cursor/skills/verify-liftlog-browser/SKILL.md) for setup,
launch, doctor, drive, evidence, and cleanup. Codex discovers the same skill through the relative
`.agents/skills/verify-liftlog-browser` symlink.

## Run

From `app/`, install dependencies with `npm ci` and Chromium with `npm run verify:browser:install`.
On Linux use `npx playwright install --with-deps chromium` to install the browser's system dependencies.
Then run:

```bash
npm run verify:browser
```

The command verifies Regular 390 × 844 and Large 430 × 932. Each size starts with its own fresh database,
checks ownership and source, drives all mapped scenarios, and stops the instance. Each run keeps bounded
preview screenshots, accessibility snapshots, a Playwright trace, SQL snapshots, the database, and the
server log under `.verify-runs/browser/<run-id>/`. Manifests record the selected size and layout geometry.

For interactive inspection, run `npm run verify:browser:up` and open the URL it prints. Stop it with
`npm run verify:browser:down`. The preview starts at Regular. Use the buttons above the workout to
switch sizes while retaining the active field, partial number, unlogged reps, and appearance.
The selected size survives page reload through the outer URL query. The skill documents scenario commands
and restart behavior. A manual `control.mjs drive workout large` checks Large on an existing instance;
manual drives default to Regular.

## What the prototype proves

| Scenario    | User action                                             | Observable result                                                                                                          |
| ----------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Workout     | Type 82.5 kg and 7 reps on the real NumberPad, then log | SetTable shows the logged set and SQLite stores the numbers and completion time                                            |
| Persistence | Reload the page and restart the server                  | The logged set returns from the same disk database                                                                         |
| Undo        | Press Undo Set 1 and reload                             | Completion and recorded reps are cleared; weight remains 82.5 kg                                                           |
| Sets        | Press Add set and reload                                | A third working set is visible and persisted                                                                               |
| Viewport    | Switch sizes with a partial number and unlogged reps | The iframe changes its actual layout viewport, retains editing and appearance, makes no workout write, and leaves SQLite rows unchanged |
| Overflow    | Add sets until there are 16 and open the last weight field | The workout area scrolls, the active field remains visible, and the keypad stays within the selected viewport |
| Appearance  | Select light, dark, and blue accent                     | Selected controls and computed colors change; screenshots include the shared keypad and table; workout rows stay unchanged |

It imports production `SetTable`, `NumberPad`, `set-entry`, domain models, `storedSessionsReducer`,
`AppThemeProvider`, `WorkoutRepository`, and Drizzle migrations. Browser actions drive the controls.
The evidence API only reads rows. The save API writes through the repository rather than storing a
parallel fixture JSON document.

## Boundaries

The outer viewer owns the selected viewport and one stable iframe. `/workout.html` mounts the workout
and its providers inside that iframe. Preset dimensions come from `app/browser-verification/viewports.json`.
The iframe source stays fixed during size switches. Its bounded flex layout leaves scrolling to the
workout area and keeps the keypad in flow at the bottom. Screenshots capture the iframe at its selected
size, rather than expanding the document to include overflowing content.

Every drive finishes with resize checks, logs Set 2, and adds sets for overflow checks. A later manual
workout drive requires a fresh fixture. Page reload and server restart retain committed workout data;
unlogged drafts and theme preferences reset on reload.

The page layout, Redux bootstrap, and HTTP save queue belong to the prototype. They do not prove the
production workout route, startup process, or Redux persistence effects.

React Native Web supplies browser views. Gesture Handler, Reanimated, Worklets, and Safe Area Context
resolve their own web implementations. Small adapters provide en-US localization, generated theme
schemes, navigation theme context, CSS appearance override, and silent haptics. An ESM barrel preserves
real model values while omitting the native barrel's type-only value exports. The bundler erases Expo's
declaration-only namespace and handles native packages that publish JSX in `.js` files.

The database uses a real file-backed libSQL driver. `WorkoutRepository` expects Expo's Drizzle database
shape, so the adapter uses the same driver cast as the existing repository tests. This proves repository
queries and migrations, including process restart, but does not prove Expo SQLite's native bindings.

Native navigation, sheets, menus, switches, notifications, background timers, Health Connect,
permissions, keyboard behavior, haptics, and native gesture behavior remain outside this map. Follow
[the Android verification process](../.claude/skills/verify-liftlog/PROCESS.md) for those paths and for
required UI PR screenshots. Browser screenshots are evidence for this prototype.

## Design decision

Two isolated approaches were compared. A routine editor slice could exercise simpler controls with a
small custom persistence service. The chosen live set-entry slice covers the shared table and keypad
and writes through the production workout repository. That gives stronger persistence evidence at the
cost of more browser compatibility setup. Instance ownership, source checks, retained evidence, and
the feature map were retained from the simpler design.

Treat this as a throwaway feasibility prototype. The recommended next implementation is a maintained
browser verification lane that expands by feature, with each feature listing its native exclusions.
Do not infer whole-app coverage from a passing slice. Keep the feature map current with
`/maintain-verification-skill` as coverage expands.

## Contract maintenance

`session.schema.json` is generated from the authoritative `SessionJSON` type. It allows additional
version metadata produced by the domain serializers. Ajv checks structure; domain deserializers parse
the date, duration, and decimal values. Regenerate after storage model changes, from `app/`:

```bash
node browser-verification/generate-contract.mjs
```

The prototype's TypeScript UI and server remain part of normal typecheck and lint. Node helpers use
typed JSDoc and checked JSON contracts without a lint exclusion. Lifecycle state must belong to this
checkout and run directory before cleanup can act on it. The entry point declares only the DOM lookup it uses,
so browser lib types do not alter the native app's stream types.

## Prototype validation

All mapped scenarios passed in local headless Chromium and in the official Playwright Linux container
`mcr.microsoft.com/playwright:v1.63.0-noble` with Node 24.20.0. The Linux run installed dependencies with
`npm ci` before exercising the browser path. Evidence survived teardown in both environments. Actual
execution inside Codex cloud remains untested.

The existing set-entry and workout repository suites also passed, with 96 tests. Normal typecheck and
lint were run and compared against an unchanged HEAD checkout using the same installed dependencies.
Both have existing failures. Typecheck reports unsupported `visibility` and `userSelect` style
properties in two production components. Oxlint reports five existing errors in settings effects and
the exercise-name migration tests. The prototype adds no diagnostics. Its scoped Oxlint and ESLint
checks pass.

The prototype applies four Poteto principles. Boundary Discipline keeps native adapters outside the
shared workout logic. Model the Domain uses separate loading and saving state variants. Type System
Discipline checks session, lifecycle, identity, and evidence JSON at their boundaries. Prove It Works
requires visible user actions, stored rows, reload, and process restart. Comment Sicko's accepted lint
finding was resolved with checked helper contracts and removal of the blanket exclusion.

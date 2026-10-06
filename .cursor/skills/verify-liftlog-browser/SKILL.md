---
name: verify-liftlog-browser
description: Verify LiftLog's shared workout components in headless Chromium with Playwright. Use for browser checks of set entry, undo, added-set persistence, and light, dark, or accent styling, including Linux environments without an Android emulator.
---

# Verify LiftLog in a browser

Use this skill to drive the browser prototype in `app/browser-verification/`. Read the
[feature map](features/README.md) before choosing a scenario. Commands below run from `app/`.

The prototype renders the actual shared `SetTable` and `NumberPad` through React Native Web. Set edits use
production `set-entry` functions and `storedSessionsReducer`. Saves use `WorkoutRepository`, production
Drizzle migrations, and a real libSQL SQLite file on disk. The prototype supplies its own page and save
queue. It adapts localization to `en-US`, theme scheme generation, CSS appearance, haptics to a no-op, and navigation to
the theme provider's needs. It preserves model values through a browser-compatible ESM barrel.

This proves the mapped shared-component behavior and repository persistence. The full Expo app,
production `expo-sqlite` bindings, native navigation, system controls, and app services require native
verification. Follow [the Android verification process](../../../.claude/skills/verify-liftlog/PROCESS.md)
and [Android skill](../../../.claude/skills/verify-liftlog/SKILL.md) for those checks. User-visible PRs
still require Android before-and-after screenshots with matching data, light and dark, and a non-default
accent when colors change, as specified in `AGENTS.md`.

The commands support Linux with Node 22.12 or newer and Chromium's system dependencies. All mapped
scenarios passed in a Linux Playwright container with Node 24.20.0. Actual execution
in a Codex cloud environment has not yet been confirmed. Report the environment you ran, separately from
any environment you expect to support.

## Launch

1. Confirm that `node --version` reports Node 22.12 or newer.
2. Install the checkout's dependencies and Chromium.

```bash
npm ci
npm run verify:browser:install
```

On Linux, install Chromium's system dependencies too. Run this instead of the second command above.

```bash
npx playwright install --with-deps chromium
```

3. For a complete run with automatic launch, doctor, and cleanup, run:

```bash
npm run verify:browser
```

The default command runs every mapped scenario at Regular 390 × 844 and Large 430 × 932, with a fresh
run and database for each size. Each drive prints JSON with `result: "pass"`, `scenario`, `viewport`, and
`evidence`. The command exits with code 0 only when both drives pass.
A failure exits with a nonzero code. Both retain proof artifacts.

To keep an instance available for diagnosis or several drives, launch it explicitly.

```bash
npm run verify:browser:up
npm run verify:browser:doctor
```

`up` prints `ready: true`, the run ID, run directory, PID, checkout, and dynamically assigned loopback URL.
The browser opens a Regular 390 × 844 preview. The buttons above the iframe select Regular or Large
430 × 932. Size switches retain the iframe document, active field, number buffer, unlogged reps, and
appearance. The outer `?viewport=` query retains the selected size on page reload.

The browser loads a workout titled **Browser verification** with **Barbell Bench Press**, two unlogged
working sets, and **Workout saved**. Each new run has its own database. `restart` reuses that run's database.

One instance may run per checkout. Separate checkouts use separate run directories and dynamic ports.
If `up` reports an existing instance, inspect it with doctor or stop this checkout's instance with `down`.

## Doctor

```bash
npm run verify:browser:doctor
```

Require exit code 0 and `healthy: true` before driving a persistent instance. The read-only check verifies
that the saved PID is alive, the server's PID, run ID, and checkout match, the source digest matches the
checkout, and the workout loads. This check rejects a server built before source edits.

If doctor reports changed source, run `down` then `up` from this checkout. A new `up` starts a new fixture.
Use the saved run's evidence to diagnose failures before starting again. Read the named `server.log` when
startup fails, and report the command and error if the instance remains unavailable.

## Drive

Run one scenario at both sizes, each with a fresh fixture and automatic cleanup.

```bash
npm run verify:browser -- workout
npm run verify:browser -- sets
npm run verify:browser -- themes
```

The [feature map](features/README.md) gives each scenario's user actions and observable results. The
`workout` scenario types 82.5 kg and 7 reps, logs the set, reloads, restarts the server, then undoes the set.
The `sets` scenario adds a set and checks it after reload. The `themes` scenario captures light and dark
with the default accent, then dark and light with a blue accent.

For an instance already started with `up`, drive it through the controller.

```bash
node browser-verification/control.mjs drive workout
node browser-verification/control.mjs drive workout large
```

Replace `workout` with `sets`, `themes`, or `all` as needed. An optional `regular` or `large` selects one
size. Manual `drive` defaults to Regular, runs doctor first, and leaves the instance up. `test` defaults
to both sizes and also accepts one size for diagnosis. Unknown size IDs fail before an instance starts.
Every drive then verifies a partial number, unlogged reps, and dark blue appearance across size switches,
logs Set 2, and adds sets for scrolling checks. Start a new run before a later manual `workout` drive to
restore the two-set, unlogged fixture.

The driver uses button roles and real accessible names such as `Weight for Set 1:`, `Reps for Set 1:`,
`Log set`, `Undo Set 1`, `Add set`, `Light`, `Dark`, and `Blue accent`. Keep those selectors aligned with
the shared controls. Make feature changes through visible controls. Read-only evidence endpoints observe
stored state. Direct Redux or database writes are fixture setup, never proof of the feature under test.

## Evidence

Proof survives teardown under `.verify-runs/browser/<run-id>/` at the repository root. Each drive writes a
`drive-<preset>-<timestamp>/` directory containing:

- `manifest.json`, with the scenario, selected viewport, checkout, source digest, run ID, action list, layout geometry, browser errors, and result.
- `trace.zip`, with browser actions, screenshots, and snapshots.
- Named `.png` screenshots of the bounded iframe and matching `.aria.txt` snapshots at the important states.
- `resize-<size>.png`, `resize-preserved` artifacts, unchanged `before-resize` and `after-resize` SQL snapshots, and `overflow-keypad` artifacts.
- Named `.db.json` snapshots, with the query, database path, active workout, and stored set rows.

The run directory also retains `workout.sqlite`, `identity.json`, the compiled `server.mjs`, and
`server.log`. Use the manifest and trace to connect the user action to the resulting screen, then compare
SQL snapshots for persistence. A final screenshot alone does not prove the preceding actions occurred.
The theme scenario records computed colors in `palettes.json` and checks selected modes, background
changes, and accent changes. Review the screenshots for layout and contrast. Its database check proves
that appearance changes leave workout rows unchanged.

Report each viewport, scenario, exit code, run ID, environment, and evidence directory. A complete
default run has separate Regular and Large evidence directories. Mark an unreachable or skipped
scenario `NOT RUN` with its error or reason. Browser results apply only to the mapped paths. Report native
paths separately. After cleanup, confirm that the manifest, trace, screenshots, SQL snapshots, and database
still exist before declaring the run complete.

## Cleanup

```bash
npm run verify:browser:down
```

Run `down` after manual drives and failed attempts. `test`, used by `npm run verify:browser`, runs cleanup
in its `finally` block. `down` stops the PID only after matching its command to this run's `server.mjs`.
It removes the active state file and temporary `node_modules` symlink, and keeps the run directory and
proof. A second `down` is safe. Stop only the instance claimed by this checkout.

## Helpers

The executable controller is `app/browser-verification/control.mjs`. Run it with Node from `app/`.

```bash
node browser-verification/control.mjs help
node browser-verification/control.mjs restart
```

`restart` checks ownership and source, stops the server, and starts it again with the same run ID and
database. It may assign a new port. Read the returned URL instead of reusing a prior port.

`app/browser-verification/drive.mjs` is the executable Playwright driver loaded by `control.mjs drive` or
`control.mjs test`. Use the controller so readiness, identity checks, restart, and evidence use one run.
To inspect a saved trace, pass the exact evidence directory's `trace.zip` path to
`npx playwright show-trace`. Use the evidence path printed by the driver. Regenerate the session contract after storage model changes with
`node browser-verification/generate-contract.mjs` from `app/`. Keep the map current with
`/maintain-verification-skill` when a mapped behavior or selector changes.

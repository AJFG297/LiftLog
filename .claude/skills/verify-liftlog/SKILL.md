---
name: verify-liftlog
description: Launch and drive the real LiftLog mobile app (Expo dev-client build) on a dedicated, isolated Android emulator with Maestro, and capture proof - screenshots, Maestro reports, and SQLite rows. Use when you need to show that an app/ change actually works for a user (logging a workout, editing a plan, managing exercises, history), not just that tests pass.
---

# Verify LiftLog on Android

The user-facing surface is the **Android app** built from `app/`, served as a dev-client build (JS from a Metro
bundler, so JS edits need no rebuild). iOS isn't covered: it needs full Xcode, and this machine has only the Command
Line Tools. The `backend/` API is a secondary surface and isn't covered here. The driver is **Maestro**, the same one
behind the repo's e2e flows in `app/.maestro/`. Every command goes through one helper:

```bash
.claude/skills/verify-liftlog/verify.sh <command>
```

Run it from any directory in the checkout. It acts on the checkout it lives in: that checkout's `app/`, APK and
Metro.

## Isolation, and what not to touch

The helper uses its own AVD `liftlog-verify` on emulator port **5584** (serial `emulator-5584`) and its own Metro on
port **8091**. The user's own emulator (`Pixel_10_Pro_XL`, usually `emulator-5554`) and Metro (8081) may be running
at the same time. Never pass `--device emulator-5554`, run bare `maestro test` without `--device`, or reinstall the app
anywhere but `emulator-5584`: each of those could wipe the user's data or break another session's run.

Only **one** verify instance can run per machine. The AVD is locked while it's booted. `up` refuses to adopt an
emulator or Metro that this checkout didn't start. If another checkout owns them, run `down` from that checkout,
or ask the user.

Metro's caches are per checkout too. By default Metro keeps them in the OS temp dir, which every checkout shares.
Sibling worktrees under `.claude/worktrees/` produce identical cache keys for files in the shared `node_modules`,
so one worktree's Metro can serve another worktree's app (the dev client then lands on `DevLauncherErrorActivity`,
and `metro.log` shows `Unable to resolve ... ../../<other-worktree>/app/src`). `up` gives Metro a `TMPDIR` of its
own at `.verify-runs/.state/tmp/`. You don't need to set `TMPDIR` yourself.

## Launch

One-time per machine: `setup` creates the AVD. It checks that `maestro` is installed
(`brew install mobile-dev-inc/tap/maestro`) and that JDK 17 is present (`brew install openjdk@17`).

```bash
.claude/skills/verify-liftlog/verify.sh setup
.claude/skills/verify-liftlog/verify.sh build
.claude/skills/verify-liftlog/verify.sh up
.claude/skills/verify-liftlog/verify.sh flow .claude/skills/verify-liftlog/flows/ready.yaml
```

- `build`: `npm ci` if `node_modules` is missing, `expo prebuild --platform android` if `app/android/` is missing,
  then `gradlew app:assembleDebugOptimized` for arm64 only. A warm build takes about 2 minutes. Rebuild only when native
  code changes: `package.json` native deps, `app.json` plugins, or anything under `app/modules/` or `app/plugins/`.
  If you change `app.json` plugins, delete `app/android/` so prebuild regenerates it. JS/TS edits need no rebuild,
  but don't assume Metro picked them up. See "Metro can miss JS edits" under Gotchas.
- `up`: cold-boots the emulator headless (`VERIFY_WINDOW=1` shows a window), waits for `sys.boot_completed`,
  runs `adb install -r`, and sets up `adb reverse tcp:8091`. It then starts Metro from this checkout's `app/`, with
  its cache in `.verify-runs/.state/tmp/metro-cache`, waits for `/status` to report `packager-status:running`, and
  opens the dev client at the Metro URL. `down` removes that cache, so the first bundle after each `up` is built
  cold. `up` prints the **run id** and the evidence directory. Don't pipe `up` into another command
  (`verify.sh up | tail`): Metro inherits the pipe and holds it open, so the pipeline never ends even though `up`
  has finished. Redirect to a file instead (`verify.sh up > up.log 2>&1`), or run it as a background task.
- **Ready means `flows/ready.yaml` exits 0.** The flow launches the app, waits up to 3 minutes for the first bundle,
  dismisses the dev-client's developer-menu sheet, taps through the welcome wizard on a fresh install (Next, Next,
  Get started), and asserts the Workout tab's `Freeform workout` button. It's safe to re-run at any time.

Teardown is `verify.sh down`. See Cleanup.

## Doctor

Run `doctor` first whenever anything looks off: a flow can't find an element, the screen is blank, or you inherited
a running instance. It's read-only.

```bash
.claude/skills/verify-liftlog/verify.sh doctor
```

It checks that Maestro, JDK 17 and the APK are present, and that `emulator-5584` is online and is the
`liftlog-verify` AVD this checkout started. It checks that boot completed, the app is installed (with its version),
`adb reverse` is in place, the app is in the foreground, and Metro answers on 8091. It also checks that the Metro
process's working directory is **this checkout's `app/`**, and that its cache is **this checkout's
`.verify-runs/.state/tmp/metro-cache`** (read from the process environment), so the app is running your code. A
`FAIL metro cache` line means Metro was started some other way and may be using the shared cache: run `down`, then
`up`. The last line is `doctor: healthy` (exit 0) or `doctor: NOT healthy` (exit 1). A foreground `warn` alone is
fine. It means the app was backgrounded, and any flow's `launchApp` fixes that.

## Drive

Write a Maestro flow and run it against the verify device. Start from `app/.maestro/*.yaml` or the recipes in
`features/`.

```bash
.claude/skills/verify-liftlog/verify.sh flow <path/to/flow.yaml> [label]
```

- Every flow starts with `appId: com.ajfg297.liftlog`, `---`, then `- launchApp` and `extendedWaitUntil: {visible:
  'Workout', timeout: 60000}`. Put scratch flows in the run's evidence directory, not in `app/.maestro/`, unless the
  task is to add an e2e flow.
- **Handles**, in order of preference:
  - React Native `testID`, which Android exposes as `resource-id`. Target it with `tapOn: {id: 'repcount'}`.
  - Visible English text, which is a regex matched against the full string and case-insensitive. `(?-i)` pins the
    case: `'(?-i)Freeform workout'` is the button, and `'Freeform Workout'` also matches plan cards.
  - `index:` or `rightOf:` only when handles repeat.

  Find testIDs with `grep -rn "testID=" app/src`. English strings live in `app/src/i18n/en.json`.
- `verify.sh ui [label]`: prints every `text`, `resource-id` and `content-desc` on the current screen and saves the
  XML. Use it to find a handle before writing a flow step. When `uiautomator` can't dump the screen (one that never
  goes idle, like the live workout's rest timer), it saves Maestro's JSON hierarchy instead, where `content-desc` is
  `accessibilityText`.
- `verify.sh shot [label]`: takes an ad-hoc screenshot.
- `verify.sh db "<sql>"`: pulls a snapshot of the app's SQLite (`files/SQLite/db.db` plus WAL, via `run-as`, which
  debug builds allow) and runs the query locally. Workouts are relational, one row per workout, exercise
  and set:
  - `workout`: `id`, `active` (1 for the one in progress), `name`, `date`.
  - `workout_exercise`: `workout_id`, `position`, `kind` (`weighted` or `cardio`), and a JSON `blueprint`
    holding the exercise name.
  - `weighted_set`: `workout_id`, `exercise_position`, `position`, `reps`, `weight_value`, `weight_unit`,
    `completed_at`. An unlogged slot has `reps` and `completed_at` null.
  - `warmup_set` and `cardio_set` (`duration`, `distance_value`, `distance_unit`) share that key.

  Join sets to their exercise on `(workout_id, exercise_position) = (workout_id, position)`. A text primary key
  keeps SQLite's `rowid`, and a workout keeps its `rowid` when it is updated, so `order by rowid desc` puts the
  newest workout first. `program` and `exercise` still store one JSON `payload`: read it with
  `json_extract(payload, '$.name')`. There are also `backend` and the feed tables. Preferences aren't in SQLite.
  See `docs/Storage.md` and `app/src/db/schema.ts`.
- `verify.sh logs metro|emulator|app`: `app` is the ReactNativeJS logcat, where JS errors and `console.log` output
  land.

## Evidence

Everything goes under `.verify-runs/<run-id>/` at the checkout root. It's gitignored and **survives `down`**. Each
`flow` call writes `<HHMMSS>-<label>/`, which contains:

- `maestro.log`: step-by-step COMPLETED/FAILED/SKIPPED lines.
- `final.png`: the screen when the flow ended.
- `<timestamp>/<flow>/takeScreenshot/*.png`: your `takeScreenshot:` steps.
- On failure, `screenshots/`, `screen-hierarchy/`, and `logs/device-logcat.txt` for the failing step.

`db` writes `db-<HHMMSS>/` with the database copy and `query.txt`.

What counts as proof:

- **Exercise the real user path.** Tap through the UI the way a user would. Don't reach into Redux, don't write to
  SQLite, and don't open deep links that skip the screens under test. Use a deep link only when the feature itself
  is a deep link (`liftlog://`, `.liftlogplan` import).
- **Capture the action and the result.** `takeScreenshot` right after the key tap and again on the resulting screen,
  not only at the end.
- **Verify the side effect as well as the pixels.** Anything that persists must show up in a second view: reopen it
  in the UI, and/or query `db` before and after. Example: after logging a set, its `weighted_set` row
  has `reps`, `weight_value`, `weight_unit` and `completed_at` filled in.
- **No mocks.** The only external systems are the feed, AI planner and remote backup backends, and they're off unless
  configured. Don't point the app at production servers. For those features, use a local backend (see
  `docs/SelfHosting.md`), or report them unverified.
- Report the run id, the flows run, their exit codes, and the evidence paths. If a feature has several entry points
  in `features/` and you drove only one, say which ones you skipped.

## Cleanup

```bash
.claude/skills/verify-liftlog/verify.sh down
```

`down` stops the Metro process group and the emulator that this checkout started (by the pids saved in
`.verify-runs/.state/`, never by process name). It removes the `adb reverse` and deletes `.verify-runs/.state/`. It
prints `evidence kept at ...`, and `.verify-runs/<run-id>/` stays. The next `up` cold-boots, and the emulator keeps
its userdata, so installed-app data (sessions, plans) persists across runs. Flows should clean up after themselves
the way `app/.maestro/creating-a-plan.yaml` removes its plan. For a truly fresh install, run `adb -s
emulator-5584 uninstall com.ajfg297.liftlog` before `up`. Run `down` after a failed attempt too, so no emulator or
Metro is left running.

Never delete `.verify-runs/<run-id>/` as part of cleanup. Never run `gradlew --stop`, `pkill node`, or `adb kill-server`:
all three hit other sessions' builds, Metro, and emulators.

## Gotchas

- **JDK 24+ breaks the native build** with `A restricted method in java.lang.System has been called` (CMake
  configure). Android Studio's bundled JBR is 25, so the helper pins `/opt/homebrew/opt/openjdk@17`. Override it with
  `VERIFY_JAVA_HOME`.
- The dev client's floating grey Tools **gear** sits over header actions, and a tap by id lands on the element's
  centre, so it opened the dev menu instead of the live workout's Finish. `up` switches the gear off in the dev
  menu's preferences before launch. If it ever shows again, open the dev menu and turn off its Tools button.
- `launchApp` with `clearState: true` (as in `fresh-install-onboarding.yaml`, tagged `ci-only`) strands a
  dev-client build on the Expo launcher. For a first-run state, uninstall and reinstall the app instead.
- The dev client remembers the last Metro URL (`launchMode: most-recent`), so `launchApp` reconnects to 8091. If it
  shows the Expo dev-launcher screen instead of LiftLog, re-run `up`, which re-opens the URL.
- Running the whole `app/.maestro/` directory also runs `fresh-install-onboarding` unless you pass
  `--exclude-tags ci-only`. Run flows one at a time through `verify.sh flow`.
- **Metro can miss JS edits.** Without watchman installed, Metro's file watcher didn't notice an edited file in a
  git worktree. The app kept its already-built bundle, even across `am force-stop` and `launchApp`, and a flow that
  should have failed passed. A fresh bundle request did return the new code, so asking Metro directly doesn't
  show what the app is running. Before trusting a run after a JS edit, run `down` then `up` so Metro rebuilds
  from disk. When comparing old and new code (a control run), also add a temporary `console.log` marker and confirm it
  appears in `.verify-runs/.state/metro.log`.
- **Installing with `npm ci --ignore-scripts` breaks `build`.** It skips `patch-package` and
  `@shopify/react-native-skia`'s binary download, so the build fails with `Skia prebuilt binaries not found`.
  `build` only runs `npm ci` when `node_modules` is missing, so run a plain `npm ci` in `app/` yourself.
- Defaults are overridable with `VERIFY_AVD`, `VERIFY_EMU_PORT`, and `VERIFY_METRO_PORT`. Use them only when the
  defaults collide with something that isn't a verify instance.

## Feature map

`features/README.md` indexes the user-facing features, with one recipe file per feature. It's the maintained source
for what to drive. Keep it accurate when the app changes (`/maintain-verification-skill`).

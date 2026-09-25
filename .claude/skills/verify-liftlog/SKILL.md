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
  If you change `app.json` plugins, delete `app/android/` so prebuild regenerates it. JS/TS edits hot-reload through
  Metro.
- `up`: cold-boots the emulator headless (`VERIFY_WINDOW=1` shows a window), waits for `sys.boot_completed`,
  runs `adb install -r`, and sets up `adb reverse tcp:8091`. It then starts Metro from this checkout's `app/`, waits
  for `/status` to report `packager-status:running`, and opens the dev client at the Metro URL. It prints the **run
  id** and the evidence directory.
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
process's working directory is **this checkout's `app/`**, so the app is running your code. The last line is
`doctor: healthy` (exit 0) or `doctor: NOT healthy` (exit 1). A foreground `warn` alone is fine. It means the app
was backgrounded, and any flow's `launchApp` fixes that.

## Drive

Write a Maestro flow and run it against the verify device. Start from `app/.maestro/*.yaml` or the recipes in
`features/`.

```bash
.claude/skills/verify-liftlog/verify.sh flow <path/to/flow.yaml> [label]
```

- Every flow starts with `appId: com.limajuice.liftlog`, `---`, then `- launchApp` and `extendedWaitUntil: {visible:
  'Workout', timeout: 60000}`. Put scratch flows in the run's evidence directory, not in `app/.maestro/`, unless the
  task is to add an e2e flow.
- **Handles**, in order of preference:
  - React Native `testID`, which Android exposes as `resource-id`. Target it with `tapOn: {id: 'repcount'}`.
  - Visible English text, which is a regex matched against the full string and case-insensitive. `(?-i)` pins the
    case: `'(?-i)Freeform workout'` is the button, and `'Freeform Workout'` also matches plan cards.
  - `index:` or `rightOf:` only when handles repeat.

  Find testIDs with `grep -rn "testID=" app/src`. English strings live in `app/src/i18n/en.json`.
- `verify.sh ui [label]`: prints every `text`, `resource-id` and `content-desc` on the current screen and saves the
  XML. Use it to find a handle before writing a flow step.
- `verify.sh shot [label]`: takes an ad-hoc screenshot.
- `verify.sh db "<sql>"`: pulls a snapshot of the app's SQLite (`files/SQLite/db.db` plus WAL, via `run-as`, which
  debug builds allow) and runs the query locally. Tables: `session` (`active`, JSON `payload`), `program`,
  `exercise`, `backend`, and the feed tables. Read JSON fields with `json_extract(payload, '$.blueprint.name')`.
  Preferences aren't in SQLite. See `docs/Storage.md`.
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
  in the UI, and/or query `db` before and after. Example: after logging a set, the `session` row's
  `recordedExercises[0].potentialSets[0]` holds `repsCompleted` and `weight`.
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
emulator-5584 uninstall com.limajuice.liftlog` before `up`. Run `down` after a failed attempt too, so no emulator or
Metro is left running.

Never delete `.verify-runs/<run-id>/` as part of cleanup. Never run `gradlew --stop`, `pkill node`, or `adb kill-server`:
all three hit other sessions' builds, Metro, and emulators.

## Gotchas

- **JDK 24+ breaks the native build** with `A restricted method in java.lang.System has been called` (CMake
  configure). Android Studio's bundled JBR is 25, so the helper pins `/opt/homebrew/opt/openjdk@17`. Override it with
  `VERIFY_JAVA_HOME`.
- The dev client shows a floating grey **gear** in the top-right corner. It can sit over header actions, so tap
  those by id or text, not by coordinates.
- `launchApp` with `clearState: true` (as in `fresh-install-onboarding.yaml`, tagged `ci-only`) strands a
  dev-client build on the Expo launcher. For a first-run state, uninstall and reinstall the app instead.
- The dev client remembers the last Metro URL (`launchMode: most-recent`), so `launchApp` reconnects to 8091. If it
  shows the Expo dev-launcher screen instead of LiftLog, re-run `up`, which re-opens the URL.
- Running the whole `app/.maestro/` directory also runs `fresh-install-onboarding` unless you pass
  `--exclude-tags ci-only`. Run flows one at a time through `verify.sh flow`.
- Defaults are overridable with `VERIFY_AVD`, `VERIFY_EMU_PORT`, and `VERIFY_METRO_PORT`. Use them only when the
  defaults collide with something that isn't a verify instance.

## Feature map

`features/README.md` indexes the user-facing features, with one recipe file per feature. It's the maintained source
for what to drive. Keep it accurate when the app changes (`/maintain-verification-skill`).

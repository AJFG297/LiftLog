# Getting a change onto the phones

The app reaches the two Android phones in one of two ways. A **build** is a new APK, installed from a
link. An **update** is new JavaScript sent over the air with EAS Update, which a phone picks up on its own.
Most redesign changes are JavaScript only and go out as an update.

Run every command from `app/`, on an up-to-date `main`, after `npm ci`. The runtime version below is
worked out on the laptop from `node_modules`, so `node_modules` that don't match the lock file give an
update a runtime version no phone has, with no warning.

The phones only ever run **EAS builds** (`npx eas-cli build`). The APKs the GitHub Actions workflows
build keep the Gradle version expressions, so they get a different runtime version and no update
channel, and never receive updates.

## Decide: build or update

A phone runs an update only when the update's **runtime version** matches its build's. The runtime
version is a fingerprint of the native side of the app (`runtimeVersion: { policy: 'fingerprint' }` in
`app/app.config.js`), so it changes whenever something native changes. That includes:

- adding, removing or upgrading a dependency with native code in `package.json`;
- anything in the Expo config (`app.json`, `app.config.js`), including plugins, the app icon and the
  splash screen;
- anything under `app/modules/`, `app/plugins/` or `app/patches/`, and the `scripts` in `package.json`;
- `eas.json`.

Print the current fingerprint with:

```bash
npx expo-updates runtimeversion:resolve --platform android
```

Compare it with the runtime version of the build on the phones (on the build's page on expo.dev). If they
match, publish an update. If they don't, make a build. An update published after a native change goes
nowhere: no installed build has its runtime version.

## Publish an update

```bash
npx eas-cli update --channel preview --environment preview --platform android --message "Live workout focus mode"
```

The phones check for an update each time the app starts, and download it in the background. The new code
runs from the next cold start: open the app, then close it fully (swipe it away) and open it again.

`npx eas-cli update:list` shows what has been published.

## Undo a bad update

`npx eas-cli update:rollback --platform android` republishes the update before the one you pick, or, if
there is none, sends the phones back to the code inside the build. Like any update, the phones download
the rollback on one launch and run it from the next cold start.

Don't roll back past an update that changed what the app stores (a storage migration or a Drizzle
migration in `app/src/drizzle/`). The phones' data has already moved forward, and the older code can't
read it. Publish a fix on top instead.

## Make a build

```bash
npx eas-cli build --platform android --profile preview
```

It takes 15 to 45 minutes and ends with an install link. Open it on each phone and install over the
existing app. Never uninstall first: that deletes the workouts. EAS keeps the signing key, so every
`preview` build installs over the last one. Builds from the `preview` profile listen on the `preview`
channel.

## Keep both phones on the same version

The phones exchange feed items and shared plans, and those formats are versioned. An older app drops
what a newer one sends (see [ADR-0001](./adr/0001-own-backend-no-upstream-compatibility.md)). Put both
phones on the same build or update, and cold-start both so neither keeps running the old code.

## Dev builds are separate

The emulator and `verify-liftlog` run a development build that loads JavaScript from Metro on the laptop.
EAS updates don't apply to it; it listens on the `development` channel, which nothing publishes to.

# Getting a change onto the phones

The app reaches the two Android phones in one of two ways. A **build** is a new APK, installed from a
link. An **update** is new JavaScript sent over the air with EAS Update, which a phone picks up on its own.
Most redesign changes are JavaScript only and go out as an update. Run every command from `app/`, on an
up-to-date `main`.

## Decide: build or update

A phone runs an update only when the update's **runtime version** matches its build's. The runtime
version is a fingerprint of the native side of the app (`runtimeVersion: { policy: 'fingerprint' }` in
`app/app.config.js`), so it changes whenever something native changes:

- a dependency with native code in `package.json` (a new Expo module, for example);
- the plugins or native settings in `app.json` or `app.config.js`, the app icon or the splash screen;
- anything under `app/modules/` or `app/plugins/`;
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
npx eas-cli update --channel preview --message "Live workout focus mode"
```

The phones check for an update each time the app starts, and download it in the background. The new code
runs from the next cold start: open the app, then close it fully (swipe it away) and open it again.

`npx eas-cli update:list` shows what has been published. To undo a bad update, run
`npx eas-cli update:rollback` and pick the channel. The phones go back to the previous update, or to the
code in the build, on their next cold start.

## Make a build

```bash
npx eas-cli build --platform android --profile preview
```

It takes about 15 minutes and ends with an install link. Open it on each phone and install over the
existing app. Never uninstall first: that deletes the workouts. EAS keeps the signing key, so every
`preview` build installs over the last one. Builds from the `preview` profile listen on the `preview`
channel.

## Keep both phones on the same version

Storage migrations mean an older app can't read what a newer one writes (see
[ADR-0001](./adr/0001-own-backend-no-upstream-compatibility.md)). Put both phones on the same build or
update, and cold-start both so neither keeps running the old code.

## Dev builds are separate

The emulator and `verify-liftlog` run a development build that loads JavaScript from Metro on the laptop.
EAS updates don't apply to it; it listens on the `development` channel, which nothing publishes to.

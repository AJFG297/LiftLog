# Change workout appearance

Switch the workout controls between light and dark, then choose a blue accent. Appearance changes keep
stored workout rows unchanged.

## Sub-features

- `themes.light`: Capture the default accent in light mode.
- `themes.dark`: Capture the default accent in dark mode.
- `themes.blue`: Capture blue accent in both dark and light mode.
- `themes.workout`: Keep persisted workout sets unchanged during appearance changes.

## How to get to it (user POV)

Open the instance URL printed by `up`. The **Theme** controls in the prototype header provide **Light**,
**Dark**, and **Blue accent**. These controls change the shared components' appearance directly.
The mobile **You → Theme** screen is verified through the Android workflow.

## Driving it with Playwright

Preconditions: Start a fresh run with the default accent and **Workout saved**. The driver opens the weight field first so
all screenshots compare the same shared table and keypad.

```bash
npm run verify:browser -- themes
```

The command runs these checks at both sizes on separate fresh fixtures. `app` is the driver's
`page.frameLocator('iframe[title="Workout preview"]')` locator. The driver performs these actions and
checks their results:

- Light: `app.getByRole('button', { name: 'Light', exact: true }).click()` selects light mode. Review
  `light.png` with `light.aria.txt` for the table, keypad, and selected control.
- Dark: Button `Dark` selects dark mode. Review `dark.png` with `dark.aria.txt` for the same content.
- Blue: Button `Blue accent` selects the blue accent while dark mode remains active. Review `dark-blue`
  artifacts, then button `Light` and the `light-blue` artifacts.
- Stored workout: Compare `before-themes.db.json` and `after-themes.db.json`. The driver requires their
  `weightedSets` arrays to match exactly.

## Gotchas

- The driver asserts selected controls, light/dark background changes, and accent changes, and saves
  `palettes.json`. Review screenshots for layout and contrast. It does not calculate contrast ratios
  or pixel differences.
- Theme controls live in the prototype header. This recipe does not verify the native theme picker,
  wallpaper colors, or preference persistence after reload.
- Blue accent is `#2F5BD3`. A manual theme drive after another theme drive may start with blue already
  selected. Use a fresh run to capture the default accent.
- Android screenshots remain required for UI PRs. These browser images document the prototype run.

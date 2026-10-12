# Resize the workout preview

Choose Regular 390 × 844 or Large 430 × 932 above the workout. The iframe keeps its document while its
actual layout viewport changes. The default selection is Regular. The selected size remains in the
outer URL query after a page reload. Committed workout data survives reload and server restart.
Transient drafts and appearance survive live size switches and reset on reload.

## Sub-features

- `viewports.regular`: Use the default 390 × 844 layout viewport.
- `viewports.large`: Use the 430 × 932 layout viewport.
- `viewports.resize`: Retain the active field, partial number, unlogged reps, and appearance on a live switch.
- `viewports.overflow`: Scroll to a later field while the keypad remains inside the selected viewport.

## How to get to it (user POV)

Open the instance URL printed by `up`. Select **Regular 390 × 844** or **Large 430 × 932** above the
workout. Select a weight or reps field inside the workout to open the number pad.

## Driving it with Playwright

Run `npm run verify:browser` to check both sizes on separate fresh databases. Every scenario includes
these checks after its workout, set, or appearance assertions:

- Type unlogged reps for Set 2, then leave a partial `82.` weight buffer active on Set 1.
- Select dark mode and blue accent, then use the outer buttons to switch sizes and return.
- Check the iframe's `innerWidth` and `innerHeight`, fixed source, selected field, partial buffer,
  unlogged reps, and appearance. Confirm that switches make no workout PUT request, trigger no iframe
  navigation, and leave the SQL set rows unchanged.
- Finish the weight and log Set 2. Check the resulting completion and reps in SQL.
- Add sets until there are 16, then open the last weight field through visible controls. Check that the
  workout area scrolls, the selected field is inside it, and the keypad stays within the viewport.

`resize-<size>.png` captures the other size. `resize-preserved` captures the restored size, and
`overflow-keypad` captures the last set with the keypad open. The manifest records each actual viewport
and its shell, content, and keypad geometry. All coordinates use the iframe's document.

## Gotchas

- Every drive logs Set 2 and adds rows for overflow checks. Start a fresh run before a later manual
  workout drive.
- Screenshots are bounded iframe captures. Full-page screenshots would hide a keypad below the viewport.
- The dimensions live in `app/browser-verification/viewports.json`, shared by the viewer and driver.
- These checks cover the browser prototype layout. Native screen layout still requires Android checks.

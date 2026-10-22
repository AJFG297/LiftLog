# Reorder exercises in the workout strip

Run `npm run verify:browser -- reorder` from `app/`. Each viewport gets a fresh ten-exercise fixture, including Lateral Raise and Biceps Curl as a superset. The scenario mounts the production `ExerciseStrip` and calls the same `moveLiveWorkoutGroup` command as the workout and All exercises sheet.

The driver uses genuine Chromium touch events and mouse input. It taps tiles to change focus, swipes before the hold delay, and checks that small finger jitter does not activate early. A 350ms hold lifts the group. Holding at each edge must increase or decrease the scroll offset repeatedly while the pointer stays still. Geometry checks that the grabbed tile remains beneath that pointer. The scenario then drops beyond the original viewport, cancels another drag, holds without moving, and drags a superset by its second member. A mouse drag checks the alternate input path.

Before the first drag the driver types 7 reps through the production number pad. Activation closes the pad and commits the buffer. The focused exercise and its draft must follow the far drop. Logging then persists the same reps. SQL evidence records exercise order and superset links. Reload and server restart must preserve the final order and logged set.

Evidence includes light, dark, and blue-accent screenshots, activated and edge-held screenshots, ARIA snapshots, a Playwright trace, video, geometry samples, SQL snapshots, and a manifest. The fixture POST is setup. Every reorder uses the visible production control.

The prototype still supplies the page and save queue. These checks do not prove native navigation, the native All exercises sheet, platform haptics, or production persistence effects. Native gesture arbitration requires an emulator if the browser evidence is insufficient for the change under review.

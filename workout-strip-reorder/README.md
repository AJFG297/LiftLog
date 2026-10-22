# Workout strip reorder proof

Feature commit `32e6f662ac2288c6beec03fdd917e28df029ee4f`.

The screenshots and video show the actual shared ExerciseStrip in the browser verifier. Before images render the unchanged main strip with matching names and zero of two sets logged. Every screenshot is scaled to at most 800 pixels.

The final browser suite passed the classic and reorder scenarios at Regular 390 x 844 and Large 430 x 932. Reorder uses genuine touch and mouse input, both edge directions, cancellation, supersets, typed reps, SQLite rows, reload and server restart. The video records the Regular scenario. verification.json identifies the runs and their retained evidence.

The browser checks shared components and the move command. Native navigation, haptics, services and native gesture arbitration are excluded. Active samples prove that the pointer remains inside the grabbed tile. The exact grabbed offset is checked after scrolling stops.

These files belong only on pr-assets. Embed their pinned URLs in the PR description. Do not merge this media branch into main.

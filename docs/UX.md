# UX rules

Interaction rules every screen follows. Read this before designing or building a screen, sheet or control,
alongside the product goal in [AGENTS.md](../AGENTS.md) ("Effortless UX"). `/code-review` checks diffs against
these rules through [CODING_STANDARDS.md](../CODING_STANDARDS.md).

## Dismiss the innermost layer first

A screen is a stack of layers: the screen, a sheet over it, and transient UI inside that (the in-screen number
pad, a menu, a popover, the keyboard). Every "go away" input closes only the top layer:

- the system back gesture (Android back button, edge swipe, predictive back);
- swipe-down, or drag-to-dismiss, on a sheet;
- tapping outside, where that dismisses.

So with the number pad open inside the edit exercise sheet, back or swipe-down closes the pad and the sheet
stays. The next one closes the sheet. This is how the system keyboard already behaves, and our pad stands in
for the keyboard.

How to apply it, whenever a change adds transient UI inside a sheet or screen:

- Intercept back while the layer is open (`BackHandler` on Android) and close the layer instead.
- Stop the sheet's own dismissal from winning the gesture while the layer is up (for example
  `usePreventRemove`, or disabling the sheet's gesture).
- A dismiss gesture never throws away editing context meant for a bigger layer.

Terms, for searching: back stack, dismissal hierarchy, transient UI, interactive dismissal, gesture conflict
and gesture arbitration.

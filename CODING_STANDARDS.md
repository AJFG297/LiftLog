# Coding standards

Judgement calls the `/code-review` Standards reviewer checks a diff against. Mechanical rules belong in a lint
or a check instead, and the conventions in [AGENTS.md](AGENTS.md) apply as well.

## Interaction

### Dismiss the innermost layer first

A screen is a stack of layers: the screen, a sheet over it, and transient UI inside that (the in-screen number
pad, a menu, a popover, the keyboard). Every "go away" input closes only the top layer:

- the system back gesture (Android back button, edge swipe, predictive back);
- swipe-down / drag-to-dismiss on a sheet;
- tapping outside, where that dismisses.

So with the number pad open inside the edit exercise sheet, back or swipe-down closes the pad and the sheet
stays. The next one closes the sheet. This is how the system keyboard already behaves, and our pad stands in
for the keyboard.

Check for it whenever a change adds transient UI inside a sheet or screen: intercept back while the layer is
open (`BackHandler` on Android) and stop the sheet's own dismissal from winning the gesture (for example
`usePreventRemove`, or disabling the sheet's gesture while the layer is up). A dismiss gesture should never
throw away editing context meant for a bigger layer.

import type { NativeStackNavigationOptions } from 'expo-router';

/** Heights a sheet can rest at, as ascending fractions of the screen. Android honours at most three. */
export type SheetDetents = [number] | [number, number] | [number, number, number];

/**
 * Screen options for a native sheet (docs/plans/redesign.md, D7). Sheets are expo-router routes, not a
 * sheet library: register the route in its parent `Stack` with these options, and start its content with a
 * `SheetHeader`, which carries the close button, so the native header stays hidden.
 *
 * ```tsx
 * <Stack.Screen name="rest" options={formSheetOptions([0.5, 0.9])} />
 * ```
 *
 * Open it with `router.push('/rest')`, close it with `router.back()` (or a swipe down).
 */
export function formSheetOptions(
  detents: SheetDetents,
  options: {
    /**
     * Leave the screen behind undimmed and touchable at every detent, for a sheet that edits something on
     * that screen. Both platforms pass touches through where there is no dimming.
     */
    undimmed?: boolean;
  } = {},
): NativeStackNavigationOptions {
  return {
    presentation: 'formSheet',
    sheetAllowedDetents: detents,
    sheetGrabberVisible: true,
    sheetCornerRadius: 28,
    headerShown: false,
    ...(options.undimmed ? { sheetLargestUndimmedDetentIndex: 'last' } : {}),
  };
}

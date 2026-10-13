import type { NativeStackNavigationOptions } from 'expo-router';

/**
 * Heights a sheet can rest at, as ascending fractions of the screen. Android honours at most three.
 * `fitToContents` sizes the sheet to its content and follows it as it grows: the content must not use `flex: 1`.
 */
export type SheetDetents = [number] | [number, number] | [number, number, number] | 'fitToContents';

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
export function formSheetOptions(detents: SheetDetents): NativeStackNavigationOptions {
  return {
    presentation: 'formSheet',
    sheetAllowedDetents: detents,
    sheetGrabberVisible: true,
    sheetCornerRadius: 28,
    headerShown: false,
  };
}

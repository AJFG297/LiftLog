import { usePreventRemove, useNavigation } from 'expo-router/react-navigation';
import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

export interface DismissLayer {
  /**
   * Leaves the screen on purpose, past the open layer: for a Save or Done button, which should close the sheet
   * even while the pad is up. `go` is the navigation, usually `router.back()`.
   */
  leave: (go: () => void) => void;
}

/**
 * Makes transient UI inside a screen or sheet (the in-sheet number pad) the first thing a "go away" input closes
 * (CODING_STANDARDS.md, "Dismiss the innermost layer first"). While `open`, the system back (Android button,
 * edge swipe) and the iOS sheet's swipe-down call `close` and leave the screen where it is; the next one
 * closes the screen as usual.
 */
export function useDismissLayer(open: boolean, close: () => void): DismissLayer {
  const navigation = useNavigation();
  const leaving = useRef(false);
  const latestClose = useRef(close);
  useEffect(() => {
    latestClose.current = close;
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    // Listeners run newest first, so this one goes before the navigator's own back handling. A sheet pushed on
    // top of this screen keeps its back: an unfocused screen lets it through.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!navigation.isFocused()) {
        return false;
      }
      latestClose.current();
      return true;
    });
    return () => subscription.remove();
  }, [open, navigation]);

  // On iOS this also stops the sheet's swipe-down natively (`preventNativeDismiss`) and reports it here. Android's
  // sheet ignores that and always lets the swipe dismiss natively, so preventing the pop there would leave a route
  // in the state with no screen on display: back is handled above instead.
  usePreventRemove(open && Platform.OS === 'ios', ({ data }) => {
    if (leaving.current) {
      leaving.current = false;
      navigation.dispatch(data.action);
      return;
    }
    latestClose.current();
  });

  return {
    leave: (go) => {
      leaving.current = open && Platform.OS === 'ios';
      go();
    },
  };
}

import { isNotNullOrUndefined } from '@/utils/null';
import { useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';

/**
 * Taps go through gesture-handler rather than a `Pressable`, so a button inside a gesture-handler scroll view
 * or sheet still fires. `pressed` drives the pressed look.
 */
export function useGesturePress(options: {
  onPress: undefined | (() => void);
  onLongPress?: undefined | (() => void);
  disabled?: boolean;
}) {
  const { onPress, onLongPress, disabled } = options;
  const [pressed, setPressed] = useState(false);
  const enabled = !disabled && (!!onPress || !!onLongPress);
  const tap = Gesture.Tap()
    .enabled(enabled)
    .runOnJS(true)
    .onBegin(() => setPressed(true))
    .onFinalize(() => setPressed(false))
    .onStart(() => onPress?.());
  const longPress = onLongPress
    ? Gesture.LongPress()
        .enabled(enabled)
        .runOnJS(true)
        .onStart(() => onLongPress())
    : undefined;
  return { gesture: Gesture.Race(...[tap, longPress].filter(isNotNullOrUndefined)), pressed };
}

import { useGesturePress } from '@/components/presentation/foundation/gesture-press';
import { GesturePressableProps } from '@/components/presentation/foundation/pressable-props';
import { useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { AccessibilityProps, StyleProp, View, ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

type TouchableRippleProps = AccessibilityProps & {
  children: ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A pressable area with no look of its own beyond the pressed tint. */
export default function TouchableRipple({
  children,
  disabled,
  style,
  testID,
  onPress,
  onLongPress,
  ...accessibility
}: GesturePressableProps<TouchableRippleProps>) {
  const { tokens } = useAppTheme();
  const { gesture, pressed } = useGesturePress({ onPress, onLongPress, disabled });
  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={testID}
        accessible
        accessibilityRole="button"
        {...accessibility}
        collapsable={false}
        style={[style, pressed && !disabled && { backgroundColor: tokens.track }]}
      >
        {children}
      </View>
    </GestureDetector>
  );
}

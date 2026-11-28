import { AppIconSource } from '@/components/presentation/foundation/ms-icon-source';
import Icon from '@/components/presentation/foundation/icon';
import { useGesturePress } from '@/components/presentation/foundation/gesture-press';
import { GesturePressableProps } from '@/components/presentation/foundation/pressable-props';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { useAppTheme } from '@/hooks/useAppTheme';
import { StyleProp, View, ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

type IconButtonProps = {
  icon: AppIconSource;
  /** The icon's size; the round button around it is 16pt wider. */
  size?: number;
  /** No mode is a bare icon; `outlined` a hairline ring; `contained` the accent fill; `contained-tonal` the soft accent. */
  mode?: 'outlined' | 'contained' | 'contained-tonal';
  iconColor?: string;
  containerColor?: string;
  mirrored?: boolean;
  disabled?: boolean;
  /** An icon alone says nothing to a screen reader; name what it does. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export default function IconButton({
  icon,
  size = 24,
  mode,
  iconColor,
  containerColor,
  mirrored,
  disabled,
  accessibilityLabel,
  style,
  testID,
  onPress,
  onLongPress,
}: GesturePressableProps<IconButtonProps>) {
  const { tokens } = useAppTheme();
  const { gesture, pressed } = useGesturePress({ onPress, onLongPress, disabled });
  const look = {
    bare: { fill: 'transparent', ink: tokens.ink },
    outlined: { fill: tokens.card, ink: tokens.ink },
    contained: { fill: tokens.accent, ink: tokens.onAccent },
    'contained-tonal': { fill: tokens.accentSoft, ink: tokens.accentSoftInk },
  }[mode ?? 'bare'];
  const diameter = size + 16;
  const fill = containerColor ?? look.fill;
  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={testID}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!disabled }}
        collapsable={false}
        style={[
          {
            minWidth: Math.max(diameter, MIN_TOUCH_TARGET),
            minHeight: Math.max(diameter, MIN_TOUCH_TARGET),
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        <View
          style={{
            width: diameter,
            height: diameter,
            borderRadius: diameter / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              disabled && mode && mode !== 'outlined' ? tokens.track : pressed && !mode ? tokens.track : fill,
            borderWidth: mode === 'outlined' ? 1 : 0,
            borderColor: tokens.line2,
            opacity: pressed && mode && !disabled ? 0.8 : 1,
          }}
        >
          <Icon
            source={icon}
            size={size}
            color={disabled ? tokens.faint : (iconColor ?? look.ink)}
            mirrored={mirrored}
          />
        </View>
      </View>
    </GestureDetector>
  );
}

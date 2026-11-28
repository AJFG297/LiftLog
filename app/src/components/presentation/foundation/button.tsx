import { AppIconSource } from '@/components/presentation/foundation/ms-icon-source';
import Icon from '@/components/presentation/foundation/icon';
import { useGesturePress } from '@/components/presentation/foundation/gesture-press';
import { GesturePressableProps } from '@/components/presentation/foundation/pressable-props';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { StyleProp, TextStyle, View, ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

export type ButtonMode = 'text' | 'outlined' | 'contained' | 'contained-tonal';

export type ButtonProps = {
  children: ReactNode;
  /** `text` (the default) is a bare accent label; `contained` the accent fill; `outlined` a card with a hairline. */
  mode?: ButtonMode;
  icon?: AppIconSource;
  disabled?: boolean;
  /** Overrides the label colour, for a button on a coloured surface. */
  textColor?: string;
  labelStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
};

/** An inline button drawn from the theme tokens. For the full-width button that ends a page, use `ActionButton`. */
export default function Button({
  children,
  mode = 'text',
  icon,
  disabled,
  textColor,
  labelStyle,
  style,
  testID,
  accessibilityLabel,
  onPress,
  onLongPress,
}: GesturePressableProps<ButtonProps>) {
  const { tokens } = useAppTheme();
  const { gesture, pressed } = useGesturePress({ onPress, onLongPress, disabled });
  const look = {
    text: { fill: 'transparent', ink: tokens.accentInk, border: 'transparent' },
    outlined: { fill: tokens.card, ink: tokens.ink, border: tokens.line2 },
    contained: { fill: tokens.accent, ink: tokens.onAccent, border: 'transparent' },
    'contained-tonal': { fill: tokens.accentSoft, ink: tokens.accentSoftInk, border: 'transparent' },
  }[mode];
  const ink = disabled ? tokens.faint : (textColor ?? look.ink);
  const fill = disabled && mode !== 'text' && mode !== 'outlined' ? tokens.track : look.fill;
  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={testID}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!disabled }}
        // See ActionButton: keeping this a real container stops Fabric moving the label on press.
        collapsable={false}
        style={[
          {
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: 12,
            paddingHorizontal: mode === 'text' ? spacing[3] : spacing[4],
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing[2],
            backgroundColor:
              pressed && !disabled ? (mode === 'text' || mode === 'outlined' ? tokens.track : fill) : fill,
            borderWidth: mode === 'outlined' ? 1 : 0,
            borderColor: look.border,
            opacity: pressed && !disabled && (mode === 'contained' || mode === 'contained-tonal') ? 0.85 : 1,
          },
          style,
        ]}
      >
        {icon !== undefined && <Icon source={icon} size={18} color={ink} />}
        <SurfaceText font="text-sm" weight="600" style={[{ color: ink, textAlign: 'center' }, labelStyle]}>
          {children}
        </SurfaceText>
      </View>
    </GestureDetector>
  );
}

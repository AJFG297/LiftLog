import { AppIconName, MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';

const SIZES = {
  regular: { diameter: 44, icon: 20 },
  compact: { diameter: 36, icon: 18 },
} as const;

interface RoundIconButtonProps {
  icon: AppIconName;
  /** Required: an icon alone says nothing to a screen reader. */
  accessibilityLabel: string;
  onPress: () => void;
  /** `compact` draws a 36pt circle, centred in a 44pt touch target. */
  size?: keyof typeof SIZES;
  /** Text after the icon, which stretches the circle into a pill: the summary's Share. */
  label?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A round, outlined icon button: the close button in a sheet header, a toolbar action. Named apart from the
 * Paper-based default export in `icon-button.tsx`, which most screens still use.
 */
export function RoundIconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = 'regular',
  label,
  disabled,
  style,
  testID,
}: RoundIconButtonProps) {
  const { tokens } = useAppTheme();
  const { diameter, icon: iconSize } = SIZES[size];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      {({ pressed }) => (
        <View
          style={{
            height: diameter,
            minWidth: diameter,
            paddingHorizontal: label ? 14 : 0,
            flexDirection: 'row',
            gap: 6,
            borderRadius: diameter / 2,
            borderWidth: 1,
            borderColor: tokens.line,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? tokens.track : tokens.card,
          }}
        >
          <MsIconSrc name={icon} size={label ? iconSize - 2 : iconSize} color={disabled ? tokens.faint : tokens.ink} />
          {label ? (
            <SurfaceText font="text-sm" weight="600" style={{ color: disabled ? tokens.faint : tokens.ink }}>
              {label}
            </SurfaceText>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

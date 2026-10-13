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
  accessibilityHint?: string;
  onPress: () => void;
  /** `compact` draws a 36pt circle, centred in a 44pt touch target. */
  size?: keyof typeof SIZES;
  /** Text after the icon, which stretches the circle into a pill: the summary's Share. */
  label?: string;
  /**
   * Makes it a toggle, on or off, that screen readers hear as one; on, it fills with the soft accent: the
   * exercise page's Pin to Progress. Left out, it is a plain button.
   */
  selected?: boolean;
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
  accessibilityHint,
  onPress,
  size = 'regular',
  label,
  selected,
  disabled,
  style,
  testID,
}: RoundIconButtonProps) {
  const { tokens } = useAppTheme();
  const { diameter, icon: iconSize } = SIZES[size];
  const ink = disabled ? tokens.faint : selected ? tokens.accentSoftInk : tokens.ink;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={selected === undefined ? 'button' : 'togglebutton'}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, checked: selected }}
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
            borderColor: selected ? tokens.accentSoft : tokens.line,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? tokens.accentSoft : pressed ? tokens.track : tokens.card,
          }}
        >
          <MsIconSrc name={icon} size={label ? iconSize - 2 : iconSize} color={ink} />
          {label ? (
            <SurfaceText font="text-sm" weight="600" style={{ color: ink }}>
              {label}
            </SurfaceText>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

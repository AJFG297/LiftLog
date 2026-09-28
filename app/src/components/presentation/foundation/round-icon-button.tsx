import { AppIcon, AppIconName } from '@/components/presentation/foundation/ms-icon-source';
import { hitSlopFor } from '@/components/presentation/foundation/touch-target';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, StyleProp, ViewStyle } from 'react-native';

const SIZES = {
  regular: { diameter: 44, icon: 20 },
  compact: { diameter: 36, icon: 18 },
} as const;

interface RoundIconButtonProps {
  icon: AppIconName;
  /** Required: an icon alone says nothing to a screen reader. */
  accessibilityLabel: string;
  onPress: () => void;
  /** `compact` draws a 36pt circle and keeps a 44pt hit area. */
  size?: keyof typeof SIZES;
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
      hitSlop={hitSlopFor({ width: diameter, height: diameter })}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          borderWidth: 1,
          borderColor: tokens.line,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? tokens.track : tokens.card,
        },
        style,
      ]}
    >
      <AppIcon name={icon} size={iconSize} color={disabled ? tokens.faint : tokens.ink} />
    </Pressable>
  );
}

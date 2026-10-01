import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';

const LOOK = {
  primary: { height: 54, radius: 16, font: 'text-base' },
  secondary: { height: 48, radius: 14, font: 'text-sm' },
  ink: { height: 48, radius: 14, font: 'text-base' },
} as const;

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  /**
   * `primary` is the accent fill for the one thing a screen is for; `secondary` is an outlined card; `ink` is
   * the ink fill for the way out of an empty state ('Create "X"').
   */
  variant?: keyof typeof LOOK;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A full-width button at the end of a sheet or a page: "Update routine", "Done". Drawn from the theme
 * tokens rather than a native button, because it is part of the content it closes.
 */
export function ActionButton({ label, onPress, variant = 'primary', disabled, style, testID }: ActionButtonProps) {
  const { tokens } = useAppTheme();
  const look = LOOK[variant];
  const filled = variant !== 'secondary';
  const fill = variant === 'ink' ? tokens.ink : tokens.accent;
  const onFill = variant === 'ink' ? tokens.bg : tokens.onAccent;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={style}
    >
      {({ pressed }) => (
        <View
          // The fill stays a native view for its background, but Fabric hoists the label out of it into the
          // Pressable. Opacity below 1 makes a stacking context, which moves the label back in, so a press
          // moves it twice. When the press also leaves the screen (Done, Apply), the move back lands while
          // react-native-screens holds the leaving screen's views in place for the exit animation, and
          // Android throws "View already has a parent". Keeping the fill a container stops the moves.
          collapsable={false}
          style={{
            // Side by side in a row, the shorter secondary grows to its partner's height.
            flexGrow: 1,
            minHeight: look.height,
            borderRadius: look.radius,
            paddingHorizontal: spacing[4],
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: filled ? 0 : 1,
            borderColor: tokens.line,
            backgroundColor: disabled ? tokens.track : filled ? fill : pressed ? tokens.track : tokens.card,
            opacity: filled && pressed && !disabled ? 0.85 : 1,
          }}
        >
          <SurfaceText
            font={look.font}
            weight="600"
            style={{ color: disabled ? tokens.muted : filled ? onFill : tokens.ink, textAlign: 'center' }}
          >
            {label}
          </SurfaceText>
        </View>
      )}
    </Pressable>
  );
}

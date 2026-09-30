import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';

const LOOK = {
  primary: { height: 54, radius: 16, font: 'text-base' },
  secondary: { height: 48, radius: 14, font: 'text-sm' },
} as const;

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  /** `primary` is the accent fill for the one thing a screen is for; `secondary` is an outlined card. */
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
  const primary = variant === 'primary';
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
          style={{
            // Side by side in a row, the shorter secondary grows to its partner's height.
            flexGrow: 1,
            minHeight: look.height,
            borderRadius: look.radius,
            paddingHorizontal: spacing[4],
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: primary ? 0 : 1,
            borderColor: tokens.line,
            backgroundColor: disabled ? tokens.track : primary ? tokens.accent : pressed ? tokens.track : tokens.card,
            opacity: primary && pressed && !disabled ? 0.85 : 1,
          }}
        >
          <SurfaceText
            font={look.font}
            weight="600"
            style={{ color: disabled ? tokens.muted : primary ? tokens.onAccent : tokens.ink, textAlign: 'center' }}
          >
            {label}
          </SurfaceText>
        </View>
      )}
    </Pressable>
  );
}

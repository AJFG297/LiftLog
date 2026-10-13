import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { DimensionValue, Pressable, View } from 'react-native';

interface HeaderPillButtonProps {
  label: string;
  onPress: () => void;
  testID?: string;
  /** How wide the pill may grow beside a long title, such as "Save to Push A". */
  maxWidth?: DimensionValue;
}

/** The accent pill at the end of a sheet's header that closes it: "Save for today", "Done". */
export function HeaderPillButton({ label, onPress, testID, maxWidth }: HeaderPillButtonProps) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', flexShrink: 0, maxWidth }}
    >
      {({ pressed }) => (
        <View
          // See ActionButton: a fill whose opacity changes on a press that also leaves the screen makes
          // Android throw "View already has a parent" unless it stays a container.
          collapsable={false}
          style={{
            minHeight: 36,
            borderRadius: 18,
            paddingHorizontal: spacing[4],
            justifyContent: 'center',
            backgroundColor: tokens.accent,
            opacity: pressed ? 0.85 : 1,
          }}
        >
          <SurfaceText font="text-base" weight="600" numberOfLines={1} style={{ color: tokens.onAccent }}>
            {label}
          </SurfaceText>
        </View>
      )}
    </Pressable>
  );
}

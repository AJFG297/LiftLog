import { haptics } from '@/components/presentation/foundation/haptics';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { hitSlopFor } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, StyleProp, ViewStyle } from 'react-native';

const CHIP_SIZE = 36;

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Sets a label that is only a number ("7.5", "1:30") in Geist Mono. */
  numeric?: boolean;
  /** Read out instead of `label`, e.g. "RPE 8" for a chip showing "8". */
  accessibilityLabel?: string;
  /** Pass `{ flexGrow: 1 }` to share a row's width between chips. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A toggle for filters, rest presets and RPE. Screen readers hear it as a toggle button that is on or off.
 * At least 36pt square on screen, so eight RPE values fit a phone's width, with a 44pt hit area.
 */
export function Chip({ label, selected, onPress, numeric, accessibilityLabel, style, testID }: ChipProps) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      hitSlop={hitSlopFor({ width: CHIP_SIZE, height: CHIP_SIZE })}
      accessibilityRole="togglebutton"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        {
          minHeight: CHIP_SIZE,
          minWidth: CHIP_SIZE,
          paddingHorizontal: spacing[3],
          borderRadius: CHIP_SIZE / 2,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? tokens.accent : pressed ? tokens.track : tokens.card,
          borderColor: selected ? tokens.accent : tokens.line,
        },
        style,
      ]}
    >
      <SurfaceText
        font="text-sm"
        numeric={numeric}
        weight="600"
        numberOfLines={1}
        style={{ color: selected ? tokens.onAccent : tokens.ink }}
      >
        {label}
      </SurfaceText>
    </Pressable>
  );
}

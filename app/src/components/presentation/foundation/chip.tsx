import { haptics } from '@/components/presentation/foundation/haptics';
import Icon from '@/components/presentation/foundation/icon';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';

const CHIP_SIZE = 36;
const TARGET_INSET = (MIN_TOUCH_TARGET - CHIP_SIZE) / 2;

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Sets a label that is only a number ("7.5", "1:30") in Geist Mono. */
  numeric?: boolean;
  /** Draws a dropdown arrow after the label, for a chip that opens a menu rather than toggling. */
  dropdown?: boolean;
  /** Read out instead of `label`, e.g. "RPE 8" for a chip showing "8". */
  accessibilityLabel?: string;
  /** Places the chip's touch target in its row. Pass `{ flexGrow: 1 }` to share a row's width between chips. */
  style?: StyleProp<ViewStyle>;
  /** Styles the drawn chip, e.g. `{ paddingHorizontal: 0 }` so eight RPE values fit one row. */
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A toggle for filters, rest presets and RPE. Screen readers hear it as a toggle button that is on or off.
 * With `dropdown`, it opens a menu instead: an arrow follows the label and it reads as a plain button, filled
 * when the menu has a choice.
 * At least 36pt square on screen, so eight RPE values fit a phone's width. The touch target is the drawn chip
 * plus a 4pt inset all round, so it is at least 44pt on each axis.
 */
export function Chip({
  label,
  selected,
  onPress,
  numeric,
  dropdown,
  accessibilityLabel,
  style,
  contentStyle,
  testID,
}: ChipProps) {
  const { tokens } = useAppTheme();
  const labelColor = selected ? tokens.onAccent : tokens.ink;
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole={dropdown ? 'button' : 'togglebutton'}
      accessibilityState={dropdown ? undefined : { checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[{ padding: TARGET_INSET }, style]}
    >
      {({ pressed }) => (
        <View
          style={[
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
            dropdown && { flexDirection: 'row', gap: spacing[0.5] },
            contentStyle,
          ]}
        >
          <SurfaceText font="text-sm" numeric={numeric} weight="600" numberOfLines={1} style={{ color: labelColor }}>
            {label}
          </SurfaceText>
          {dropdown && <Icon source="menu-down" size={20} color={labelColor} />}
        </View>
      )}
    </Pressable>
  );
}

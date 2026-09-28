import { haptics } from '@/components/presentation/foundation/haptics';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { hitSlopFor, MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';

const SEGMENT_HEIGHT = 36;

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

type Options<T extends string> =
  | readonly [SegmentedOption<T>, SegmentedOption<T>]
  | readonly [SegmentedOption<T>, SegmentedOption<T>, SegmentedOption<T>]
  | readonly [SegmentedOption<T>, SegmentedOption<T>, SegmentedOption<T>, SegmentedOption<T>];

interface SegmentedControlProps<T extends string> {
  options: Options<T>;
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers, e.g. "History range". */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Two to four mutually exclusive options that share one row, e.g. "Last 7 days / Last 30 days". Screen
 * readers hear a radio group.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
  testID,
}: SegmentedControlProps<T>) {
  const { tokens } = useAppTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flexDirection: 'row',
          gap: spacing[1],
          padding: spacing[1],
          borderRadius: 12,
          backgroundColor: tokens.segment,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={testID && `${testID}-${option.value}`}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(option.value);
            }}
            hitSlop={hitSlopFor({ width: MIN_TOUCH_TARGET, height: SEGMENT_HEIGHT })}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.label}
            style={{
              flex: 1,
              minHeight: SEGMENT_HEIGHT,
              paddingHorizontal: spacing[2],
              borderRadius: 9,
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? tokens.card : 'transparent',
              borderColor: selected ? tokens.line2 : 'transparent',
            }}
          >
            <SurfaceText
              font="text-sm"
              weight="600"
              numberOfLines={1}
              style={{ color: selected ? tokens.ink : tokens.muted }}
            >
              {option.label}
            </SurfaceText>
          </Pressable>
        );
      })}
    </View>
  );
}

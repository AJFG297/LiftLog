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

/** Two to four values, in order: what a list of options is built from. */
export type SegmentedValues<T extends string> = readonly [T, T] | readonly [T, T, T] | readonly [T, T, T, T];

/**
 * `values` as options, each labelled by `label`, for a list of values worked out at run time. `map` would lose
 * the count the control needs; this keeps it.
 */
export function segmentedOptions<T extends string>(
  values: SegmentedValues<T>,
  label: (value: T) => string,
): Options<T> {
  const option = (value: T): SegmentedOption<T> => ({ value, label: label(value) });
  switch (values.length) {
    case 2:
      return [option(values[0]), option(values[1])];
    case 3:
      return [option(values[0]), option(values[1]), option(values[2])];
    case 4:
      return [option(values[0]), option(values[1]), option(values[2]), option(values[3])];
  }
}

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
 * Two to four mutually exclusive options that share one row, e.g. "Last 7 days / Last 30 days". Each
 * segment is as wide as its label plus an equal share of the spare room. Screen readers hear a radio group.
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
            // Segments start from their label's width and share what is left, so a long label gets the
            // room it needs; one that still doesn't fit wraps rather than being cut off.
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 'auto',
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
              numberOfLines={2}
              style={{ color: selected ? tokens.ink : tokens.muted, textAlign: 'center' }}
            >
              {option.label}
            </SurfaceText>
          </Pressable>
        );
      })}
    </View>
  );
}

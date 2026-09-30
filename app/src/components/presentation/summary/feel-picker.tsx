import { haptics } from '@/components/presentation/foundation/haptics';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, View } from 'react-native';

interface FeelPickerProps<T extends string> {
  options: readonly { value: T; label: string }[];
  selected: T | undefined;
  /** Called with the option tapped; tapping the selected one again is how it is cleared. */
  onPick: (value: T) => void;
}

/** "How did it feel?": one row of equal buttons, the pick filled with ink. */
export function FeelPicker<T extends string>({ options, selected, onPick }: FeelPickerProps<T>) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing[2] }}>
      {options.map(({ value, label }) => {
        const on = value === selected;
        return (
          <Pressable
            key={value}
            testID={`summary-feel-${value}`}
            onPress={() => {
              haptics.selection();
              onPick(value);
            }}
            accessibilityRole="togglebutton"
            accessibilityState={{ checked: on }}
            accessibilityLabel={label}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: MIN_TOUCH_TARGET,
              paddingHorizontal: spacing[1],
              borderRadius: 12,
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? tokens.ink : pressed ? tokens.track : tokens.card,
              borderColor: on ? tokens.ink : tokens.line,
            })}
          >
            <SurfaceText
              font="text-sm"
              weight="600"
              style={{ color: on ? tokens.bg : tokens.ink, textAlign: 'center' }}
            >
              {label}
            </SurfaceText>
          </Pressable>
        );
      })}
    </View>
  );
}

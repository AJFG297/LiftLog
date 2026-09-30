import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { useAppTheme } from '@/hooks/useAppTheme';
import { ROUTINE_COLOR_HEX, ROUTINE_COLORS, type RoutineColor, routineColorOf } from '@/models/routine-color';
import { Pressable, View } from 'react-native';

const SWATCH_SIZE = 32;

interface RoutineColorSwatchesProps {
  value: RoutineColor;
  onChange: (color: RoutineColor) => void;
  label: string;
  colorLabel: (color: RoutineColor) => string;
}

/** The small square that marks a routine's colour beside its name in a list. */
export function RoutineColorDot({ color, index }: { color: RoutineColor | undefined; index: number }) {
  return (
    <View
      testID="routine-color-dot"
      style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: ROUTINE_COLOR_HEX[routineColorOf(color, index)] }}
    />
  );
}

/** A row of the routine colours, one picked, drawn as dots in 44pt targets. */
export function RoutineColorSwatches({ value, onChange, label, colorLabel }: RoutineColorSwatchesProps) {
  const { tokens } = useAppTheme();
  return (
    <View
      testID="routine-color"
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      // Pulled out by the targets' padding so the first dot lines up with the name above it.
      style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -(MIN_TOUCH_TARGET - SWATCH_SIZE) / 2 }}
    >
      {ROUTINE_COLORS.map((color) => {
        const selected = color === value;
        return (
          <Pressable
            key={color}
            testID={`routine-color-${color}`}
            onPress={() => onChange(color)}
            accessibilityRole="radio"
            accessibilityLabel={colorLabel(color)}
            accessibilityState={{ checked: selected }}
            style={{
              width: MIN_TOUCH_TARGET,
              height: MIN_TOUCH_TARGET,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: SWATCH_SIZE,
                height: SWATCH_SIZE,
                borderRadius: SWATCH_SIZE / 2,
                backgroundColor: ROUTINE_COLOR_HEX[color],
                borderWidth: 3,
                borderColor: selected ? tokens.ink : tokens.card,
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

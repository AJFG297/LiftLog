import { rounding, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { Pressable } from 'react-native';

export function RpeChip(props: { label: string; selected: boolean; onPress: () => void }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      hitSlop={{ top: spacing[1], bottom: spacing[1] }}
      style={({ pressed }) => ({
        minWidth: spacing[11],
        height: spacing[9],
        paddingHorizontal: spacing[2],
        borderRadius: rounding.roundedRectangleRadius,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: props.selected ? tokens.accent : tokens.keypadKey,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <SurfaceText numeric font="text-sm" style={{ color: props.selected ? tokens.onAccent : tokens.ink }}>
        {props.label}
      </SurfaceText>
    </Pressable>
  );
}

import { type AppIconName, MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, View } from 'react-native';

export interface RoutineExerciseAction {
  key: string;
  icon: AppIconName;
  label: string;
  /** Undefined greys the action out, as Move up does on the first exercise. */
  onPress: (() => void) | undefined;
  destructive?: boolean;
}

/** The row at the foot of an expanded exercise card: Move up, Move down, Superset or Unlink, Remove. */
export function RoutineExerciseActions({ actions, name }: { actions: RoutineExerciseAction[]; name: string }) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: tokens.track, paddingTop: spacing[1] }}>
      {actions.map((action) => {
        const color = !action.onPress ? tokens.line3 : action.destructive ? tokens.danger : tokens.ink;
        return (
          <Pressable
            key={action.key}
            testID={`routine-exercise-${action.key}`}
            onPress={action.onPress}
            disabled={!action.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${action.label}, ${name}`}
            accessibilityState={{ disabled: !action.onPress }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: MIN_TOUCH_TARGET + spacing[2],
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing[0.5],
              borderRadius: 12,
              backgroundColor: pressed ? tokens.track : undefined,
            })}
          >
            <MsIconSrc name={action.icon} size={20} color={color} />
            <SurfaceText font="text-xs" weight="600" numberOfLines={1} style={{ color }}>
              {action.label}
            </SurfaceText>
          </Pressable>
        );
      })}
    </View>
  );
}

import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { routineRestRowOf } from '@/components/presentation/workout-editor/rest-edit';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Rest } from '@/models/blueprint-models';
import { useTranslate } from '@tolgee/react';
import { Pressable, View } from 'react-native';

interface RoutineRestRowProps {
  rest: Rest;
  /** Opens the rest sheet, the same one the edit exercise sheet's Rest row opens. */
  onPress: () => void;
}

/** Rest between sets on a routine editor card (plan decision D5): the rest, with the failed-set rest when it differs. */
export function RoutineRestRow({ rest, onPress }: RoutineRestRowProps) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const row = routineRestRowOf(t, rest);
  return (
    <Pressable
      testID="routine-exercise-rest"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={row.accessibilityLabel}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        paddingVertical: spacing[2],
        paddingHorizontal: spacing[3],
        borderRadius: 12,
        backgroundColor: pressed ? tokens.track : tokens.bg,
      })}
    >
      <SurfaceText font="text-sm" weight="600" style={{ flex: 1, color: tokens.ink }}>
        {t('routine_editor.rest.title')}
      </SurfaceText>
      <View style={{ alignItems: 'flex-end', gap: spacing[0.5] }}>
        <SurfaceText numeric font="text-base" weight="600" style={{ color: tokens.ink }}>
          {row.value}
        </SurfaceText>
        {row.note ? (
          <SurfaceText font="text-xs" style={{ color: tokens.muted }}>
            {row.note}
          </SurfaceText>
        ) : null}
      </View>
      <MsIconSrc name="chevronRight" size={20} color={tokens.muted} />
    </Pressable>
  );
}

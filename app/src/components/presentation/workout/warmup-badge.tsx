import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useTranslate } from '@tolgee/react';
import { StyleProp, View, ViewStyle } from 'react-native';

const sizes = {
  default: { diameter: spacing[7], font: 'text-sm' },
  small: { diameter: spacing[4], font: 'text-2xs' },
} as const;

/**
 * The W that marks a warm-up set, the same in the exercise editor as on the workout screen so a
 * planned warm-up is recognisable when it turns up mid-workout.
 */
export function WarmupBadge({ size = 'default', style }: { size?: keyof typeof sizes; style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslate();
  const { colors } = useAppTheme();
  const { diameter, font: textFont } = sizes[size];
  return (
    <View
      pointerEvents="none"
      style={[
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.secondaryContainer,
        },
        style,
      ]}
    >
      <SurfaceText font={textFont} weight="bold" color="onSecondaryContainer">
        {t('workout.warmup_set.badge.label')}
      </SurfaceText>
    </View>
  );
}

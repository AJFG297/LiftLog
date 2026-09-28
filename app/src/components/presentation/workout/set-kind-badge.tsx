import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { LetteredSetKind, setLabel } from '@/models/session-models/set-kind';
import { StyleProp, View, ViewStyle } from 'react-native';

const sizes = {
  default: { diameter: spacing[7], font: 'text-sm' },
  small: { diameter: spacing[4], font: 'text-2xs' },
} as const;

/**
 * The letter that stands in for a set's number when it is not a working set: W, D, M or F. The same in
 * the exercise editor as on the workout screen, so a planned warm-up is recognisable mid-workout.
 */
export function SetKindBadge({
  kind,
  size = 'default',
  style,
}: {
  kind: LetteredSetKind;
  size?: keyof typeof sizes;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, tokens } = useAppTheme();
  const { diameter, font: textFont } = sizes[size];
  const isFailure = kind === 'failure';
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
          backgroundColor: isFailure ? tokens.failure : colors.secondaryContainer,
        },
        style,
      ]}
    >
      <SurfaceText
        font={textFont}
        weight="bold"
        color="onSecondaryContainer"
        style={isFailure ? { color: tokens.onFailure } : undefined}
      >
        {setLabel(kind)}
      </SurfaceText>
    </View>
  );
}

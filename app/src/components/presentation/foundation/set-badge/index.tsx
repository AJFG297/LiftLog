import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import {
  SET_BADGE_LOOK,
  setBadgeText,
  type SetBadgeProps,
} from '@/components/presentation/foundation/set-badge/set-badge-kinds';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useTranslate } from '@tolgee/react';
import { StyleProp, View, ViewStyle } from 'react-native';

export type { SetBadgeProps } from '@/components/presentation/foundation/set-badge/set-badge-kinds';

const sizes = {
  default: { diameter: 36, font: 'text-sm', ring: 2 },
  /** Tucked into the corner of a reps tile on the workout screen. */
  small: { diameter: 16, font: 'text-2xs', ring: 1 },
} as const;

export type SetBadgeSize = keyof typeof sizes;

/**
 * The circle at the start of a set row: the working set's number, or W, D, M or F. Not pressable itself;
 * a set row that opens the set-type sheet wraps it and gives the 44pt target.
 */
export function SetBadge(props: SetBadgeProps & { size?: SetBadgeSize; style?: StyleProp<ViewStyle> }) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const look = SET_BADGE_LOOK[props.kind];
  const size = sizes[props.size ?? 'default'];
  const { text, accessibilityLabel } = setBadgeText(props, t);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      pointerEvents="none"
      style={[
        {
          width: size.diameter,
          height: size.diameter,
          borderRadius: size.diameter / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tokens[look.fill],
          borderWidth: look.ring ? size.ring : 0,
          borderColor: look.ring ? tokens[look.ring] : undefined,
        },
        props.style,
      ]}
    >
      <SurfaceText
        font={size.font}
        weight="700"
        numeric={props.kind === 'working'}
        maxFontSizeMultiplier={1.5}
        style={{ color: tokens[look.ink] }}
      >
        {text}
      </SurfaceText>
    </View>
  );
}

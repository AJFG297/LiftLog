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

const DIAMETER = 36;

/**
 * The circle at the start of a set row: the working set's number, or W, D, M or F. Not pressable itself;
 * a set row that opens the set-type sheet wraps it and gives the 44pt target.
 */
export function SetBadge(props: SetBadgeProps & { style?: StyleProp<ViewStyle> }) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const look = SET_BADGE_LOOK[props.kind];
  const { text, accessibilityLabel } = setBadgeText(props, t);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: DIAMETER,
          height: DIAMETER,
          borderRadius: DIAMETER / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tokens[look.fill],
          borderWidth: look.ring ? 2 : 0,
          borderColor: look.ring ? tokens[look.ring] : undefined,
        },
        props.style,
      ]}
    >
      <SurfaceText
        font="text-sm"
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

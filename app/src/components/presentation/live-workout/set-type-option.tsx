import { SetBadge, type SetBadgeProps } from '@/components/presentation/foundation/set-badge';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, View } from 'react-native';

const RADIO_SIZE = 22;

interface SetTypeOptionProps {
  /** Left out for a choice that is not a set type, such as the Load sheet's. */
  badge?: SetBadgeProps;
  name: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

/** One choice on a pick-one sheet (set type, load): an optional set badge, the choice and what it is for, and a radio. */
export function SetTypeOption(props: SetTypeOptionProps) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected, disabled: !!props.disabled }}
      accessibilityLabel={`${props.name}. ${props.description}`}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        paddingVertical: spacing[3],
        paddingHorizontal: spacing[3],
        borderRadius: 14,
        borderWidth: props.selected ? 1.5 : 1,
        borderColor: props.selected ? tokens.accentInk : tokens.line,
        backgroundColor: props.selected ? tokens.wash : pressed ? tokens.track : tokens.card,
        opacity: props.disabled ? 0.5 : 1,
      })}
    >
      {props.badge ? <SetBadge {...props.badge} /> : null}
      <View style={{ flex: 1, gap: spacing[0.5] }}>
        <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
          {props.name}
        </SurfaceText>
        <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
          {props.description}
        </SurfaceText>
      </View>
      <View
        style={{
          width: RADIO_SIZE,
          height: RADIO_SIZE,
          borderRadius: RADIO_SIZE / 2,
          borderWidth: 2,
          borderColor: props.selected ? tokens.accentInk : tokens.line3,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {props.selected ? (
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.accent }} />
        ) : null}
      </View>
    </Pressable>
  );
}

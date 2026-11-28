import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { Switch } from '@/components/presentation/foundation/switch';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

interface ListSwitchProps {
  headline: ReactNode;
  supportingText?: ReactNode;
  value: boolean;
  focus?: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
  left?: ReactNode;
  disabled?: boolean;
}

/** A row that toggles its switch when tapped anywhere. */
export default function ListSwitch(props: ListSwitchProps) {
  const { colors, tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      onPress={() => props.onValueChange(!props.value)}
      disabled={props.disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: props.value, disabled: !!props.disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        minHeight: spacing[14],
        paddingVertical: spacing[2],
        paddingHorizontal: spacing[4],
        backgroundColor: pressed ? tokens.track : props.focus ? colors.tertiary + '33' : undefined,
      })}
    >
      {props.left}
      <View style={{ flex: 1, gap: spacing[0.5] }}>
        <SurfaceText font="text-base" style={{ color: props.disabled ? tokens.muted : tokens.ink }}>
          {props.headline}
        </SurfaceText>
        {props.supportingText ? (
          <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
            {props.supportingText}
          </SurfaceText>
        ) : null}
      </View>
      <Switch value={props.value} disabled={props.disabled} onValueChange={props.onValueChange} />
    </Pressable>
  );
}

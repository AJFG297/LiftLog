import { PressableSurface, PressableSurfaceAction } from '@/components/presentation/foundation/pressable-surface';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

type ListRowProps = {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  /** Don't put a control here if the row has `onPress`. */
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
} & PressableSurfaceAction;

export function ListRow(props: ListRowProps) {
  const { tokens } = useAppTheme();
  return (
    <PressableSurface
      {...props}
      surface={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        minHeight: spacing[14],
        paddingVertical: spacing[2],
        paddingHorizontal: spacing[4],
      }}
    >
      {props.leading}
      <View style={{ flex: 1, gap: spacing[0.5] }}>
        <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink }}>
          {props.title}
        </SurfaceText>
        {props.subtitle ? (
          <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
            {props.subtitle}
          </SurfaceText>
        ) : null}
      </View>
      {props.trailing}
    </PressableSurface>
  );
}

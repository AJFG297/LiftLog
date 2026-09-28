import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';

type ListRowProps = {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  /** Don't put a control here if the row has `onPress`. */
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
} & (
  | { onPress?: undefined }
  | {
      onPress: () => void;
      /** Read out instead of the title and subtitle, when those don't say what a tap does. */
      accessibilityLabel?: string;
      accessibilityHint?: string;
    }
);

export function ListRow(props: ListRowProps) {
  const { tokens } = useAppTheme();
  const row: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: spacing[14],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  };
  const content = (
    <>
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
    </>
  );

  if (!props.onPress) {
    return (
      <View testID={props.testID} style={[row, props.style]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityHint}
      style={({ pressed }) => [row, pressed && { backgroundColor: tokens.track }, props.style]}
    >
      {content}
    </Pressable>
  );
}

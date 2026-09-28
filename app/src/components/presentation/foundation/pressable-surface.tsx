import { useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';

/** Without `onPress` a surface is a plain view; with it, the whole surface is one button. */
export type PressableSurfaceAction =
  | { onPress?: undefined }
  | {
      onPress: () => void;
      /** Read out instead of the surface's text, when that text alone doesn't say what a tap does. */
      accessibilityLabel?: string;
      accessibilityHint?: string;
    };

type PressableSurfaceProps = PressableSurfaceAction & {
  /** The component's own look. The pressed background goes over it, and `style` over both. */
  surface: ViewStyle;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
};

/** The shared body of `Card` and `ListRow`. */
export function PressableSurface(props: PressableSurfaceProps) {
  const { tokens } = useAppTheme();

  if (!props.onPress) {
    return (
      <View testID={props.testID} style={[props.surface, props.style]}>
        {props.children}
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
      style={({ pressed }) => [props.surface, pressed && { backgroundColor: tokens.track }, props.style]}
    >
      {props.children}
    </Pressable>
  );
}

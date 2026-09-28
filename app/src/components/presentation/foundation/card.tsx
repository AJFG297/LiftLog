import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';

const CARD_RADIUS = 18;

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
} & (
  | { onPress?: undefined }
  | {
      onPress: () => void;
      /** Read out instead of the card's text, when that text alone doesn't say what a tap does. */
      accessibilityLabel?: string;
      accessibilityHint?: string;
    }
);

/** Pass `onPress` to make the whole card a single button. */
export function Card(props: CardProps) {
  const { tokens } = useAppTheme();
  const surface: ViewStyle = {
    backgroundColor: tokens.card,
    borderColor: tokens.line,
    borderWidth: 1,
    borderRadius: CARD_RADIUS,
    padding: spacing[4],
  };

  if (!props.onPress) {
    return (
      <View testID={props.testID} style={[surface, props.style]}>
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
      style={({ pressed }) => [surface, pressed && { backgroundColor: tokens.track }, props.style]}
    >
      {props.children}
    </Pressable>
  );
}

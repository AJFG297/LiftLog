import { PressableSurface, PressableSurfaceAction } from '@/components/presentation/foundation/pressable-surface';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

const CARD_RADIUS = 18;

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
} & PressableSurfaceAction;

/** Pass `onPress` to make the whole card a single button. */
export function Card(props: CardProps) {
  const { tokens } = useAppTheme();
  return (
    <PressableSurface
      {...props}
      surface={{
        backgroundColor: tokens.card,
        borderColor: tokens.line,
        borderWidth: 1,
        borderRadius: CARD_RADIUS,
        padding: spacing[4],
      }}
    />
  );
}

import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { fontFamily } from '@/hooks/useAppTheme';
import { StyleProp, Text, TextProps, TextStyle } from 'react-native';

interface AmountTextProps extends Omit<TextProps, 'children'> {
  /** The number as shown: "104.5", "+2.5". A word in its place ("same") is Geist, so use `SurfaceText`. */
  amount: string;
  /** "kg", "reps". Left out for a number alone. */
  unit?: string;
  /** How the unit differs from the number (size, weight, colour); it is always Geist. */
  unitStyle?: StyleProp<TextStyle>;
}

/** A number in Geist Mono with its unit after it in Geist: "104.5 kg". `style` sets both. */
export function AmountText({ amount, unit, unitStyle, ...rest }: AmountTextProps) {
  return (
    <SurfaceText numeric {...rest}>
      {amount}
      {unit ? <Text style={[{ fontFamily: fontFamily.text }, unitStyle]}>{` ${unit}`}</Text> : null}
    </SurfaceText>
  );
}

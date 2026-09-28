import { ColorChoice, font, FontChoice, fontFamily, useAppTheme } from '@/hooks/useAppTheme';
import { Text, TextProps, TextStyle } from 'react-native';

interface SurfaceTextProps extends TextProps {
  color?: ColorChoice;
  font?: FontChoice;
  weight?: TextStyle['fontWeight'];
  /**
   * Sets text that is only a number in Geist Mono, so changing values keep their width. For numbers with
   * letters in them, keep Geist and pass `tabularText` as the style.
   */
  numeric?: boolean;
}

export function SurfaceText(props: SurfaceTextProps) {
  const { colors } = useAppTheme();
  const { style, weight, numeric, ...rest } = props;
  const fontChoice = props.font ?? 'text-base';
  return (
    <Text
      {...rest}
      style={[
        {
          color: colors[props.color ?? 'onSurface'],
          fontFamily: numeric ? fontFamily.number : fontFamily.text,
          fontWeight: weight,
        },
        font[fontChoice],
        style,
      ]}
    />
  );
}

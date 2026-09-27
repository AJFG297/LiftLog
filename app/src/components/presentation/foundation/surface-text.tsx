import { ColorChoice, font, FontChoice, numberStyle, useAppTheme } from '@/hooks/useAppTheme';
import { Text, TextProps, TextStyle } from 'react-native';

interface SurfaceTextProps extends TextProps {
  color?: ColorChoice;
  font?: FontChoice;
  weight?: TextStyle['fontWeight'];
  /** Sets the text in the number family (Geist Mono) so changing values keep their width. */
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
        { color: colors[props.color ?? 'onSurface'], fontWeight: weight },
        font[fontChoice],
        numeric && numberStyle,
        style,
      ]}
    />
  );
}

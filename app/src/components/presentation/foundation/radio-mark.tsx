import { useAppTheme } from '@/hooks/useAppTheme';
import { StyleProp, View, ViewStyle } from 'react-native';

const SIZE = 22;

/** The ring at the side of a pick-one card, filled with a dot when it is the one picked. */
export function RadioMark(props: {
  selected: boolean;
  /** The picked ring and its dot. */
  color: string;
  /** The dot, when it differs from the ring. */
  dotColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens } = useAppTheme();
  return (
    <View
      style={[
        {
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          borderWidth: 2,
          borderColor: props.selected ? props.color : tokens.line3,
          alignItems: 'center',
          justifyContent: 'center',
        },
        props.style,
      ]}
    >
      {props.selected ? (
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: props.dotColor ?? props.color }} />
      ) : null}
    </View>
  );
}

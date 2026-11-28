import { useAppTheme } from '@/hooks/useAppTheme';
import { StyleProp, View, ViewStyle } from 'react-native';

/** A hairline between items. */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { tokens } = useAppTheme();
  return <View style={[{ height: 1, backgroundColor: tokens.line }, style]} />;
}

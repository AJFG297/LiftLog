import { TextStyle } from 'react-native';
import { ColorChoice } from '@/hooks/useAppTheme';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';

interface ItemTitleProps {
  title: string;
  style?: TextStyle;
  testID?: string;
  color?: ColorChoice;
}

export default function ItemTitle({ title, style, testID, color = 'onSurface' }: ItemTitleProps) {
  return (
    <SurfaceText
      font="text-xl"
      weight="bold"
      color={color}
      style={[{ flexShrink: 1, minWidth: 0, textAlign: 'left' }, style]}
      testID={testID}
    >
      {title}
    </SurfaceText>
  );
}

import { AppIconSource, MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { useAppTheme } from '@/hooks/useAppTheme';
import { I18nManager, StyleProp, View, ViewStyle } from 'react-native';

interface IconProps {
  source: AppIconSource;
  size?: number;
  /** Defaults to `ink`. */
  color?: string;
  /** Flips the icon in right-to-left layouts, for arrows that point "forward". */
  mirrored?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export default function Icon({ source, size = 24, color, mirrored, style, testID }: IconProps) {
  const { tokens } = useAppTheme();
  const flip = mirrored && I18nManager.isRTL;
  return (
    <View
      testID={testID}
      style={[{ width: size, height: size }, flip && { transform: [{ scaleX: -1 }] }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {typeof source === 'function' ? source() : <MsIconSrc name={source} size={size} color={color ?? tokens.ink} />}
    </View>
  );
}

import { useAppTheme } from '@/hooks/useAppTheme';
import { sparklineGeometry } from '@/components/presentation/stats/geometry/sparkline-geometry';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

const STROKE_WIDTH = 1.8;
const END_DOT_RADIUS = 2.6;
// Room for the end dot and the stroke's round caps, so neither is clipped at the edges.
const INSET = 3;

interface SparklineProps {
  /** Oldest first. With none it draws nothing but still takes its size, so rows line up. */
  values: readonly number[];
  width: number;
  height: number;
  /** Defaults to `accentInk`. */
  color?: string;
  /** A dot on the latest value. Defaults to true. */
  endDot?: boolean;
}

/**
 * A small trend line. Decorative: it is hidden from screen readers, so the row it sits in must say the
 * numbers in text.
 */
export function Sparkline({ values, width, height, color, endDot = true }: SparklineProps) {
  const { tokens } = useAppTheme();
  const stroke = color ?? tokens.accentInk;
  const geometry = sparklineGeometry(values, width, height, INSET);
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height }}
    >
      {geometry && (
        <Svg width={width} height={height}>
          <Path
            d={geometry.path}
            stroke={stroke}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {endDot && <Circle cx={geometry.end.x} cy={geometry.end.y} r={END_DOT_RADIUS} fill={stroke} />}
        </Svg>
      )}
    </View>
  );
}

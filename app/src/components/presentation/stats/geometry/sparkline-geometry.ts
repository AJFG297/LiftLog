import { linePath } from '@/components/presentation/stats/geometry/line-path';

/** A sparkline's line as an SVG path, and where it ends (for the end dot). */
export interface SparklineGeometry {
  path: string;
  end: { x: number; y: number };
}

/**
 * Lays `values` out left to right across `width` by `height`, inset by `inset` on every side, scaled so the
 * lowest value sits at the bottom and the highest at the top. A flat series, a single value included, is a
 * level line through the middle. Undefined with no values: there is nothing to draw.
 */
export function sparklineGeometry(
  values: readonly number[],
  width: number,
  height: number,
  inset: number,
): SparklineGeometry | undefined {
  if (!values.length) {
    return undefined;
  }
  const lowest = Math.min(...values);
  const span = Math.max(...values) - lowest;
  const innerWidth = width - inset * 2;
  const innerHeight = height - inset * 2;
  const yOf = (value: number) => (span ? inset + innerHeight - ((value - lowest) / span) * innerHeight : height / 2);
  const points =
    values.length === 1
      ? [
          { x: inset, y: yOf(values[0]!) },
          { x: width - inset, y: yOf(values[0]!) },
        ]
      : values.map((value, index) => ({ x: inset + (index / (values.length - 1)) * innerWidth, y: yOf(value) }));
  return {
    path: linePath(points),
    end: points[points.length - 1]!,
  };
}

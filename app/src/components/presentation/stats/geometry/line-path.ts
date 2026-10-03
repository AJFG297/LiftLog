/** A line through `points` as an SVG path, to a tenth of a point: "M3.0 25.0 L32.0 3.0". */
export function linePath(points: readonly { x: number; y: number }[]): string {
  return points.map((p, index) => `${index ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

import { roundGridStep } from '@/components/presentation/stats/geometry/grid-step';
import { linePath } from '@/components/presentation/stats/geometry/line-path';

/** Room on the right for the grid labels, and below for the dates. */
const LABEL_WIDTH = 44;
const DATE_HEIGHT = 26;
const LEFT = 6;
const TOP = 14;
/** At most this many gaps between grid lines, so three or four labels. */
const MAX_GRID_GAPS = 3;
/** Round steps under 10, scaled by powers of ten for larger values. */
const GRID_STEP_MANTISSAS = [1, 2, 2.5, 5] as const;

export interface ExerciseChartGeometry {
  /** The line through every point; undefined for a single point, which is drawn alone. */
  path: string | undefined;
  /** One per value, left to right in order. */
  points: { x: number; y: number }[];
  grid: { y: number; value: number }[];
  /** Where the plot ends on the right; the grid labels sit past it. */
  right: number;
  /** Where the plot ends at the bottom; the dates sit under it. */
  bottom: number;
}

/**
 * Lays `values` out evenly left to right, one per workout, on a scale of round grid lines that takes in the
 * lowest and highest. A single value sits in the middle with no line. Undefined with no values.
 */
export function exerciseChartGeometry(
  values: readonly number[],
  width: number,
  height: number,
): ExerciseChartGeometry | undefined {
  if (!values.length) {
    return undefined;
  }
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  const step = gridStepFor(lowest, highest);
  const low = Math.floor(lowest / step) * step;
  const high = Math.max(low + step, Math.ceil(highest / step) * step);
  const right = width - LABEL_WIDTH;
  const bottom = height - DATE_HEIGHT;
  const yOf = (value: number) => bottom - ((value - low) / (high - low)) * (bottom - TOP);
  const xOf = (index: number) =>
    values.length === 1 ? (LEFT + right) / 2 : LEFT + (index / (values.length - 1)) * (right - LEFT);

  const grid: { y: number; value: number }[] = [];
  // Stepping by a count rather than adding the step keeps 2.5s from drifting.
  for (let n = 0; low + n * step <= high + step / 1e6; n++) {
    grid.push({ y: yOf(low + n * step), value: low + n * step });
  }
  const points = values.map((value, index) => ({ x: xOf(index), y: yOf(value) }));
  return { path: points.length > 1 ? linePath(points) : undefined, points, grid, right, bottom };
}

/**
 * The smallest round step (1, 2, 2.5 or 5 times a power of ten, at least 1) whose grid lines, from the one at or
 * below `lowest` to the one at or above `highest`, are at most {@link MAX_GRID_GAPS} apart.
 */
function gridStepFor(lowest: number, highest: number): number {
  return roundGridStep((step) => Math.ceil(highest / step) - Math.floor(lowest / step) <= MAX_GRID_GAPS, {
    mantissas: GRID_STEP_MANTISSAS,
    min: 1,
  });
}

/** The index of the point nearest `x` across: what a tap or a drag at `x` picks. */
export function nearestPointIndex(points: readonly { x: number }[], x: number): number {
  let nearest = 0;
  for (let index = 1; index < points.length; index++) {
    if (Math.abs(points[index]!.x - x) < Math.abs(points[nearest]!.x - x)) {
      nearest = index;
    }
  }
  return nearest;
}

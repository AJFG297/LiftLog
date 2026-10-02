import { LocalDate } from '@js-joda/core';
import type { BodyChartPoint } from '@/store/stats/progress-body';

/** Room on the right for the grid labels, and below for the dates. */
const LABEL_WIDTH = 42;
const DATE_HEIGHT = 26;
const LEFT = 4;
const TOP = 10;
const MAX_GRID_LINES = 5;
const GRID_STEPS = [0.5, 1, 2, 5, 10, 20, 50];

export interface BodyChartGeometry {
  path: string;
  /** The weigh-ins before the latest; the bodyweight carried into the range has none. */
  dots: { x: number; y: number }[];
  end: { x: number; y: number };
  grid: { y: number; value: number }[];
  /** Decimals for the grid labels. */
  gridDecimals: number;
  /** Where the line's area ends on the right; the grid labels sit past it. */
  right: number;
  /** The baseline the date labels sit under. */
  bottom: number;
}

/**
 * Lays the weigh-ins out by date across `from` to `to`, on a scale padded half a unit past the lowest and
 * highest, with at most {@link MAX_GRID_LINES} round grid lines. A single point is drawn as a level line to
 * `to`, as the bodyweight has held since.
 */
export function bodyChartGeometry(
  points: readonly BodyChartPoint[],
  from: LocalDate,
  to: LocalDate,
  width: number,
  height: number,
): BodyChartGeometry | undefined {
  const last = points.at(-1);
  if (!last) {
    return undefined;
  }
  const drawn = points.length === 1 ? [...points, { ...last, date: to, carried: true }] : points;
  const weights = drawn.map((point) => point.weight);
  const lowest = Math.floor(Math.min(...weights) * 2) / 2 - 0.5;
  const highest = Math.ceil(Math.max(...weights) * 2) / 2 + 0.5;
  const right = width - LABEL_WIDTH;
  const bottom = height - DATE_HEIGHT;
  const days = Math.max(1, to.toEpochDay() - from.toEpochDay());
  const xOf = (date: LocalDate) => LEFT + ((date.toEpochDay() - from.toEpochDay()) / days) * (right - LEFT);
  const yOf = (weight: number) => bottom - ((weight - lowest) / (highest - lowest)) * (bottom - TOP);

  const span = highest - lowest;
  const step = GRID_STEPS.find((candidate) => Math.floor(span / candidate) + 1 <= MAX_GRID_LINES) ?? 100;
  const grid: { y: number; value: number }[] = [];
  for (let value = Math.ceil(lowest / step) * step; value <= highest; value += step) {
    grid.push({ y: yOf(value), value });
  }

  const laid = drawn.map((point) => ({ x: xOf(point.date), y: yOf(point.weight), carried: point.carried }));
  const end = laid.at(-1)!;
  return {
    path: laid.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
    dots: laid
      .slice(0, -1)
      .filter((p) => !p.carried)
      .map(({ x, y }) => ({ x, y })),
    end: { x: end.x, y: end.y },
    grid,
    gridDecimals: step < 1 ? 1 : 0,
    right,
    bottom,
  };
}

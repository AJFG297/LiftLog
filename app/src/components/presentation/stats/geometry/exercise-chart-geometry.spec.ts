import { describe, expect, it } from 'vitest';
import {
  exerciseChartGeometry,
  nearestPointIndex,
} from '@/components/presentation/stats/geometry/exercise-chart-geometry';

const WIDTH = 326;
const HEIGHT = 172;

describe('exerciseChartGeometry', () => {
  it('spreads the points evenly across the plot, left of the grid labels', () => {
    const geometry = exerciseChartGeometry([70, 72, 74, 76], WIDTH, HEIGHT)!;

    expect(geometry.points.map((p) => Math.round(p.x))).toEqual([6, 98, 190, 282]);
    expect(geometry.right).toBe(282);
  });

  it('puts round grid lines around the values, at most three gaps apart', () => {
    const geometry = exerciseChartGeometry([71, 76.5], WIDTH, HEIGHT)!;

    expect(geometry.grid.map((g) => g.value)).toEqual([70, 72.5, 75, 77.5]);
    // The lowest line is the plot's bottom, the highest its top.
    expect(geometry.grid[0]!.y).toBe(geometry.bottom);
    expect(geometry.grid.at(-1)!.y).toBe(14);
  });

  it('scales up to large volumes', () => {
    expect(exerciseChartGeometry([3200, 4410], WIDTH, HEIGHT)!.grid.map((g) => g.value)).toEqual([
      3000, 3500, 4000, 4500,
    ]);
    expect(exerciseChartGeometry([10000, 60000], WIDTH, HEIGHT)!.grid.map((g) => g.value)).toEqual([
      0, 20000, 40000, 60000,
    ]);
  });

  it('gives a flat series a band of one step', () => {
    expect(exerciseChartGeometry([80, 80], WIDTH, HEIGHT)!.grid.map((g) => g.value)).toEqual([80, 81]);
  });

  it('draws a single point in the middle, with no line', () => {
    const geometry = exerciseChartGeometry([100], WIDTH, HEIGHT)!;

    expect(geometry.path).toBeUndefined();
    expect(geometry.points).toEqual([{ x: 144, y: expect.any(Number) as number }]);
  });

  it('draws nothing with no values', () => {
    expect(exerciseChartGeometry([], WIDTH, HEIGHT)).toBeUndefined();
  });
});

describe('nearestPointIndex', () => {
  it('picks the point nearest across, the earlier on a tie', () => {
    const points = [{ x: 0 }, { x: 10 }, { x: 20 }];

    expect(nearestPointIndex(points, -5)).toBe(0);
    expect(nearestPointIndex(points, 5)).toBe(0);
    expect(nearestPointIndex(points, 6)).toBe(1);
    expect(nearestPointIndex(points, 99)).toBe(2);
  });
});

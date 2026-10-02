import { describe, expect, it } from 'vitest';
import { LocalDate } from '@js-joda/core';
import { bodyChartGeometry } from './body-chart-geometry';

const day = (n: number) => LocalDate.of(2026, 9, n);

describe('bodyChartGeometry', () => {
  it('pads the scale half a unit past the lowest and highest, with round grid lines', () => {
    const geometry = bodyChartGeometry(
      [
        { date: day(1), weight: 79, carried: true },
        { date: day(15), weight: 78.4, carried: false },
        { date: day(29), weight: 78.8, carried: false },
      ],
      day(1),
      day(29),
      326,
      150,
    )!;

    // 77.5 to 79.5: a line each half kilogram.
    expect(geometry.grid.map((line) => line.value)).toEqual([77.5, 78, 78.5, 79, 79.5]);
    expect(geometry.gridDecimals).toBe(1);
    // The carried-in start has no dot, and the latest has the end dot instead.
    expect(geometry.dots).toHaveLength(1);
    expect(geometry.dots[0]!.x).toBe(144);
    expect(geometry.dots[0]!.y).toBeCloseTo(72.7, 6);
    expect(geometry.end.x).toBe(284);
    expect(geometry.end.y).toBeCloseTo(49.9, 6);
  });

  it('keeps to a few grid lines over a wide spread', () => {
    const geometry = bodyChartGeometry(
      [
        { date: day(1), weight: 170, carried: false },
        { date: day(29), weight: 182, carried: false },
      ],
      day(1),
      day(29),
      326,
      150,
    )!;

    expect(geometry.grid.map((line) => line.value)).toEqual([170, 175, 180]);
  });

  it('draws a single weigh-in as a level line to the end', () => {
    const geometry = bodyChartGeometry([{ date: day(15), weight: 80, carried: false }], day(1), day(29), 326, 150)!;

    expect(geometry.path).toBe('M144.0 67.0 L284.0 67.0');
    expect(geometry.dots).toEqual([{ x: 144, y: 67 }]);
  });
});

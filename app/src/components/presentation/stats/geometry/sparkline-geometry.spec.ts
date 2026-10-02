import { describe, expect, it } from 'vitest';
import { sparklineGeometry } from '@/components/presentation/stats/geometry/sparkline-geometry';

describe('sparklineGeometry', () => {
  it('spreads the values across the width, lowest at the bottom and highest at the top', () => {
    expect(sparklineGeometry([100, 110, 105], 64, 28, 3)).toEqual({
      path: 'M3.0 25.0 L32.0 3.0 L61.0 14.0',
      end: { x: 61, y: 14 },
    });
  });

  it('draws a flat series, and a single value, as a level line through the middle', () => {
    expect(sparklineGeometry([80, 80], 64, 28, 3)?.path).toBe('M3.0 14.0 L61.0 14.0');
    expect(sparklineGeometry([80], 64, 28, 3)).toEqual({ path: 'M3.0 14.0 L61.0 14.0', end: { x: 61, y: 14 } });
  });

  it('has nothing to draw with no values', () => {
    expect(sparklineGeometry([], 64, 28, 3)).toBeUndefined();
  });
});

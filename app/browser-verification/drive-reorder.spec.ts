import { describe, expect, it } from 'vitest';
import { assertEdgeScrollProgress } from './drive-reorder.mjs';

describe('stationary edge scrolling', () => {
  it.each([
    ['left', 300, [172, 0, 0]],
    ['right', 700, [828, 1000, 1000]],
    ['left', 172, [0, 0, 0]],
    ['right', 828, [1000, 1000, 1000]],
    ['left', 500, [500, 300, 100]],
    ['right', 500, [500, 700, 900]],
  ] as const)('accepts movement toward the %s edge, including boundary saturation', (edge, baseline, samples) => {
    expect(() => assertEdgeScrollProgress(edge, baseline, [...samples], 1000)).not.toThrow();
  });

  it.each([
    ['left', 500, [500, 500, 500]],
    ['right', 500, [500, 500, 500]],
    ['left', 500, [450, 450, 450]],
    ['right', 500, [550, 550, 550]],
    ['left', 0, [0, 0, 0]],
    ['right', 1000, [1000, 1000, 1000]],
    ['left', 500, [450, 400, 410]],
    ['right', 500, [550, 600, 590]],
    ['left', 500, [550, 400, 300]],
    ['right', 500, [450, 600, 700]],
  ] as const)('rejects a stalled or reversing observation toward the %s edge', (edge, baseline, samples) => {
    expect(() => assertEdgeScrollProgress(edge, baseline, [...samples], 1000)).toThrow();
  });
});

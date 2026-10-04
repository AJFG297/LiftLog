import { describe, expect, it } from 'vitest';
import { roundGridStep } from '@/components/presentation/stats/geometry/grid-step';

describe('roundGridStep', () => {
  it('takes the smallest round step that fits, scaling the mantissas by powers of ten', () => {
    const steps: number[] = [];
    roundGridStep(
      (step) => {
        steps.push(step);
        return step >= 300;
      },
      { mantissas: [1, 2, 5], min: 0.5 },
    );

    expect(steps).toEqual([0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]);
  });

  it('never goes under the minimum', () => {
    expect(roundGridStep(() => true, { mantissas: [1, 2, 2.5, 5], min: 1 })).toBe(1);
    expect(roundGridStep(() => true, { mantissas: [1, 2, 5], min: 0.5 })).toBe(0.5);
  });

  it('includes 2.5 when the mantissas do', () => {
    expect(roundGridStep((step) => step >= 21, { mantissas: [1, 2, 2.5, 5], min: 1 })).toBe(25);
  });
});

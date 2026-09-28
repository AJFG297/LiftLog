import { describe, expect, it } from 'vitest';
import { hitSlopFor } from '@/components/presentation/foundation/touch-target';

describe('hitSlopFor', () => {
  it('pads a 36pt square out to 44pt on every side', () => {
    expect(hitSlopFor({ width: 36, height: 36 })).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
  });

  it('pads only the axis that falls short', () => {
    expect(hitSlopFor({ width: 120, height: 32 })).toEqual({ top: 6, bottom: 6, left: 0, right: 0 });
  });

  it('adds nothing to a control that is already big enough', () => {
    expect(hitSlopFor({ width: 48, height: 56 })).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});

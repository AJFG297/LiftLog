import { describe, expect, it } from 'vitest';
import { formatHalves } from './progress-format';

describe('formatHalves', () => {
  it('shows halves as ½', () => {
    expect(formatHalves(6.5)).toBe('6½');
    expect(formatHalves(0.5)).toBe('½');
  });

  it('rounds to the nearest half', () => {
    expect(formatHalves(6.625)).toBe('6½');
    expect(formatHalves(6.75)).toBe('7');
    expect(formatHalves(0.2)).toBe('0');
    expect(formatHalves(14)).toBe('14');
  });
});

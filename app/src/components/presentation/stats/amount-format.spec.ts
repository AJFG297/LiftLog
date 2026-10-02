import { describe, expect, it, vi } from 'vitest';
import { amountText, formatHalves, signedText } from '@/components/presentation/stats/amount-format';

vi.mock('expo-localization', () => ({ getLocales: () => [{ decimalSeparator: '.' }] }));

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

describe('signedText', () => {
  it('signs an amount already rounded for showing, without rounding it again', () => {
    expect(signedText(2.25)).toEqual({ text: '+2.25', tone: 'gain' });
    expect(signedText(-0.1)).toEqual({ text: '−0.1', tone: 'fall' });
    expect(signedText(0)).toEqual({ text: undefined, tone: 'none' });
  });
});

describe('amountText', () => {
  it('shows an amount as it is', () => {
    expect(amountText(102.25)).toBe('102.25');
    expect(amountText(138)).toBe('138');
  });
});

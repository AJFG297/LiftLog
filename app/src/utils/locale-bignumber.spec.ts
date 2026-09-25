import { describe, expect, it } from 'vitest';
import { parseDecimal } from './locale-bignumber';

describe('parseDecimal', () => {
  describe.each([true, false])('usesComma=%s', (usesComma) => {
    it.each([
      ['2.5', '2.5'],
      ['2,5', '2.5'],
      ['100', '100'],
      ['-2.5', '-2.5'],
      ['.5', '0.5'],
      ['1.000,5', '1000.5'],
      ['1,000.5', '1000.5'],
      ['1 000,5', '1000.5'],
    ])('parses %s as %s', (input, expected) => {
      expect(parseDecimal(input, usesComma).toString()).toBe(expected);
    });

    it.each(['', 'abc', '1.2.3', '1,2,3'])('rejects %s', (input) => {
      expect(parseDecimal(input, usesComma).isNaN()).toBe(true);
    });
  });

  it('treats a thousands-grouped comma as grouping in dot locales', () => {
    expect(parseDecimal('1,000', false).toString()).toBe('1000');
    expect(parseDecimal('12,345,678', false).toString()).toBe('12345678');
  });

  it('treats a lone comma as the decimal separator in comma locales', () => {
    expect(parseDecimal('1,000', true).toString()).toBe('1');
  });

  it('keeps the dot when a comma locale types one (#927)', () => {
    expect(parseDecimal('62.5', true).toString()).toBe('62.5');
  });
});

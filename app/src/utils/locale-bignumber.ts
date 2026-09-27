import BigNumber from 'bignumber.js';
import { getLocales } from 'expo-localization';

let usesComma: boolean | undefined;

function localeUsesComma(): boolean {
  usesComma ??= getLocales()[0].decimalSeparator === ',';
  return usesComma;
}

export function localeParseBigNumber(numStr: string): BigNumber {
  return parseDecimal(numStr, localeUsesComma());
}

/**
 * Parses user-typed decimals leniently: keyboards don't always match the locale, so either `.` or `,` is
 * accepted as the decimal separator. Group separators our own formatting emits (space for comma locales,
 * `,` for dot locales) are stripped, so a formatted value seeded into an editor still parses.
 */
export function parseDecimal(numStr: string, usesComma: boolean): BigNumber {
  const str = numStr.replace(/\s/g, '');
  const lastDot = str.lastIndexOf('.');
  const lastComma = str.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: whichever comes last is the decimal separator, the other is grouping.
    const [group, decimal] = lastDot > lastComma ? [',', '.'] : ['.', ','];
    return new BigNumber(str.replaceAll(group, '').replace(decimal, '.'));
  }
  if (lastComma !== -1 && !usesComma && /^-?\d{1,3}(,\d{3})+$/.test(str)) {
    // Dot locales format thousands as `1,000`.
    return new BigNumber(str.replaceAll(',', ''));
  }
  return new BigNumber(str.replace(',', '.'));
}

export function localeFormatBigNumber(num: BigNumber | undefined, decimalPlaces?: number): string {
  if (!num) {
    return '';
  }
  const format = {
    groupSeparator: localeUsesComma() ? ' ' : ',',
    groupSize: 3,
    decimalSeparator: localeUsesComma() ? ',' : '.',
  };
  if (localeUsesComma()) {
    return decimalPlaces !== undefined ? num.toFormat(decimalPlaces, format) : num.toFormat(format);
  }
  return decimalPlaces !== undefined ? num.toFormat(decimalPlaces, format) : num.toFormat(format);
}

import BigNumber from 'bignumber.js';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';

/** A number to at most `decimals` places: "80", "82.5". */
export function formatAmount(value: number, decimals: number): string {
  return localeFormatBigNumber(new BigNumber(value).decimalPlaces(decimals));
}

/** A number to exactly `decimals` places: "3.0", "78.4". */
export function formatFixed(value: number, decimals: number): string {
  return localeFormatBigNumber(new BigNumber(value), decimals);
}

/** A gain reads in `positive`, a fall in `warmInk`, no change in `muted`. */
export type ChangeTone = 'gain' | 'fall' | 'none';

export interface SignedText {
  /** "+2.5", "−1"; undefined when it rounds to nothing, for the caller to say "same". */
  text: string | undefined;
  tone: ChangeTone;
}

/** A change with its sign, rounded as the number beside it is. The minus is a real one, not a hyphen. */
export function signedAmount(value: number, decimals: number, { fixed = false } = {}): SignedText {
  const rounded = new BigNumber(value).decimalPlaces(decimals);
  if (rounded.isZero()) {
    return { text: undefined, tone: 'none' };
  }
  const size = fixed
    ? formatFixed(rounded.abs().toNumber(), decimals)
    : formatAmount(rounded.abs().toNumber(), decimals);
  return rounded.isPositive() ? { text: `+${size}`, tone: 'gain' } : { text: `−${size}`, tone: 'fall' };
}

/** Rounds to the nearest half. */
export function toHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Sets a week to the nearest half, with the half as "½": "6½", "½", "14". */
export function formatHalves(value: number): string {
  const half = toHalf(value);
  const whole = Math.floor(half);
  if (half === whole) {
    return `${whole}`;
  }
  return whole ? `${whole}½` : '½';
}

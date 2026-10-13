import BigNumber from 'bignumber.js';
import { shortFormatWeightUnit, Weight } from '@/models/weight';
import { ChangeTone, toneOf } from '@/store/stats/progress-amounts';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';

/** A number already rounded for showing, as it is: "80", "82.5", "102.25". */
export function amountText(value: number | BigNumber): string {
  return localeFormatBigNumber(new BigNumber(value));
}

/** A weight already rounded for showing, with its unit: "82.5 kg". */
export function weightText(weight: Weight): string {
  return `${amountText(weight.value)} ${shortFormatWeightUnit(weight.unit)}`;
}

/** A number to at most `decimals` places: "80", "82.5". */
export function formatAmount(value: number, decimals: number): string {
  return localeFormatBigNumber(new BigNumber(value).decimalPlaces(decimals));
}

/** A number to exactly `decimals` places: "3.0", "78.4". */
export function formatFixed(value: number, decimals: number): string {
  return localeFormatBigNumber(new BigNumber(value), decimals);
}

export interface SignedText {
  /** "+2.5", "−1"; undefined when it is nothing, for the caller to say "same". */
  text: string | undefined;
  tone: ChangeTone;
}

/** A change with its sign, rounded as the number beside it is. The minus is a real one, not a hyphen. */
export function signedAmount(value: number, decimals: number, { fixed = false } = {}): SignedText {
  return signed(new BigNumber(value).decimalPlaces(decimals), (size) =>
    fixed ? formatFixed(size, decimals) : formatAmount(size, decimals),
  );
}

/** A change already rounded for showing, with its sign: the difference of two amounts as shown. */
export function signedText(value: number | BigNumber): SignedText {
  return signed(new BigNumber(value), amountText);
}

function signed(value: BigNumber, format: (size: number) => string): SignedText {
  const tone = toneOf(value);
  const size = format(value.abs().toNumber());
  return { text: tone === 'none' ? undefined : `${tone === 'gain' ? '+' : '−'}${size}`, tone };
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

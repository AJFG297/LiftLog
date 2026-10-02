import BigNumber from 'bignumber.js';
import { Weight, WeightUnit } from '@/models/weight';

/**
 * What a weight on the Progress screens is, which decides how it reads:
 * - `estimate`: an estimated 1RM. It is a calculation, so it shows to the nearest half of the user's unit.
 * - `load`: what was on the bar. It shows as lifted, to at most two places, unless it was lifted in the other
 *   unit: converted, it shows to the nearest half too, so 62.5 kg reads 138 lbs rather than 137.79.
 */
export type AmountKind = 'estimate' | 'load';

type Step = 'half' | 'tenth';

const AS_LIFTED_DECIMALS = 2;

/** `weight` as the Progress screens show it, in `unit`. */
export function shownWeight(weight: Weight, kind: AmountKind, unit: WeightUnit): Weight {
  return shownTo(weight, kind, unit, 'half');
}

/** A value against an earlier one, both as shown, and the change between them. */
export interface ShownChange {
  value: Weight;
  previous: Weight;
  /** `value` less `previous`, as shown. */
  change: Weight;
}

/**
 * `value` against `previous`, both as shown, with the change as their difference as shown. A row then adds up
 * as it reads, and a record's gain reads the same wherever the record is listed. When the two would show alike
 * although they differ (a real but tiny gain), both show to a tenth instead, rather than "+0".
 */
export function shownChange(value: Weight, previous: Weight, kind: AmountKind, unit: WeightUnit): ShownChange {
  let shownValue = shownTo(value, kind, unit, 'half');
  let shownPrevious = shownTo(previous, kind, unit, 'half');
  if (shownValue.value.eq(shownPrevious.value) && !value.equals(previous, true)) {
    shownValue = shownTo(value, kind, unit, 'tenth');
    shownPrevious = shownTo(previous, kind, unit, 'tenth');
  }
  return { value: shownValue, previous: shownPrevious, change: shownValue.minus(shownPrevious) };
}

/** Which way a change went: a gain reads in `positive`, a fall in `warmInk`, no change in `muted`. */
export type ChangeTone = 'gain' | 'fall' | 'none';

export function toneOf(change: BigNumber | number): ChangeTone {
  const sign = new BigNumber(change);
  return sign.isZero() ? 'none' : sign.isPositive() ? 'gain' : 'fall';
}

function shownTo(weight: Weight, kind: AmountKind, unit: WeightUnit, step: Step): Weight {
  const converted = weight.convertTo(unit);
  const asLifted = weight.unit === converted.unit || weight.unit === 'nil';
  if (kind === 'load' && asLifted) {
    return converted.with({ value: converted.value.decimalPlaces(AS_LIFTED_DECIMALS) });
  }
  return converted.with({ value: step === 'half' ? toHalf(converted.value) : converted.value.decimalPlaces(1) });
}

function toHalf(value: BigNumber): BigNumber {
  return value.times(2).integerValue(BigNumber.ROUND_HALF_UP).div(2);
}

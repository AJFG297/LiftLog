import BigNumber from 'bignumber.js';
import { Weight, WeightUnit } from '@/models/weight';

/**
 * What a weight on the Progress screens is, which decides how it reads:
 * - `estimate`: an estimated 1RM. It is a calculation, so it shows to the nearest half of the user's unit.
 * - `load`: what was on the bar. It shows as lifted, to at most two places, unless it was lifted in the other
 *   unit: converted, it shows to the nearest half too, so 62.5 kg reads 138 lbs rather than 137.79.
 */
export type AmountKind = 'estimate' | 'load';

/** The steps a value can show to, coarsest first. Halves unless that would hide a real difference. */
const STEPS = ['half', 'tenth', 'hundredth'] as const;
type Step = (typeof STEPS)[number];

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
 * as it reads, and a record's gain reads the same wherever the record is listed. When rounding would hide or
 * flip the change (a real but tiny gain, or a converted load set against one shown as lifted), both show a
 * place finer, to a tenth and then a hundredth, rather than "+0" or a gain that reads as a fall.
 */
export function shownChange(value: Weight, previous: Weight, kind: AmountKind, unit: WeightUnit): ShownChange {
  const direction = value.convertTo(unit).value.comparedTo(previous.convertTo(unit).value);
  let shown = withChange(shownPair(value, previous, kind, unit, 'half'));
  for (const step of STEPS.slice(1)) {
    if (shown.change.value.comparedTo(0) === direction) {
      break;
    }
    shown = withChange(shownPair(value, previous, kind, unit, step));
  }
  return shown;
}

function withChange(shown: { value: Weight; previous: Weight }): ShownChange {
  return { ...shown, change: shown.value.minus(shown.previous) };
}

function shownPair(value: Weight, previous: Weight, kind: AmountKind, unit: WeightUnit, step: Step) {
  return { value: shownTo(value, kind, unit, step), previous: shownTo(previous, kind, unit, step) };
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
  return converted.with({
    value: step === 'half' ? toHalf(converted.value) : converted.value.decimalPlaces(step === 'tenth' ? 1 : 2),
  });
}

function toHalf(value: BigNumber): BigNumber {
  return value.times(2).integerValue(BigNumber.ROUND_HALF_UP).div(2);
}

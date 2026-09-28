import BigNumber from 'bignumber.js';
import type { PerUnit } from '@/models/weight';

export const DEFAULT_BAR_WEIGHT: PerUnit<number> = { kilograms: 20, pounds: 45 };

export const DEFAULT_PLATES: PerUnit<number[]> = {
  kilograms: [25, 20, 15, 10, 5, 2.5, 1.25],
  pounds: [45, 35, 25, 10, 5, 2.5],
};

/** Every plate size the settings screen offers to switch on, heaviest first. */
export const PLATE_SIZES: PerUnit<number[]> = {
  kilograms: [50, 25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5, 0.25],
  pounds: [100, 55, 45, 35, 25, 15, 10, 5, 2.5, 1.25],
};

export const BAR_WEIGHTS: PerUnit<number[]> = {
  kilograms: [5, 7.5, 10, 15, 20, 25],
  pounds: [15, 20, 25, 35, 45, 55],
};

export type PlateLoading =
  | { kind: 'exact'; perSide: BigNumber[] }
  | { kind: 'inexact'; perSide: BigNumber[]; remainder: BigNumber }
  | { kind: 'belowBar' };

/**
 * The plates for each side of the bar to make `weight`, heaviest first, using as few plates as possible.
 * Any size in `plates` can be used as many times as needed.
 *
 * When `weight` can't be made exactly, this loads the heaviest weight below it, since a lifter would rather
 * be told to load a little less than they typed than more, and `remainder` is how far short that is.
 */
export function platesFor(weight: BigNumber, bar: BigNumber, plates: readonly BigNumber[]): PlateLoading {
  if (!weight.isFinite() || !bar.isFinite() || weight.isLessThan(bar)) {
    return { kind: 'belowBar' };
  }

  const perSide = fewestPlatesUpTo(weight.minus(bar).dividedBy(2), plates);
  const loaded = bar.plus(BigNumber.sum(0, ...perSide).multipliedBy(2));
  const remainder = weight.minus(loaded);
  return remainder.isZero() ? { kind: 'exact', perSide } : { kind: 'inexact', perSide, remainder };
}

// Greedy from the heaviest plate is exact for the default sets but not for every set a user can pick
// ({15, 10} can't make 20 greedily), so this is a coin-change search over whole multiples of the plates'
// common divisor. The table has one entry per multiple up to the load on a side: 44 for 130 kg with the
// default plates, 560 for 300 kg with 0.25 kg plates, about 20,000 at the pad's 9999.99 limit.
function fewestPlatesUpTo(target: BigNumber, plates: readonly BigNumber[]): BigNumber[] {
  const sizes = plates
    .filter(
      (plate, index) => plate.isFinite() && plate.isGreaterThan(0) && plates.findIndex((p) => p.eq(plate)) === index,
    )
    .sort((a, b) => b.comparedTo(a) ?? 0);
  if (sizes.length === 0) {
    return [];
  }

  const scale = new BigNumber(10).pow(Math.max(...sizes.map((size) => size.decimalPlaces() ?? 0)));
  const unit = sizes.map((size) => size.multipliedBy(scale).toNumber()).reduce(gcd);
  const plateSteps = sizes.map((size) => ({ size, steps: size.multipliedBy(scale).toNumber() / unit }));
  const targetSteps = target.multipliedBy(scale).dividedToIntegerBy(unit).toNumber();

  const fewest = [0];
  const fewestFor = (amount: number) => (amount < 0 ? Infinity : (fewest[amount] ?? Infinity));
  for (let amount = 1; amount <= targetSteps; amount++) {
    let best = Infinity;
    for (const { steps } of plateSteps) {
      best = Math.min(best, fewestFor(amount - steps) + 1);
    }
    fewest.push(best);
  }

  let amount = targetSteps;
  while (fewestFor(amount) === Infinity) {
    amount--;
  }
  const chosen: BigNumber[] = [];
  while (amount > 0) {
    const count = fewestFor(amount);
    const plate = plateSteps.find(({ steps }) => fewestFor(amount - steps) === count - 1);
    if (!plate) {
      break;
    }
    chosen.push(plate.size);
    amount -= plate.steps;
  }
  return chosen;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

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
export function platesFor(
  weight: BigNumber.Value,
  bar: BigNumber.Value,
  plates: readonly BigNumber.Value[],
): PlateLoading {
  const total = new BigNumber(weight);
  const barWeight = new BigNumber(bar);
  if (!total.isFinite() || !barWeight.isFinite() || total.isLessThan(barWeight)) {
    return { kind: 'belowBar' };
  }

  const perSide = fewestPlatesUpTo(total.minus(barWeight).dividedBy(2), plates);
  const loaded = barWeight.plus(BigNumber.sum(0, ...perSide).multipliedBy(2));
  const remainder = total.minus(loaded);
  return remainder.isZero() ? { kind: 'exact', perSide } : { kind: 'inexact', perSide, remainder };
}

// Greedy from the heaviest plate is exact for the default sets but not for every set a user can pick
// ({15, 10} can't make 20 greedily), so this is a coin-change search over whole multiples of the plates'
// common divisor, which keeps the table to a few hundred entries.
function fewestPlatesUpTo(target: BigNumber, plates: readonly BigNumber.Value[]): BigNumber[] {
  const sizes = [...new Set(plates.map((plate) => new BigNumber(plate).toString()))]
    .map((plate) => new BigNumber(plate))
    .filter((plate) => plate.isFinite() && plate.isGreaterThan(0))
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
    fewest.push(Math.min(...plateSteps.map(({ steps }) => fewestFor(amount - steps) + 1)));
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

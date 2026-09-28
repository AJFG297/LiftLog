import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import BigNumber from 'bignumber.js';
import { platesFor, type PlateLoading } from '@/models/plates';

const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const LB_PLATES = [45, 35, 25, 10, 5, 2.5];

function readable(loading: PlateLoading) {
  switch (loading.kind) {
    case 'exact':
      return { kind: loading.kind, perSide: loading.perSide.map(Number) };
    case 'inexact':
      return { kind: loading.kind, perSide: loading.perSide.map(Number), remainder: loading.remainder.toNumber() };
    case 'belowBar':
      return { kind: loading.kind };
  }
}

describe('platesFor', () => {
  it.each([
    { weight: 87.5, perSide: [25, 5, 2.5, 1.25] },
    { weight: 100, perSide: [25, 15] },
    { weight: 140, perSide: [25, 25, 10] },
    { weight: 22.5, perSide: [1.25] },
  ])('loads $weight kg on a 20 kg bar as $perSide per side', ({ weight, perSide }) => {
    expect(readable(platesFor(weight, 20, KG_PLATES))).toEqual({ kind: 'exact', perSide });
  });

  it.each([
    { weight: 135, perSide: [45] },
    { weight: 185, perSide: [45, 25] },
    { weight: 315, perSide: [45, 45, 45] },
    { weight: 50, perSide: [2.5] },
  ])('loads $weight lb on a 45 lb bar as $perSide per side', ({ weight, perSide }) => {
    expect(readable(platesFor(weight, 45, LB_PLATES))).toEqual({ kind: 'exact', perSide });
  });

  it('needs no plates for the bar alone', () => {
    expect(readable(platesFor(20, 20, KG_PLATES))).toEqual({ kind: 'exact', perSide: [] });
  });

  it('says a weight lighter than the bar is below the bar', () => {
    expect(readable(platesFor(15, 20, KG_PLATES))).toEqual({ kind: 'belowBar' });
    expect(readable(platesFor(0, 45, LB_PLATES))).toEqual({ kind: 'belowBar' });
  });

  it('treats a weight that is not a number as nothing to load', () => {
    expect(readable(platesFor(NaN, 20, KG_PLATES))).toEqual({ kind: 'belowBar' });
    expect(readable(platesFor(100, NaN, KG_PLATES))).toEqual({ kind: 'belowBar' });
  });

  it('loads the heaviest weight under one that cannot be made, and says how far short it is', () => {
    expect(readable(platesFor(61, 20, KG_PLATES))).toEqual({ kind: 'inexact', perSide: [20], remainder: 1 });
    expect(readable(platesFor(22, 20, KG_PLATES))).toEqual({ kind: 'inexact', perSide: [], remainder: 2 });
    expect(readable(platesFor(137, 45, LB_PLATES))).toEqual({ kind: 'inexact', perSide: [45], remainder: 2 });
  });

  it('finds an exact load that taking the heaviest plate first would miss', () => {
    expect(readable(platesFor(60, 20, [15, 10]))).toEqual({ kind: 'exact', perSide: [10, 10] });
    expect(readable(platesFor(80, 20, [25, 15, 10]))).toEqual({ kind: 'exact', perSide: [15, 15] });
  });

  it('uses the fewest plates, heaviest first', () => {
    expect(readable(platesFor(100, 20, [20, 10, 5]))).toEqual({ kind: 'exact', perSide: [20, 20] });
  });

  it('ignores duplicate and non-positive plate sizes', () => {
    expect(readable(platesFor(70, 20, [25, 25, 0, -5]))).toEqual({ kind: 'exact', perSide: [25] });
  });

  it('with no plates, loads only the bar', () => {
    expect(readable(platesFor(40, 20, []))).toEqual({ kind: 'inexact', perSide: [], remainder: 20 });
  });

  it('never loads more than the weight, and with the default plates is short by less than a pair of 1.25s', () => {
    const quarterKilos = fc.integer({ min: 80, max: 1600 }).map((quarters) => new BigNumber(quarters).dividedBy(4));
    fc.assert(
      fc.property(quarterKilos, (weight) => {
        const loading = platesFor(weight, 20, KG_PLATES);
        if (loading.kind === 'belowBar') {
          return false;
        }
        const loaded = BigNumber.sum(20, ...loading.perSide.map((plate) => plate.multipliedBy(2)));
        const remainder = loading.kind === 'inexact' ? loading.remainder : new BigNumber(0);
        return loaded.plus(remainder).eq(weight) && remainder.isGreaterThanOrEqualTo(0) && remainder.isLessThan(2.5);
      }),
    );
  });
});

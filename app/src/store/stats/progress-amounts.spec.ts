import { describe, expect, it } from 'vitest';
import { Weight } from '@/models/weight';
import { shownChange, shownWeight } from '@/store/stats/progress-amounts';

const kg = (n: number) => new Weight(n, 'kilograms');
const lbs = (n: number) => new Weight(n, 'pounds');

describe('shownWeight', () => {
  it('shows an estimate to the nearest half of the unit', () => {
    expect(shownWeight(kg(104.24), 'estimate', 'kilograms')).toEqual(kg(104));
    expect(shownWeight(kg(104.25), 'estimate', 'kilograms')).toEqual(kg(104.5));
    expect(shownWeight(kg(104.8), 'estimate', 'kilograms')).toEqual(kg(105));
  });

  it('converts an estimate to the user unit before rounding it', () => {
    // 100 kg is 220.462 lbs.
    expect(shownWeight(kg(100), 'estimate', 'pounds')).toEqual(lbs(220.5));
  });

  it('shows a load in the unit it was lifted in as lifted', () => {
    expect(shownWeight(kg(82.5), 'load', 'kilograms')).toEqual(kg(82.5));
    expect(shownWeight(kg(102.25), 'load', 'kilograms')).toEqual(kg(102.25));
    expect(shownWeight(lbs(137.789), 'load', 'pounds')).toEqual(lbs(137.79));
  });

  it('rounds a load converted from the other unit to the nearest half', () => {
    // 62.5 kg is 137.79 lbs.
    expect(shownWeight(kg(62.5), 'load', 'pounds')).toEqual(lbs(138));
    // 135 lbs is 61.235 kg.
    expect(shownWeight(lbs(135), 'load', 'kilograms').value.toNumber()).toBe(61);
  });
});

describe('shownChange', () => {
  it('gives the change between the two values as shown', () => {
    const shown = shownChange(kg(104.3), kg(101.8), 'estimate', 'kilograms');

    expect(shown.value).toEqual(kg(104.5));
    expect(shown.previous).toEqual(kg(102));
    // 2.5 as shown, though the estimates are 2.5 apart only by chance.
    expect(shown.change).toEqual(kg(2.5));
  });

  it('adds up as shown when converted to pounds', () => {
    // 100 kg is 220.46 lbs, 97.5 kg is 214.95 lbs: 220.5 against 215.
    const shown = shownChange(kg(100), kg(97.5), 'estimate', 'pounds');

    expect([shown.value.value.toNumber(), shown.previous.value.toNumber(), shown.change.value.toNumber()]).toEqual([
      220.5, 215, 5.5,
    ]);
    expect(shown.change.unit).toBe('pounds');
  });

  it('shows a tiny gain to a tenth rather than as no gain', () => {
    const shown = shownChange(kg(100.2), kg(100.1), 'estimate', 'kilograms');

    expect([shown.value.value.toNumber(), shown.previous.value.toNumber(), shown.change.value.toNumber()]).toEqual([
      100.2, 100.1, 0.1,
    ]);
  });

  it('keeps halves when the two are really equal', () => {
    expect(shownChange(kg(100.2), kg(100.2), 'estimate', 'kilograms').change).toEqual(kg(0));
  });

  it('subtracts loads as lifted', () => {
    expect(shownChange(kg(102.25), kg(100), 'load', 'kilograms').change).toEqual(kg(2.25));
  });
});

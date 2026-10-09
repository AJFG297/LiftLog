import { describe, expect, it } from 'vitest';
import { Weight } from '@/models/weight';
import { shownChange, shownWeight, toneOf } from '@/store/stats/progress-amounts';

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

describe('shownWeight for volume', () => {
  it('shows a volume to the whole of the user unit', () => {
    expect(shownWeight(kg(312.5), 'volume', 'kilograms')).toEqual(kg(313));
    expect(shownWeight(kg(300.4), 'volume', 'kilograms')).toEqual(kg(300));
    // 1000 kg is 2204.62 lbs.
    expect(shownWeight(kg(1000), 'volume', 'pounds')).toEqual(lbs(2205));
  });

  it('refines a volume change to a tenth when the wholes would hide it', () => {
    expect(shownChange(kg(300.4), kg(300), 'volume', 'kilograms').change).toEqual(kg(0.4));
    expect(shownChange(kg(310.4), kg(300), 'volume', 'kilograms').change).toEqual(kg(10));
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

  it('goes to a hundredth when a tenth still shows the two alike', () => {
    const shown = shownChange(kg(116.74), kg(116.71), 'estimate', 'kilograms');

    expect([shown.value.value.toNumber(), shown.previous.value.toNumber(), shown.change.value.toNumber()]).toEqual([
      116.74, 116.71, 0.03,
    ]);
  });

  it('keeps halves when the two are really equal', () => {
    expect(shownChange(kg(100.2), kg(100.2), 'estimate', 'kilograms').change).toEqual(kg(0));
  });

  it('never shows a heavier converted load as a fall against one shown as lifted', () => {
    // 220.9 lb is 100.198 kg, which rounds to 100 kg, below the 100.1 kg shown as lifted.
    const shown = shownChange(new Weight(220.9, 'pounds'), kg(100.1), 'load', 'kilograms');

    expect([shown.value, shown.previous, shown.change]).toEqual([kg(100.2), kg(100.1), kg(0.1)]);
  });

  it('subtracts loads as lifted', () => {
    expect(shownChange(kg(102.25), kg(100), 'load', 'kilograms').change).toEqual(kg(2.25));
  });
});

describe('toneOf', () => {
  it('reads a change as a gain, a fall or none', () => {
    expect([toneOf(2.5), toneOf(-0.1), toneOf(0)]).toEqual(['gain', 'fall', 'none']);
  });
});

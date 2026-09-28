import { describe, expect, it } from 'vitest';
import BigNumber from 'bignumber.js';
import { equipmentClassOf, weightStepFor } from '@/models/equipment';

function stepFor(equipment: string | null, unit: 'kilograms' | 'pounds', blueprintIncrement = 7.5): number {
  return weightStepFor(equipmentClassOf(equipment), unit, new BigNumber(blueprintIncrement)).toNumber();
}

describe('weight step', () => {
  it.each([
    { equipment: 'barbell', kilograms: 2.5, pounds: 5 },
    { equipment: 'dumbbell', kilograms: 2, pounds: 5 },
    { equipment: 'cable', kilograms: 2.5, pounds: 5 },
    { equipment: 'machine', kilograms: 2.5, pounds: 5 },
  ])('steps a $equipment by $kilograms kg or $pounds lb', ({ equipment, kilograms, pounds }) => {
    expect(stepFor(equipment, 'kilograms')).toBe(kilograms);
    expect(stepFor(equipment, 'pounds')).toBe(pounds);
  });

  it('reads the catalog string whatever its case or padding', () => {
    expect(stepFor(' Dumbbell ', 'kilograms')).toBe(2);
  });

  it.each([null, 'kettlebells', 'e-z curl bar', 'body only', 'other', ''])(
    'falls back to the blueprint increment for %j',
    (equipment) => {
      expect(stepFor(equipment, 'kilograms', 7.5)).toBe(7.5);
      expect(stepFor(equipment, 'pounds', 10)).toBe(10);
    },
  );
});

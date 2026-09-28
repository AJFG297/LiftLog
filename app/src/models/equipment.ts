import BigNumber from 'bignumber.js';
import type { LoadUnit, PerUnit } from '@/models/weight';

/** How a weight on the equipment is loaded: plates on a bar, one dumbbell, or a weight stack. */
export type LoadKind = 'plates' | 'perDumbbell' | 'onStack';

// Keyed by the exercise catalog's equipment string. An e-z curl bar is left out: it's plate-loaded, but far
// lighter than the barbell the plate maths assumes.
const EQUIPMENT = {
  barbell: { load: 'plates', step: { kilograms: 2.5, pounds: 5 } },
  dumbbell: { load: 'perDumbbell', step: { kilograms: 2, pounds: 5 } },
  cable: { load: 'onStack', step: { kilograms: 2.5, pounds: 5 } },
  machine: { load: 'onStack', step: { kilograms: 2.5, pounds: 5 } },
} as const satisfies Record<string, { load: LoadKind; step: PerUnit<number> }>;

export type EquipmentClass = keyof typeof EQUIPMENT;

export function equipmentClassOf(equipment: string | null): EquipmentClass | undefined {
  const key = equipment?.trim().toLowerCase();
  return key !== undefined && isEquipmentClass(key) ? key : undefined;
}

function isEquipmentClass(key: string): key is EquipmentClass {
  // Own keys only, so `constructor` and the like aren't equipment.
  return Object.prototype.hasOwnProperty.call(EQUIPMENT, key);
}

export function loadKindOf(equipment: EquipmentClass): LoadKind {
  return EQUIPMENT[equipment].load;
}

export function weightStepFor(
  equipment: EquipmentClass | undefined,
  unit: LoadUnit,
  blueprintIncrement: BigNumber,
): BigNumber {
  return equipment ? new BigNumber(EQUIPMENT[equipment].step[unit]) : blueprintIncrement;
}

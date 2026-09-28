import BigNumber from 'bignumber.js';
import type { LoadUnit, PerUnit } from '@/models/weight';

export type EquipmentClass = 'barbell' | 'dumbbell' | 'cable' | 'machine';

const EQUIPMENT_CLASSES: Partial<Record<string, EquipmentClass>> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  machine: 'machine',
};

const WEIGHT_STEP: Record<EquipmentClass, PerUnit<number>> = {
  barbell: { kilograms: 2.5, pounds: 5 },
  dumbbell: { kilograms: 2, pounds: 5 },
  cable: { kilograms: 2.5, pounds: 5 },
  machine: { kilograms: 2.5, pounds: 5 },
};

// An e-z curl bar is left out: it's plate-loaded, but far lighter than the barbell the plate maths assumes.
export function equipmentClassOf(equipment: string | null): EquipmentClass | undefined {
  return equipment === null ? undefined : EQUIPMENT_CLASSES[equipment.trim().toLowerCase()];
}

export function weightStepFor(
  equipment: EquipmentClass | undefined,
  unit: LoadUnit,
  blueprintIncrement: BigNumber,
): BigNumber {
  return equipment ? new BigNumber(WEIGHT_STEP[equipment][unit]) : blueprintIncrement;
}

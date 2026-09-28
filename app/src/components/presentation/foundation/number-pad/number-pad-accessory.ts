import BigNumber from 'bignumber.js';
import type { EquipmentClass } from '@/models/equipment';
import type { Rpe } from '@/models/session-models/rpe';
import type { LoadUnit } from '@/models/weight';

export type NumberPadAccessory =
  | { kind: 'plates'; unit: LoadUnit; bar: BigNumber; plates: readonly BigNumber[] }
  | { kind: 'perDumbbell'; unit: LoadUnit }
  | { kind: 'onStack'; unit: LoadUnit }
  | { kind: 'rpe'; value: Rpe | undefined; onChange: (rpe: Rpe | undefined) => void };

export interface PlateSetup {
  bar: BigNumber.Value;
  plates: readonly BigNumber.Value[];
}

export function weightAccessoryFor(
  equipment: EquipmentClass | undefined,
  unit: LoadUnit,
  setup: PlateSetup,
): NumberPadAccessory | undefined {
  switch (equipment) {
    case 'barbell':
      return {
        kind: 'plates',
        unit,
        bar: new BigNumber(setup.bar),
        plates: setup.plates.map((plate) => new BigNumber(plate)),
      };
    case 'dumbbell':
      return { kind: 'perDumbbell', unit };
    case 'cable':
    case 'machine':
      return { kind: 'onStack', unit };
    case undefined:
      return undefined;
  }
}

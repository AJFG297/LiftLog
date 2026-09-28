import BigNumber from 'bignumber.js';
import type { EquipmentClass } from '@/models/equipment';
import type { Rpe } from '@/models/session-models/rpe';

export type NumberPadAccessory =
  | { kind: 'plates'; bar: BigNumber; plates: readonly BigNumber[] }
  | { kind: 'perDumbbell' }
  | { kind: 'onStack' }
  | { kind: 'rpe'; value: Rpe | undefined; onChange: (rpe: Rpe | undefined) => void };

export interface PlateSetup {
  bar: BigNumber.Value;
  plates: readonly BigNumber.Value[];
}

export function weightAccessoryFor(
  equipment: EquipmentClass | undefined,
  setup: PlateSetup,
): NumberPadAccessory | undefined {
  switch (equipment) {
    case 'barbell':
      return {
        kind: 'plates',
        bar: new BigNumber(setup.bar),
        plates: setup.plates.map((plate) => new BigNumber(plate)),
      };
    case 'dumbbell':
      return { kind: 'perDumbbell' };
    case 'cable':
    case 'machine':
      return { kind: 'onStack' };
    case undefined:
      return undefined;
  }
}

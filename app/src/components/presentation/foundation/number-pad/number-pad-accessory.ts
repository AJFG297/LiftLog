import BigNumber from 'bignumber.js';
import { type EquipmentClass, type LoadKind, loadKindOf } from '@/models/equipment';
import type { Rpe } from '@/models/session-models/rpe';
import type { LoadUnit } from '@/models/weight';

export type NumberPadAccessory =
  | { kind: 'plates'; unit: LoadUnit; bar: BigNumber; plates: readonly BigNumber[] }
  | { kind: Exclude<LoadKind, 'plates'>; unit: LoadUnit }
  | { kind: 'rpe'; value: Rpe | undefined; onChange: (rpe: Rpe | undefined) => void };

export function weightAccessoryFor(
  equipment: EquipmentClass | undefined,
  unit: LoadUnit,
  setup: { bar: BigNumber.Value; plates: readonly BigNumber.Value[] },
): NumberPadAccessory | undefined {
  if (!equipment) {
    return undefined;
  }
  const kind = loadKindOf(equipment);
  return kind === 'plates'
    ? { kind, unit, bar: new BigNumber(setup.bar), plates: setup.plates.map((plate) => new BigNumber(plate)) }
    : { kind, unit };
}

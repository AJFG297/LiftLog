import { Distance, DistanceUnit } from '@/models/blueprint-models';
import BigNumber from 'bignumber.js';
import { match } from 'ts-pattern';

export function getShortUnit(unit: DistanceUnit): string {
  return match(unit)
    .with('metre', () => 'm')
    .with('kilometre', () => 'km')
    .with('mile', () => 'mi')
    .with('yard', () => 'yd')
    .exhaustive();
}

const metresPerUnit: Record<DistanceUnit, string> = {
  metre: '1',
  kilometre: '1000',
  mile: '1609.344',
  yard: '0.9144',
};

/** A distance can be recorded in a different unit from the one its target was set in. */
export function toMetres(distance: Distance): BigNumber {
  return distance.value.multipliedBy(metresPerUnit[distance.unit]);
}

/** `distance` expressed in `unit`, exactly when it is already in that unit. */
export function distanceIn(distance: Distance, unit: DistanceUnit): BigNumber {
  return distance.unit === unit ? distance.value : toMetres(distance).dividedBy(metresPerUnit[unit]);
}

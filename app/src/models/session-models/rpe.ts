/**
 * Rate of perceived exertion for one set. Only 6-10 is offered: below 6 is not a meaningful rating for a
 * working set, and half steps are as fine as lifters actually rate.
 */
export const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export type Rpe = (typeof RPE_VALUES)[number];

export function isRpe(value: unknown): value is Rpe {
  return RPE_VALUES.includes(value as Rpe);
}

/** `@8`, `@8.5`. */
export function formatRpe(rpe: Rpe): string {
  return `@${rpe}`;
}

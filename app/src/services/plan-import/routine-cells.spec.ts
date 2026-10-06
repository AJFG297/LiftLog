import { describe, expect, it } from 'vitest';
import { parseRepsCell, parseRestCell, parseSetsCell, parseSetsXRepsCell } from './routine-cells';

describe('routine cells', () => {
  it.each([
    ['3', 3],
    [' 4 sets', 4],
    ['50', 20],
    ['0', undefined],
    ['three', undefined],
    ['', undefined],
  ])('reads sets %j as %j', (cell, expected) => {
    expect(parseSetsCell(cell)).toBe(expected);
  });

  it.each([
    ['8', { reps: { type: 'fixed', reps: 8 }, exact: true }],
    ['8-12', { reps: { type: 'range', min: 8, max: 12 }, exact: true }],
    ['8–12 reps', { reps: { type: 'range', min: 8, max: 12 }, exact: true }],
    ['12 to 8', { reps: { type: 'range', min: 8, max: 12 }, exact: true }],
    [
      '12, 10, 8',
      {
        reps: {
          type: 'perSet',
          targets: [
            { min: 12, max: 12 },
            { min: 10, max: 10 },
            { min: 8, max: 8 },
          ],
        },
        sets: 3,
        exact: true,
      },
    ],
    ['8+', { reps: { type: 'fixed', reps: 8 }, exact: false }],
    ['10 each side', { reps: { type: 'fixed', reps: 10 }, exact: false }],
    ['AMRAP', undefined],
    ['', undefined],
  ])('reads reps %j', (cell, expected) => {
    expect(parseRepsCell(cell)).toEqual(expected);
  });

  it.each([
    ['3x8', { sets: 3, reps: { type: 'fixed', reps: 8 }, exact: true }],
    ['3 x 8-12', { sets: 3, reps: { type: 'range', min: 8, max: 12 }, exact: true }],
    ['3×8', { sets: 3, reps: { type: 'fixed', reps: 8 }, exact: true }],
    ['5X5', { sets: 5, reps: { type: 'fixed', reps: 5 }, exact: true }],
    ['4 sets of 10', { sets: 4, reps: { type: 'fixed', reps: 10 }, exact: true }],
    ['3x5+', { sets: 3, reps: { type: 'fixed', reps: 5 }, exact: false }],
    ['8', undefined],
    ['3xAMRAP', undefined],
  ])('reads sets x reps %j', (cell, expected) => {
    expect(parseSetsXRepsCell(cell)).toEqual(expected);
  });

  it.each([
    ['90', undefined, 90],
    ['3', undefined, 180],
    ['90s', undefined, 90],
    ['2 min', undefined, 120],
    ['1.5 mins', undefined, 90],
    ['1:30', undefined, 90],
    ['1m30s', undefined, 90],
    ['2-3 min', undefined, 120],
    ['2', 'seconds', 2],
    ['120', 'minutes', 7200],
    // `1:30` typed into a sheet is stored as 1h30m, a sixteenth of a day.
    ['0.0625', undefined, 90],
  ] as const)('reads rest %j (header unit %j) as %j seconds', (cell, hint, seconds) => {
    expect(parseRestCell(cell, hint)?.seconds()).toBe(seconds);
  });

  it.each(['', 'long', '90 sec rest'])('reads rest %j as nothing', (cell) => {
    expect(parseRestCell(cell)).toBeUndefined();
  });
});

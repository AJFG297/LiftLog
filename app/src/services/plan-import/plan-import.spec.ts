import { ProgramBlueprint, SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { serializeProgramBlueprint } from '@/models/plan-file';
import { LocalDate } from '@js-joda/core';
import { describe, expect, it } from 'vitest';
import { buildXlsx, strToU8, type TestSheet } from './__test__/xlsx-builder';
import { parsePlanImport, type PlanImportResult } from './plan-import';
import { parseRoutineSheets } from './routine-sheets';

/** A plan as the user reads it in the preview: routines, then each exercise's name, reps per set, rest and notes. */
function summary(result: PlanImportResult) {
  if (!result.ok) {
    throw new Error(`Import failed: ${result.failure}`);
  }
  return {
    name: result.blueprint.name,
    routines: result.blueprint.sessions.map((session) => ({
      name: session.name,
      exercises: session.exercises.map((exercise) => {
        const weighted = exercise as WeightedExerciseBlueprint;
        return {
          name: weighted.name,
          reps: weighted.plannedSets.map((s) =>
            s.reps.min === s.reps.max ? `${s.reps.min}` : `${s.reps.min}-${s.reps.max}`,
          ),
          rest: weighted.restBetweenSets.minRest.seconds(),
          ...(weighted.notes ? { notes: weighted.notes } : {}),
        };
      }),
    })),
  };
}

const xlsx = (name: string, sheets: TestSheet[]) => parsePlanImport({ name, bytes: buildXlsx(sheets) });
const csv = (name: string, text: string) => parsePlanImport({ name, bytes: strToU8(text) });

describe('parsePlanImport from a spreadsheet', () => {
  it('reads a Google Sheets style program: a title above the header, a day column carried down, sets x reps', () => {
    const result = xlsx('PPL Program.xlsx', [
      {
        name: 'Program',
        rows: [
          ['Push Pull Legs - 6 weeks'],
          [],
          ['Day', 'Exercise', 'Sets x Reps', 'Rest', 'Weight (kg)', 'Notes'],
          ['Push', 'Bench Press', '4x6-8', '3 min', 80, 'Pause the first rep'],
          [undefined, { rich: ['Overhead ', 'Press'] }, '3 x 8-12', 90],
          [undefined, 'Tricep Pushdown', '3×12', '1:30'],
          ['Pull', 'Deadlift', '1x5', '5 min', 140],
          [undefined, 'Barbell Row', '4X8', undefined],
        ],
      },
    ]);

    expect(summary(result)).toEqual({
      name: 'PPL Program',
      routines: [
        {
          name: 'Push',
          exercises: [
            {
              name: 'Bench Press',
              reps: ['6-8', '6-8', '6-8', '6-8'],
              rest: 180,
              notes: 'Pause the first rep\nWeight (kg): 80',
            },
            { name: 'Overhead Press', reps: ['8-12', '8-12', '8-12'], rest: 90 },
            { name: 'Tricep Pushdown', reps: ['12', '12', '12'], rest: 90 },
          ],
        },
        {
          name: 'Pull',
          exercises: [
            { name: 'Deadlift', reps: ['5'], rest: 300, notes: 'Weight (kg): 140' },
            { name: 'Barbell Row', reps: ['8', '8', '8', '8'], rest: 90 },
          ],
        },
      ],
    });
  });

  it('makes one routine per sheet when there is no routine column, in tab order', () => {
    const result = xlsx('Upper Lower.xlsx', [
      {
        name: 'Upper',
        rows: [
          ['Exercise', 'Sets', 'Reps'],
          ['Bench Press', 3, '8-10'],
          ['Pull Up', 3, 8],
        ],
      },
      {
        name: 'Lower',
        rows: [
          ['Exercise', 'Sets', 'Reps'],
          ['Squat', 5, 5],
        ],
      },
      { name: 'Notes', rows: [['Eat more protein']] },
    ]);

    expect(summary(result)).toEqual({
      name: 'Upper Lower',
      routines: [
        {
          name: 'Upper',
          exercises: [
            { name: 'Bench Press', reps: ['8-10', '8-10', '8-10'], rest: 90 },
            { name: 'Pull Up', reps: ['8', '8', '8'], rest: 90 },
          ],
        },
        { name: 'Lower', exercises: [{ name: 'Squat', reps: ['5', '5', '5', '5', '5'], rest: 90 }] },
      ],
    });
  });

  it('reads sparse cells, and a row with no usable sets or reps falls back to the defaults', () => {
    const result = xlsx('Full Body.xlsx', [
      {
        name: 'Sheet1',
        rows: [
          ['Exercise', undefined, 'Reps', 'Sets'],
          ['Goblet Squat', undefined, 10, 3],
          ['Plank', 'hold it', 'AMRAP'],
          [undefined, 'a stray comment'],
        ],
      },
    ]);

    expect(summary(result)).toEqual({
      name: 'Full Body',
      routines: [
        {
          name: 'Full Body',
          exercises: [
            { name: 'Goblet Squat', reps: ['10', '10', '10'], rest: 90 },
            { name: 'Plank', reps: ['10', '10', '10'], rest: 90, notes: 'Reps: AMRAP' },
          ],
        },
      ],
    });
  });

  it('reads a table per day on one sheet, each named by the line above its header', () => {
    const result = xlsx('Split.xlsx', [
      {
        name: 'Sheet1',
        rows: [
          ['Day 1 - Push'],
          ['Exercise', 'Sets', 'Reps'],
          ['Bench Press', 3, 8],
          [],
          ['Day 2 - Pull'],
          ['Exercise', 'Sets', 'Reps'],
          ['Chin Up', 3, '6-8'],
        ],
      },
    ]);

    expect(summary(result).routines).toEqual([
      { name: 'Day 1 - Push', exercises: [{ name: 'Bench Press', reps: ['8', '8', '8'], rest: 90 }] },
      { name: 'Day 2 - Pull', exercises: [{ name: 'Chin Up', reps: ['6-8', '6-8', '6-8'], rest: 90 }] },
    ]);
  });

  it('reads a CSV with quoted fields, commas and line breaks inside quotes, CRLF and a BOM', () => {
    const text =
      '\uFEFFWorkout,Exercise,Sets,Reps,Rest (sec),Notes\r\n' +
      'A,"Squat, Back",5,5,180,"Brace\r\nhard"\r\n' +
      ',"Press ""strict""",3,"12, 10, 8",60,\r\n' +
      'B,Deadlift,1,5,,\r\n';

    expect(summary(csv('Stronglifts.csv', text))).toEqual({
      name: 'Stronglifts',
      routines: [
        {
          name: 'A',
          exercises: [
            { name: 'Squat, Back', reps: ['5', '5', '5', '5', '5'], rest: 180, notes: 'Brace\r\nhard' },
            { name: 'Press "strict"', reps: ['12', '10', '8'], rest: 60 },
          ],
        },
        { name: 'B', exercises: [{ name: 'Deadlift', reps: ['5'], rest: 90 }] },
      ],
    });
  });

  it('gives back the sheets when no sheet holds a routine table', () => {
    const sheets = [
      {
        name: 'Log',
        rows: [
          ['Date', 'Bodyweight'],
          ['2026-10-01', '80'],
        ],
      },
    ];

    const result = xlsx('Log.xlsx', sheets);

    expect(result).toMatchObject({ ok: false, failure: 'noRoutineTable', sheets, planName: 'Log' });
  });

  it('only looks for the first header near the top of a sheet', () => {
    const rows = [...Array.from({ length: 10 }, () => ['notes']), ['Exercise', 'Sets'], ['Squat', '3']];

    expect(parseRoutineSheets([{ name: 'Sheet1', rows }], 'Plan')).toEqual({ ok: false, failure: 'noRoutineTable' });
  });

  it('asks for .xlsx or .csv for spreadsheet formats it cannot open', () => {
    for (const name of ['Plan.xls', 'Plan.numbers', 'Plan.ODS']) {
      expect(parsePlanImport({ name, bytes: new Uint8Array([1, 2, 3]) })).toMatchObject({
        ok: false,
        failure: 'legacySpreadsheet',
      });
    }
    const unnamedXls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(parsePlanImport({ bytes: unnamedXls })).toMatchObject({ ok: false, failure: 'legacySpreadsheet' });
  });

  it('refuses a spreadsheet that would unpack past the size cap', () => {
    const bomb = buildXlsx([
      {
        name: 'Day',
        rows: [
          ['Exercise', 'Sets'],
          ['x'.repeat(21 * 1024 * 1024), 3],
        ],
      },
    ]);
    const hugeCsv = new Uint8Array(21 * 1024 * 1024).fill(0x2c);

    expect(parsePlanImport({ name: 'Plan.xlsx', bytes: bomb })).toMatchObject({
      ok: false,
      failure: 'spreadsheetTooLarge',
    });
    expect(parsePlanImport({ name: 'Plan.csv', bytes: hugeCsv })).toMatchObject({
      ok: false,
      failure: 'spreadsheetTooLarge',
    });
  });

  it('reports a damaged .xlsx as unreadable', () => {
    expect(parsePlanImport({ name: 'Plan.xlsx', bytes: strToU8('not a zip') })).toMatchObject({
      ok: false,
      failure: 'unreadableSpreadsheet',
    });
  });

  it('recognises an .xlsx opened without a name by its zip header, naming the plan after its first sheet', () => {
    const bytes = buildXlsx([
      {
        name: 'Strength',
        rows: [
          ['Exercise', 'Reps'],
          ['Squat', 5],
        ],
      },
    ]);

    expect(summary(parsePlanImport({ bytes }))).toEqual({
      name: 'Strength',
      routines: [{ name: 'Strength', exercises: [{ name: 'Squat', reps: ['5', '5', '5'], rest: 90 }] }],
    });
  });
});

describe('parsePlanImport from a plan file', () => {
  const plan = new ProgramBlueprint(
    'Shared plan',
    [
      new SessionBlueprint(
        'Day A',
        [WeightedExerciseBlueprint.of({ name: 'Squat', sets: 5, repsConfig: { type: 'fixed', reps: 5 } })],
        '',
      ),
    ],
    LocalDate.of(2026, 10, 1),
  );

  it.each([{ name: 'Shared plan.liftlogplan' }, {}])('still imports a .liftlogplan (%j)', (file) => {
    const result = parsePlanImport({ ...file, bytes: serializeProgramBlueprint(plan) });

    expect(result.ok && result.blueprint.toJSON()).toEqual(plan.toJSON());
  });

  it('keeps the plan file messages for a file that is not a plan', () => {
    expect(parsePlanImport({ name: 'notes.txt', bytes: strToU8('hello') })).toMatchObject({
      ok: false,
      failure: 'notAPlan',
    });
  });
});

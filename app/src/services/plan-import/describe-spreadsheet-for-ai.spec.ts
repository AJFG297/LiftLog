import { describe, expect, it } from 'vitest';
import { describeSpreadsheetForAi, MAX_SPREADSHEET_AI_BYTES } from './describe-spreadsheet-for-ai';

const settings = { locale: 'en-GB', preferredWeightUnit: 'kilograms' as const };

const INTRO =
  'Here is a workout program from a spreadsheet, "Program.xlsx". Turn it into a plan with the ' +
  'create_workout_plan tool: one routine per training day, exercise names kept exactly as written, and ' +
  "anything the plan cannot express, such as percentages or weights, in that exercise's notes.\n" +
  'Reply in my locale, en-GB. My preferred weight unit is kilograms.';

describe('describeSpreadsheetForAi', () => {
  it('sends the instructions, then each sheet as CSV without its empty rows', () => {
    const text = describeSpreadsheetForAi(
      'Program.xlsx',
      [
        {
          name: 'Week 1',
          rows: [
            ['Monday', '', ''],
            ['Squat', '5x5', '75%'],
            ['', '', ''],
            ['Bench', '3x8', '60 kg'],
          ],
        },
        { name: 'Notes', rows: [['Deload every fourth week']] },
      ],
      settings,
    );

    expect(text).toBe(
      INTRO +
        '\n\n' +
        '## Sheet: Week 1\n' +
        'Monday,,\n' +
        'Squat,5x5,75%\n' +
        'Bench,3x8,60 kg\n' +
        '\n' +
        '## Sheet: Notes\n' +
        'Deload every fourth week',
    );
  });

  it('quotes cells holding commas, quotes or line breaks', () => {
    const text = describeSpreadsheetForAi(
      'Program.xlsx',
      [{ name: 'Sheet1', rows: [['12, 10, 8', 'The "big" one', 'Two\nlines', 'plain']] }],
      settings,
    );

    expect(text).toBe(INTRO + '\n\n## Sheet: Sheet1\n"12, 10, 8","The ""big"" one","Two\nlines",plain');
  });

  it('heads the nameless sheet of a CSV without a name', () => {
    const text = describeSpreadsheetForAi('Program.csv', [{ name: '', rows: [['Squat']] }], settings);

    expect(text).toBe(INTRO.replace('Program.xlsx', 'Program.csv') + '\n\n## Sheet\nSquat');
  });

  it('leaves out a sheet that holds nothing', () => {
    const text = describeSpreadsheetForAi(
      'Program.xlsx',
      [
        { name: 'Empty', rows: [[' ', '']] },
        { name: 'Days', rows: [['Squat']] },
      ],
      settings,
    );

    expect(text).toBe(INTRO + '\n\n## Sheet: Days\nSquat');
  });

  it('stops at the last whole row that fits the byte cap and says it was cut short', () => {
    // Each row is 99 characters plus its newline: 100 bytes. The header line is 14 bytes with its
    // newline, so 239 rows (23,914 bytes) fit under 24,000 and the 240th would not.
    const rows = Array.from({ length: 300 }, (_, i) => [String(i).padStart(3, '0') + 'x'.repeat(96)]);

    const text = describeSpreadsheetForAi('Program.xlsx', [{ name: 'Big', rows }], settings);

    const body = text.slice(INTRO.length + 2);
    const lines = body.split('\n');
    expect(lines[0]).toBe('## Sheet: Big');
    expect(lines.length).toBe(1 + 239 + 1);
    expect(lines[239]).toBe('238' + 'x'.repeat(96));
    expect(lines[240]).toBe('(The spreadsheet was cut short here because it is too long to send in full.)');
    const sheetBytes = new TextEncoder().encode(lines.slice(0, 240).join('\n') + '\n').length;
    expect(sheetBytes).toBe(23_914);
    expect(sheetBytes).toBeLessThanOrEqual(MAX_SPREADSHEET_AI_BYTES);
  });

  it('counts the cap in UTF-8 bytes, not characters', () => {
    // 'é' is two bytes, so each row is 200 bytes (100 characters) with its newline: 119 fit after the 14-byte header.
    const rows = Array.from({ length: 200 }, () => ['x' + 'é'.repeat(99)]);

    const text = describeSpreadsheetForAi('Program.xlsx', [{ name: 'Big', rows }], settings);

    const lines = text.slice(INTRO.length + 2).split('\n');
    expect(lines.length).toBe(1 + 119 + 1);
  });
});

import { describe, expect, it } from 'vitest';
import { JsonHubProtocol, MessageType } from '@microsoft/signalr';
import { aiPlanMigrations } from '@/models/storage/versions/migrations';
import { describeSpreadsheetForAi } from './describe-spreadsheet-for-ai';

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

  it.each([
    ['plain text', 'x'.repeat(96)],
    ['quotes', '"'.repeat(96)],
    ['backslashes', '\\'.repeat(96)],
    ['control characters', '\u0000\t\r\n'.repeat(24)],
    ['multibyte characters', 'é💪'.repeat(24)],
  ])('keeps complete rows of %s within the SignalR receive limit', (_, cell) => {
    const rows = Array.from({ length: 1_000 }, (_, i) => [String(i).padStart(4, '0'), cell, 'END']);
    const text = describeSpreadsheetForAi('Program.xlsx', [{ name: 'Big', rows }], settings);

    expect(signalRBytes(text)).toBeLessThanOrEqual(32_768);
    expect(text).toContain(INTRO);
    expect(text).toContain('## Sheet: Big');
    expect(text.endsWith(TRUNCATED_NOTE)).toBe(true);
    const csv = text.slice((INTRO + '\n\n## Sheet: Big\n').length, -(TRUNCATED_NOTE.length + 1));
    const csvCell = /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
    const rowCount = csv.match(/,END/g)?.length ?? 0;
    expect(rowCount).toBeGreaterThan(0);
    expect(rowCount).toBeLessThan(rows.length);
    expect(csv).toBe(
      rows
        .slice(0, rowCount)
        .map(([id]) => `${id},${csvCell},END`)
        .join('\n'),
    );
  });

  it('includes escaped sheet names and the instructions in the send budget', () => {
    const text = describeSpreadsheetForAi(
      'Program.xlsx',
      [
        { name: 'Days', rows: [['Squat', '5x5']] },
        { name: '\u0000'.repeat(6_000), rows: [['Bench', '3x8']] },
      ],
      settings,
    );

    expect(signalRBytes(text)).toBeLessThanOrEqual(32_768);
    expect(text).toContain(INTRO + '\n\n## Sheet: Days\nSquat,5x5');
    expect(text).not.toContain('Bench');
    expect(text.endsWith(TRUNCATED_NOTE)).toBe(true);
  });

  it('bounds an oversized filename while keeping the instructions and spreadsheet useful', () => {
    const text = describeSpreadsheetForAi(
      '\u0000"\\💪'.repeat(6_000) + '.xlsx',
      [{ name: 'Days', rows: [['Squat', '5x5']] }],
      settings,
    );

    expect(signalRBytes(text)).toBeLessThanOrEqual(32_768);
    expect(text).toContain('Turn it into a plan with the create_workout_plan tool');
    expect(text).toContain('Reply in my locale, en-GB. My preferred weight unit is kilograms.');
    expect(text).toContain('## Sheet: Days\nSquat,5x5');
  });
});

const TRUNCATED_NOTE = '(The spreadsheet was cut short here because it is too long to send in full.)';

function signalRBytes(message: string): number {
  const wireMessage = new JsonHubProtocol().writeMessage({
    type: MessageType.Invocation,
    target: 'SendMessage',
    invocationId: '0',
    arguments: [message, aiPlanMigrations.latestVersion],
  });
  return new TextEncoder().encode(wireMessage).length;
}

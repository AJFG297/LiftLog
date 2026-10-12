import type { LoadUnit } from '@/models/weight';
import type { Sheet } from './sheet';

/**
 * The backend's SignalR hub keeps its default 32 KB receive limit, and a message over it drops the
 * connection. Cap the complete JSON-escaped prompt, leaving room for the invocation envelope.
 */
export const MAX_SPREADSHEET_AI_BYTES = 24_000;

const TRUNCATED_NOTE = '(The spreadsheet was cut short here because it is too long to send in full.)';

const encoder = new TextEncoder();
const byteLengthOf = (text: string) => encoder.encode(JSON.stringify(text)).length - 2;

function toCsvCell(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

const isEmptyRow = (row: string[]) => row.every((cell) => cell.trim() === '');

/**
 * The text sent to the AI planner for a spreadsheet the routine table parser could not read: what to
 * do with it, then each sheet as CSV. This chat skips the planner's introduction, which is where the
 * server normally learns the user's locale and weight unit, so they are stated here instead.
 */
export function describeSpreadsheetForAi(
  fileName: string,
  sheets: Sheet[],
  { locale, preferredWeightUnit }: { locale: string; preferredWeightUnit: LoadUnit },
): string {
  const intro =
    `Here is a workout program from a spreadsheet, "${fileName.slice(0, 1_000)}". ` +
    'Turn it into a plan with the create_workout_plan tool: one routine per training day, ' +
    'exercise names kept exactly as written, and anything the plan cannot express, such as percentages ' +
    "or weights, in that exercise's notes.\n" +
    `Reply in my locale, ${locale}. My preferred weight unit is ${preferredWeightUnit}.`;

  const lines: string[] = [];
  // Reserve separators and the truncation note before accepting any complete rows.
  let bytes = byteLengthOf(intro + '\n\n' + TRUNCATED_NOTE);
  let truncated = false;
  // Only whole rows go in, so the AI never reads half a row as if it were complete.
  const tryAdd = (line: string) => {
    const lineBytes = byteLengthOf(line + '\n');
    if (bytes + lineBytes > MAX_SPREADSHEET_AI_BYTES) {
      truncated = true;
      return false;
    }
    lines.push(line);
    bytes += lineBytes;
    return true;
  };

  for (const sheet of sheets) {
    const rows = sheet.rows.filter((row) => !isEmptyRow(row));
    if (!rows.length) {
      continue;
    }
    // A CSV's one sheet has no name.
    const heading = sheet.name ? `## Sheet: ${sheet.name}` : '## Sheet';
    if ((lines.length && !tryAdd('')) || !tryAdd(heading)) {
      break;
    }
    if (!rows.every((row) => tryAdd(row.map(toCsvCell).join(',')))) {
      break;
    }
  }
  if (truncated) {
    lines.push(TRUNCATED_NOTE);
  }

  return `${intro}\n\n${lines.join('\n')}`;
}

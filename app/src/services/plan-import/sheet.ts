/**
 * One sheet of a spreadsheet as plain text. A workbook is a `Sheet[]`, in tab order; a CSV is one sheet.
 * Each cell holds the value the file stores for it (a number as its number text, a formula as its last
 * computed value), and trailing empty cells and rows are dropped.
 */
export interface Sheet {
  name: string;
  rows: string[][];
}

/**
 * Caps on what a spreadsheet may unpack to. A routine is a few dozen rows, so these only stop a hostile
 * or runaway file: past the byte cap the import is refused, and rows or columns past theirs are dropped.
 */
export const MAX_SPREADSHEET_BYTES = 20 * 1024 * 1024;
export const MAX_SHEET_ROWS = 5_000;
export const MAX_SHEET_COLUMNS = 100;
/** Sheets past this many are dropped. */
export const MAX_SHEETS = 50;
/** A longer cell is cut short: no routine cell is this long, and it keeps one huge shared string cheap. */
export const MAX_CELL_CHARS = 1_000;
/**
 * Every cell of an .xlsx may point at the same shared string, so the unpacked text can outgrow the file.
 * Past these totals across all sheets the import is refused.
 */
export const MAX_TOTAL_CELLS = 200_000;
export const MAX_TOTAL_CELL_CHARS = MAX_SPREADSHEET_BYTES;

/** The spreadsheet would unpack past {@link MAX_SPREADSHEET_BYTES}. */
export class SpreadsheetTooLargeError extends Error {
  override name = 'SpreadsheetTooLargeError';
}

const isBlank = (cell: string | undefined) => !cell || cell.trim() === '';

/** Drops the empty cells at the end of each row, then the empty rows at the end of the sheet. */
export function trimSheetRows(rows: (string | undefined)[][]): string[][] {
  const trimmed = rows.map((row) => {
    let end = row.length;
    while (end > 0 && isBlank(row[end - 1])) {
      end--;
    }
    return Array.from({ length: end }, (_, i) => row[i] ?? '');
  });
  let end = trimmed.length;
  while (end > 0 && trimmed[end - 1]!.length === 0) {
    end--;
  }
  return trimmed.slice(0, end);
}

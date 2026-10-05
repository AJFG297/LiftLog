import Papa from 'papaparse';
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type Sheet, trimSheetRows } from './sheet';

/**
 * Reads CSV text as a single unnamed sheet. Papa handles quoted fields, commas and line breaks inside
 * quotes, CRLF, and guesses the delimiter, so a semicolon-separated export from a European locale reads too.
 */
export function readCsv(text: string): Sheet[] {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { header: false, skipEmptyLines: false });
  const rows = parsed.data
    .slice(0, MAX_SHEET_ROWS)
    .filter((row): row is string[] => Array.isArray(row))
    .map((row) => row.slice(0, MAX_SHEET_COLUMNS));
  return [{ name: '', rows: trimSheetRows(rows) }];
}

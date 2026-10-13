import { strFromU8 } from 'fflate';
import { readCsv } from './read-csv';
import { readXlsx } from './read-xlsx';
import { MAX_SPREADSHEET_BYTES, type Sheet, SpreadsheetTooLargeError } from './sheet';

/** A file handed to import. `name` is missing when the OS opened the file without one. */
export interface ImportFile {
  name?: string;
  bytes: Uint8Array;
}

/**
 * What an imported file holds. `legacySpreadsheet` is a spreadsheet LiftLog cannot open (.xls, Numbers,
 * OpenDocument), which the user can fix by saving it again as .xlsx or .csv.
 */
export type ImportFileKind = 'liftlogplan' | 'xlsx' | 'csv' | 'legacySpreadsheet';

export type SpreadsheetKind = Extract<ImportFileKind, 'xlsx' | 'csv'>;

const KIND_BY_EXTENSION: Record<string, ImportFileKind> = {
  liftlogplan: 'liftlogplan',
  json: 'liftlogplan',
  xlsx: 'xlsx',
  xlsm: 'xlsx',
  csv: 'csv',
  tsv: 'csv',
  xls: 'legacySpreadsheet',
  numbers: 'legacySpreadsheet',
  ods: 'legacySpreadsheet',
};

const SHEET_READERS: Record<SpreadsheetKind, (bytes: Uint8Array) => Sheet[]> = {
  xlsx: readXlsx,
  csv: (bytes) => {
    if (bytes.length > MAX_SPREADSHEET_BYTES) {
      throw new SpreadsheetTooLargeError(`The CSV is ${bytes.length} bytes, past ${MAX_SPREADSHEET_BYTES}.`);
    }
    return readCsv(strFromU8(bytes));
  },
};

const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((byte, i) => bytes[i] === byte);
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
/** The OLE compound-file header that a legacy .xls starts with. */
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

export function fileExtensionOf(name: string | undefined): string | undefined {
  const match = name?.match(/\.([^./\\]+)$/);
  return match?.[1]?.toLowerCase();
}

/** The file name without its extension, used as the plan's name. */
export function fileBaseNameOf(name: string | undefined): string {
  return (name ?? '')
    .replace(/^.*[/\\]/, '')
    .replace(/\.[^.]+$/, '')
    .trim();
}

/**
 * Decides what a file holds from its extension, or, when there is no name or an extension LiftLog does
 * not know, from its first bytes. Anything unrecognised is treated as a plan file, so the plan parser
 * gives the familiar "not a valid workout plan" message.
 */
export function importFileKindOf(file: ImportFile): ImportFileKind {
  const byExtension = KIND_BY_EXTENSION[fileExtensionOf(file.name) ?? ''];
  if (byExtension) {
    return byExtension;
  }
  if (startsWith(file.bytes, ZIP_MAGIC)) {
    return 'xlsx';
  }
  if (startsWith(file.bytes, OLE_MAGIC)) {
    return 'legacySpreadsheet';
  }
  return 'liftlogplan';
}

export type SheetReadResult =
  | { ok: true; sheets: Sheet[] }
  /** `error` is diagnostic detail for the log, never for the user. */
  | { ok: false; failure: 'unreadableSpreadsheet' | 'spreadsheetTooLarge'; error: string };

/** Reads a spreadsheet's sheets with the reader for its kind. */
export function readSheets(kind: SpreadsheetKind, bytes: Uint8Array): SheetReadResult {
  try {
    return { ok: true, sheets: SHEET_READERS[kind](bytes) };
  } catch (e) {
    const failure = e instanceof SpreadsheetTooLargeError ? 'spreadsheetTooLarge' : 'unreadableSpreadsheet';
    return { ok: false, failure, error: String(e) };
  }
}

import type { ProgramBlueprint } from '@/models/blueprint-models';
import { parseProgramBlueprintFile, type PlanFileFailure } from '@/models/plan-file';
import { parseRoutineSheets } from './routine-sheets';
import type { Sheet } from './sheet';
import { fileBaseNameOf, type ImportFile, importFileKindOf, readSheets } from './sheet-readers';

/** Why a file could not become a plan. Each has its own message for the user. */
export type PlanImportFailure =
  | PlanFileFailure
  | 'legacySpreadsheet'
  | 'unreadableSpreadsheet'
  | 'spreadsheetTooLarge'
  | 'noRoutineTable';

export type PlanImportResult =
  | { ok: true; blueprint: ProgramBlueprint }
  /**
   * The spreadsheet opened but holds no table the parser recognises. Its `sheets` are what a smarter
   * reader (such as the AI planner) can still try.
   */
  | { ok: false; failure: 'noRoutineTable'; sheets: Sheet[]; planName: string; error: string }
  /** `error` is diagnostic detail for the log, never for the user. */
  | { ok: false; failure: Exclude<PlanImportFailure, 'noRoutineTable'>; error: string };

/**
 * Turns an imported file into a plan: a `.liftlogplan` through the plan file parser, an .xlsx or .csv
 * through the routine table parser. The plan from a spreadsheet is named after the file.
 */
export function parsePlanImport(file: ImportFile): PlanImportResult {
  const kind = importFileKindOf(file);
  if (kind === 'liftlogplan') {
    return parseProgramBlueprintFile(file.bytes);
  }
  if (kind === 'legacySpreadsheet') {
    return { ok: false, failure: 'legacySpreadsheet', error: `Cannot read ${file.name ?? 'an unnamed file'}.` };
  }
  const read = readSheets(kind, file.bytes);
  if (!read.ok) {
    return read;
  }
  const planName = fileBaseNameOf(file.name) || read.sheets[0]?.name || '';
  const parsed = parseRoutineSheets(read.sheets, planName);
  if (!parsed.ok) {
    return {
      ok: false,
      failure: parsed.failure,
      sheets: read.sheets,
      planName,
      error: 'No sheet has a header row with an exercise column and a sets, reps or sets x reps column.',
    };
  }
  return parsed;
}

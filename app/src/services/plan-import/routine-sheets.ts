import {
  ProgramBlueprint,
  ProgressionRule,
  Rest,
  SessionBlueprint,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { withMinRest } from '@/models/rest-default';
import { LocalDate } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import {
  parseRepsCell,
  parseRestCell,
  parseSetsCell,
  parseSetsXRepsCell,
  type ParsedReps,
  type RestUnitHint,
} from './routine-cells';
import type { Sheet } from './sheet';

type RoutineField = 'routine' | 'exercise' | 'sets' | 'reps' | 'setsXReps' | 'weight' | 'rest' | 'notes';

/** Header spellings per field, compared after {@link normalizeHeader}. The first matching column wins. */
const COLUMN_ALIASES: Record<RoutineField, string[]> = {
  routine: [
    'day',
    'routine',
    'workout',
    'session',
    'routine name',
    'workout name',
    'day name',
    'training day',
    'workout day',
  ],
  exercise: ['exercise', 'exercises', 'exercise name', 'movement', 'lift', 'name'],
  sets: ['sets', 'set', 'no of sets', 'number of sets', 'working sets'],
  reps: ['reps', 'rep', 'rep range', 'repetitions', 'target reps', 'reps per set'],
  setsXReps: ['sets x reps', 'sets reps', 'setsxreps', 'scheme', 'prescription', 'set x rep', 'sets and reps'],
  weight: ['weight', 'load', 'kg', 'lbs', 'lb', 'weight kg', 'weight lbs', 'weight lb'],
  rest: [
    'rest',
    'rest time',
    'rest period',
    'rest sec',
    'rest secs',
    'rest seconds',
    'rest s',
    'rest min',
    'rest mins',
    'rest minutes',
  ],
  notes: ['notes', 'note', 'comments', 'comment', 'cues', 'instructions'],
};

/** Lowercase words only: `Weight (kg)` -> `weight kg`, `Sets×Reps` -> `sets x reps`, `No. of sets` -> `no of sets`. */
function normalizeHeader(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/\u00d7/g, ' x ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const FIELD_BY_ALIAS = new Map(
  (Object.entries(COLUMN_ALIASES) as [RoutineField, string[]][]).flatMap(([field, aliases]) =>
    aliases.map((alias) => [normalizeHeader(alias), field] as const),
  ),
);

/** A header row is looked for this far down a sheet, past a title or a blank line or two. */
const HEADER_SEARCH_ROWS = 10;

interface Header {
  columns: Partial<Record<RoutineField, number>>;
  /** The header text as written, to label values that are kept as notes (`Weight (kg): 60`). */
  labels: string[];
  restUnit: RestUnitHint;
}

function headerOf(row: string[]): Header | undefined {
  const columns: Partial<Record<RoutineField, number>> = {};
  row.forEach((cell, index) => {
    const field = FIELD_BY_ALIAS.get(normalizeHeader(cell));
    if (field && columns[field] === undefined) {
      columns[field] = index;
    }
  });
  const hasScheme = columns.sets !== undefined || columns.reps !== undefined || columns.setsXReps !== undefined;
  if (columns.exercise === undefined || !hasScheme) {
    return undefined;
  }
  const restWords = columns.rest === undefined ? [] : normalizeHeader(row[columns.rest]!).split(' ');
  const restUnit = restWords.some((w) => w.startsWith('min'))
    ? 'minutes'
    : restWords.some((w) => w === 's' || w.startsWith('sec'))
      ? 'seconds'
      : undefined;
  return { columns, labels: row.map((cell) => cell.trim()), restUnit };
}

/** A row holding a single filled cell, like `Day 2 - Pull` above a repeated header. */
function titleOf(row: string[] | undefined): string | undefined {
  const filled = row?.map((cell) => cell.trim()).filter(Boolean) ?? [];
  return filled.length === 1 ? filled[0] : undefined;
}

/** One header row and the rows under it, up to the next header. */
interface Block {
  header: Header;
  rows: string[][];
  title?: string;
}

/**
 * The tables on a sheet. The first header must be near the top; after it, every row that reads as a
 * header starts another table, and a single-cell row just above that header names it. This is how
 * programs laid out as one sheet with a table per day read.
 */
function blocksOf(sheet: Sheet): Block[] {
  const blocks: Block[] = [];
  sheet.rows.forEach((row, index) => {
    const header = blocks.length > 0 || index < HEADER_SEARCH_ROWS ? headerOf(row) : undefined;
    if (header) {
      let above = index - 1;
      while (above >= 0 && sheet.rows[above]!.every((cell) => !cell.trim())) {
        above--;
      }
      const title = titleOf(sheet.rows[above]);
      const previous = blocks[blocks.length - 1];
      if (previous && title !== undefined && above >= 0) {
        // The title row was read as part of the previous table; it belongs to this one.
        previous.rows = previous.rows.filter((r) => r !== sheet.rows[above]);
      }
      blocks.push({ header, rows: [], title });
    } else {
      blocks[blocks.length - 1]?.rows.push(row);
    }
  });
  return blocks;
}

const cellAt = (row: string[], column: number | undefined) => (column === undefined ? '' : (row[column] ?? '').trim());

function exerciseFrom(row: string[], header: Header): WeightedExerciseBlueprint {
  const { columns, labels } = header;
  const cell = (field: RoutineField) => cellAt(row, columns[field]);
  const notes: string[] = [];
  const keepAsNote = (field: RoutineField) => {
    if (cell(field)) {
      notes.push(`${labels[columns[field]!] || field}: ${cell(field)}`);
    }
  };

  // A scheme like `3x8` is read from whichever of these columns holds it.
  const schemeField = (['setsXReps', 'sets', 'reps'] as const).find((field) => parseSetsXRepsCell(cell(field)));
  const scheme = schemeField ? parseSetsXRepsCell(cell(schemeField)) : undefined;
  const reps: ParsedReps | undefined = scheme ?? parseRepsCell(cell('reps'));
  if (!reps || !reps.exact) {
    keepAsNote(schemeField ?? (cell('reps') ? 'reps' : 'setsXReps'));
  }
  const sets = scheme?.sets ?? parseSetsCell(cell('sets')) ?? reps?.sets;
  const rest = parseRestCell(cell('rest'), header.restUnit);
  // A routine has no starting weight, so the weight is kept where the user will see it.
  keepAsNote('weight');

  return WeightedExerciseBlueprint.of({
    name: cell('exercise'),
    sets,
    repsConfig: reps?.reps,
    restBetweenSets: rest ? withMinRest(Rest.medium, rest) : Rest.medium,
    notes: [cell('notes'), ...notes].filter(Boolean).join('\n'),
    progression: [ProgressionRule.load(new BigNumber(2.5))],
  });
}

const GENERIC_SHEET_NAME = /^(?:sheet|tab|blad|feuil|tabelle|hoja|foglio)\s*\d*$/i;

export type RoutineSheetFailure = 'noRoutineTable';

export type RoutineSheetResult =
  | { ok: true; blueprint: ProgramBlueprint }
  | { ok: false; failure: RoutineSheetFailure };

/**
 * Turns the sheets of a spreadsheet into a plan, one routine per training day. A table is found by its
 * header row, which needs an exercise column and at least one of sets, reps or sets x reps. A routine
 * column names each row's routine, a blank cell carrying the one above down; without one, each table is
 * a routine named by the title above it, or by its sheet. A lone routine on a sheet called `Sheet1`, or
 * from a CSV, takes the plan's name.
 */
export function parseRoutineSheets(sheets: Sheet[], planName: string): RoutineSheetResult {
  // `fromSheet` marks a routine named after its sheet rather than by the user.
  const routines = new Map<string, { name: string; fromSheet: boolean; exercises: WeightedExerciseBlueprint[] }>();

  for (const sheet of sheets) {
    const blocks = blocksOf(sheet);
    for (const block of blocks) {
      const title = blocks.length > 1 ? block.title : undefined;
      let routineName = '';
      for (const row of block.rows) {
        routineName = cellAt(row, block.header.columns.routine) || routineName;
        const exerciseName = cellAt(row, block.header.columns.exercise);
        if (!exerciseName) {
          continue;
        }
        const name = routineName || title || sheet.name.trim();
        const key = name.toLowerCase();
        if (!routines.has(key)) {
          routines.set(key, { name, fromSheet: !routineName && !title, exercises: [] });
        }
        routines.get(key)!.exercises.push(exerciseFrom(row, block.header));
      }
    }
  }

  if (routines.size === 0) {
    return { ok: false, failure: 'noRoutineTable' };
  }
  const sessions = Array.from(routines.values(), ({ name, fromSheet, exercises }) => {
    const takesPlanName = routines.size === 1 && fromSheet && (!name || GENERIC_SHEET_NAME.test(name));
    return new SessionBlueprint(takesPlanName ? planName : name, exercises, '');
  });
  return { ok: true, blueprint: new ProgramBlueprint(planName, sessions, LocalDate.now()) };
}

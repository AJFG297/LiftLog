import { strFromU8, unzipSync, type UnzipFileInfo } from 'fflate';
import {
  MAX_CELL_CHARS,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  MAX_SHEETS,
  MAX_SPREADSHEET_BYTES,
  MAX_TOTAL_CELL_CHARS,
  MAX_TOTAL_CELLS,
  type Sheet,
  SpreadsheetTooLargeError,
  trimSheetRows,
} from './sheet';

/*
 * An .xlsx file is a zip of XML parts. Only four kinds are read: the workbook (sheet names and tab
 * order), its relationships (where each sheet's part lives), the shared strings, and the worksheets.
 * Styles are ignored, so a cell reads as the value the file stores, not as Excel would format it.
 *
 * The file is untrusted, so the XML is walked with indexOf rather than regular expressions over tags,
 * keeping every scan linear in the size of the part however it is malformed. Any element may carry a
 * namespace prefix (`<x:c>`), which is ignored when matching names.
 */

const XML_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeXml(text: string): string {
  if (!text.includes('&') && !text.includes('_x')) {
    return text;
  }
  return (
    text
      .replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|lt|gt|amp|quot|apos);/g, (whole, entity: string) => {
        if (!entity.startsWith('#')) {
          return XML_ENTITIES[entity]!;
        }
        const code = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
      })
      // OOXML's own escape for characters XML cannot hold, such as `_x000D_` for a carriage return.
      .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
  );
}

const isSpace = (ch: string | undefined) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

/** Attributes of an opening tag's text (`r="A1" t='s'`), by qualified name. Malformed text ends the scan. */
function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;
  const skipSpace = () => {
    while (i < tag.length && isSpace(tag[i])) {
      i++;
    }
  };
  while (i < tag.length) {
    skipSpace();
    const nameStart = i;
    while (i < tag.length && tag[i] !== '=' && !isSpace(tag[i])) {
      i++;
    }
    const name = tag.slice(nameStart, i);
    skipSpace();
    if (!name || tag[i] !== '=') {
      break;
    }
    i++;
    skipSpace();
    const quote = tag[i];
    const valueEnd = quote === '"' || quote === "'" ? tag.indexOf(quote, i + 1) : -1;
    if (valueEnd < 0) {
      break;
    }
    result[name] = decodeXml(tag.slice(i + 1, valueEnd));
    i = valueEnd + 1;
  }
  return result;
}

interface XmlElement {
  attrs: string;
  inner: string;
  start: number;
  end: number;
}

const localName = (qualified: string) => qualified.slice(qualified.indexOf(':') + 1);

/**
 * Each `<name …>…</name>` or `<name …/>` in document order, with its attribute text and inner XML. An
 * element of the same name nested in another is not found on its own. An element that is never closed
 * ends the scan, since nothing after it can be closed either.
 */
function elements(xml: string, name: string): XmlElement[] {
  const found: XmlElement[] = [];
  let pos = 0;
  while (pos < xml.length) {
    const start = xml.indexOf('<', pos);
    if (start < 0) {
      break;
    }
    let nameEnd = start + 1;
    while (nameEnd < xml.length && !isSpace(xml[nameEnd]) && xml[nameEnd] !== '/' && xml[nameEnd] !== '>') {
      nameEnd++;
    }
    const qualified = xml.slice(start + 1, nameEnd);
    if (localName(qualified) !== name) {
      pos = nameEnd;
      continue;
    }
    const tagEnd = xml.indexOf('>', nameEnd);
    if (tagEnd < 0) {
      break;
    }
    if (xml[tagEnd - 1] === '/') {
      found.push({ attrs: xml.slice(nameEnd, tagEnd - 1), inner: '', start, end: tagEnd + 1 });
      pos = tagEnd + 1;
      continue;
    }
    const closing = `</${qualified}>`;
    const closeStart = xml.indexOf(closing, tagEnd + 1);
    if (closeStart < 0) {
      break;
    }
    const end = closeStart + closing.length;
    found.push({ attrs: xml.slice(nameEnd, tagEnd), inner: xml.slice(tagEnd + 1, closeStart), start, end });
    pos = end;
  }
  return found;
}

/** The concatenated text runs (`<t>`) inside an element, leaving out phonetic guides (`<rPh>`). */
function textOf(xml: string): string {
  let withoutPhonetics = '';
  let last = 0;
  for (const phonetic of elements(xml, 'rPh')) {
    withoutPhonetics += xml.slice(last, phonetic.start);
    last = phonetic.end;
  }
  withoutPhonetics += xml.slice(last);
  return elements(withoutPhonetics, 't')
    .map((t) => decodeXml(t.inner))
    .join('');
}

/** Resolves a relationship target, which is relative to `xl/` unless it starts with `/`. */
function resolveTarget(target: string): string {
  const parts = target.startsWith('/') ? [] : ['xl'];
  for (const segment of target.split('/')) {
    if (segment === '..') {
      parts.pop();
    } else if (segment && segment !== '.') {
      parts.push(segment);
    }
  }
  return parts.join('/');
}

/**
 * `B12` -> 1 (zero-based column), or undefined for a missing or malformed reference. Anything past the
 * column cap comes back as the cap, so `XFD1` is dropped rather than turned into a huge index.
 */
function columnIndexOf(ref: string | undefined): number | undefined {
  const letters = ref?.match(/^([A-Za-z]{1,3})\d*$/)?.[1];
  if (!letters) {
    return undefined;
  }
  let index = 0;
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return Math.min(index - 1, MAX_SHEET_COLUMNS);
}

function cellText(attrs: Record<string, string>, inner: string, sharedStrings: string[]): string {
  const raw = elements(inner, 'v')[0]?.inner;
  switch (attrs['t']) {
    case 's':
      return sharedStrings[Number(raw)] ?? '';
    case 'inlineStr':
      return textOf(elements(inner, 'is')[0]?.inner ?? '');
    case 'b':
      return raw === undefined ? '' : raw.trim() === '1' ? 'TRUE' : 'FALSE';
    default:
      return raw === undefined ? '' : decodeXml(raw);
  }
}

/** What the cells read so far may still take, shared across every sheet of the workbook. */
interface CellBudget {
  cells: number;
  chars: number;
}

function readWorksheet(xml: string, sharedStrings: string[], budget: CellBudget): string[][] {
  const sheetData = elements(xml, 'sheetData')[0]?.inner ?? '';
  const rows = new Map<number, string[]>();
  let nextRow = 0;
  for (const row of elements(sheetData, 'row')) {
    const rowNumber = Number(attributes(row.attrs)['r']);
    const rowIndex = Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber - 1 : nextRow;
    nextRow = rowIndex + 1;
    if (rowIndex >= MAX_SHEET_ROWS) {
      break;
    }
    const cells: string[] = [];
    let nextColumn = 0;
    for (const cell of elements(row.inner, 'c')) {
      const attrs = attributes(cell.attrs);
      const column = columnIndexOf(attrs['r']) ?? nextColumn;
      nextColumn = column + 1;
      if (column < MAX_SHEET_COLUMNS) {
        const text = cellText(attrs, cell.inner, sharedStrings).slice(0, MAX_CELL_CHARS);
        budget.cells -= 1;
        budget.chars -= text.length;
        if (budget.cells < 0 || budget.chars < 0) {
          throw new SpreadsheetTooLargeError('The workbook holds more cells or text than a routine import reads.');
        }
        cells[column] = text;
      }
    }
    rows.set(rowIndex, cells);
  }
  let rowCount = 0;
  for (const index of rows.keys()) {
    rowCount = Math.max(rowCount, index + 1);
  }
  return trimSheetRows(Array.from({ length: rowCount }, (_, i) => rows.get(i) ?? []));
}

/**
 * Inflates only the named parts. fflate inflates each entry into a buffer of the size the zip declares
 * for it and never grows it, so checking the declared sizes before inflating bounds the memory a zip
 * bomb can take.
 */
function unzipParts(bytes: Uint8Array, wanted: Set<string>, budget: { remaining: number }): Record<string, string> {
  const parts = unzipSync(bytes, {
    filter: (file: UnzipFileInfo) => {
      if (!wanted.has(file.name)) {
        return false;
      }
      budget.remaining -= file.originalSize;
      if (budget.remaining < 0) {
        throw new SpreadsheetTooLargeError(`Unzipping ${file.name} would pass ${MAX_SPREADSHEET_BYTES} bytes.`);
      }
      return true;
    },
  });
  return Object.fromEntries(Object.entries(parts).map(([name, data]) => [name, strFromU8(data)]));
}

/**
 * Reads every visible worksheet of an .xlsx file, in tab order. Throws {@link SpreadsheetTooLargeError}
 * when the parts it needs unzip past {@link MAX_SPREADSHEET_BYTES}, and another error when the bytes are
 * not a zip or the zip holds no Excel workbook.
 */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  const budget = { remaining: MAX_SPREADSHEET_BYTES };
  const index = unzipParts(
    bytes,
    new Set(['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml']),
    budget,
  );
  const workbook = index['xl/workbook.xml'];
  if (workbook === undefined) {
    throw new Error('The zip holds no xl/workbook.xml, so it is not an Excel workbook.');
  }

  const targets = new Map<string, string>();
  for (const rel of elements(index['xl/_rels/workbook.xml.rels'] ?? '', 'Relationship')) {
    const attrs = attributes(rel.attrs);
    if (attrs['Id'] && attrs['Target']) {
      targets.set(attrs['Id'], resolveTarget(attrs['Target']));
    }
  }
  const sharedStrings = elements(index['xl/sharedStrings.xml'] ?? '', 'si').map((si) =>
    textOf(si.inner).slice(0, MAX_CELL_CHARS),
  );

  const listedSheets = elements(workbook, 'sheet').flatMap((sheet, position) => {
    const attrs = attributes(sheet.attrs);
    if (attrs['state'] === 'hidden' || attrs['state'] === 'veryHidden') {
      return [];
    }
    const relationId = Object.entries(attrs).find(([key]) => localName(key) === 'id')?.[1];
    const path = (relationId && targets.get(relationId)) ?? `xl/worksheets/sheet${position + 1}.xml`;
    return [{ name: attrs['name'] ?? `Sheet${position + 1}`, path }];
  });
  // A real workbook gives each sheet its own part; one part listed again would be read again for nothing.
  const seenPaths = new Set<string>();
  const sheets = listedSheets.filter(({ path }) => !seenPaths.has(path) && seenPaths.add(path)).slice(0, MAX_SHEETS);

  const worksheets = unzipParts(bytes, new Set(sheets.map((s) => s.path)), budget);
  const cellBudget: CellBudget = { cells: MAX_TOTAL_CELLS, chars: MAX_TOTAL_CELL_CHARS };
  return sheets.map(({ name, path }) => {
    const xml = worksheets[path];
    return { name, rows: xml === undefined ? [] : readWorksheet(xml, sharedStrings, cellBudget) };
  });
}

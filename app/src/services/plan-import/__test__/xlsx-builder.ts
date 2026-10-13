import { strToU8 as fflateStrToU8, zipSync } from 'fflate';

/**
 * fflate tells a file from a folder with `instanceof Uint8Array`, which the bytes it makes fail under
 * jsdom (another realm), so they are copied into this realm's Uint8Array first.
 */
export const strToU8 = (text: string) => new Uint8Array(fflateStrToU8(text));

/**
 * A cell as a spreadsheet app writes it: a string goes to the shared strings, a number is stored as a
 * number, `rich` is a shared string split into formatted runs, `inline` an inline string, and `formula`
 * a formula with its cached value. `undefined` leaves the cell out entirely.
 */
export type TestCell =
  | string
  | number
  | undefined
  | { rich: string[] }
  | { inline: string }
  | { formula: string; cached: string; type?: 'str' };

export interface TestSheet {
  name: string;
  rows: TestCell[][];
  hidden?: boolean;
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Builds the bytes of an .xlsx workbook, laid out the way Excel and Google Sheets export one. */
export function buildXlsx(sheets: TestSheet[]): Uint8Array {
  const sharedStrings: string[] = [];
  const share = (si: string) => {
    sharedStrings.push(si);
    return sharedStrings.length - 1;
  };

  const sheetXml = (sheet: TestSheet) => {
    const rows = sheet.rows
      .map((row, r) => {
        const cells = row
          .map((cell, c) => {
            const ref = `${columnName(c)}${r + 1}`;
            if (cell === undefined) {
              return '';
            }
            if (typeof cell === 'number') {
              return `<c r="${ref}"><v>${cell}</v></c>`;
            }
            if (typeof cell === 'string') {
              return `<c r="${ref}" t="s"><v>${share(`<t xml:space="preserve">${escapeXml(cell)}</t>`)}</v></c>`;
            }
            if ('rich' in cell) {
              const runs = cell.rich.map((run, i) => `<r><rPr><b val="${i % 2}"/></rPr><t>${escapeXml(run)}</t></r>`);
              return `<c r="${ref}" t="s"><v>${share(runs.join(''))}</v></c>`;
            }
            if ('inline' in cell) {
              return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell.inline)}</t></is></c>`;
            }
            const type = cell.type ? ` t="${cell.type}"` : '';
            return `<c r="${ref}"${type}><f>${escapeXml(cell.formula)}</f><v>${escapeXml(cell.cached)}</v></c>`;
          })
          .join('');
        return `<row r="${r + 1}">${cells}</row>`;
      })
      .join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="20"/></cols><sheetData>${rows}</sheetData></worksheet>`;
  };

  // Sheets are stored in reverse so the reader has to follow the relationships, not the file names.
  const files: Record<string, Uint8Array> = {};
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${sheets.length - i}.xml`] = strToU8(sheetXml(sheet));
  });

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map(
      (sheet, i) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}"${sheet.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`,
    )
    .join('')}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheets.length - i}.xml"/>`,
    )
    .join(
      '',
    )}<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const strings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${sharedStrings
    .map((si) => `<si>${si}</si>`)
    .join('')}</sst>`;

  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types/>'),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(rels),
    'xl/sharedStrings.xml': strToU8(strings),
    ...files,
  });
}

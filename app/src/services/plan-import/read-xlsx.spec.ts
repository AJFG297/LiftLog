import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildXlsx, strToU8 } from './__test__/xlsx-builder';
import { readXlsx } from './read-xlsx';
import { SpreadsheetTooLargeError } from './sheet';

describe('readXlsx', () => {
  it('reads sheets in tab order with their names, following the workbook relationships', () => {
    const sheets = readXlsx(
      buildXlsx([
        {
          name: 'Push',
          rows: [
            ['Exercise', 'Sets'],
            ['Bench Press', 3],
          ],
        },
        {
          name: 'Pull',
          rows: [
            ['Exercise', 'Sets'],
            ['Row', 4],
          ],
        },
      ]),
    );

    expect(sheets).toEqual([
      {
        name: 'Push',
        rows: [
          ['Exercise', 'Sets'],
          ['Bench Press', '3'],
        ],
      },
      {
        name: 'Pull',
        rows: [
          ['Exercise', 'Sets'],
          ['Row', '4'],
        ],
      },
    ]);
  });

  it('joins the formatted runs of a rich-text shared string', () => {
    const [sheet] = readXlsx(buildXlsx([{ name: 'Day', rows: [[{ rich: ['Incline ', 'Dumbbell', ' Press'] }]] }]));

    expect(sheet!.rows).toEqual([['Incline Dumbbell Press']]);
  });

  it('places cells by their reference, leaving gaps blank', () => {
    const [sheet] = readXlsx(buildXlsx([{ name: 'Day', rows: [['Squat', undefined, 5], [], [undefined, 'x']] }]));

    expect(sheet!.rows).toEqual([['Squat', '', '5'], [], ['', 'x']]);
  });

  it('reads inline strings, cached formula values and escaped characters', () => {
    const [sheet] = readXlsx(
      buildXlsx([
        {
          name: 'R&D <1>',
          rows: [
            [
              { inline: 'Curl & Press' },
              { formula: 'B1*2', cached: '6' },
              { formula: 'A1', cached: 'Row', type: 'str' },
            ],
          ],
        },
      ]),
    );

    expect(sheet).toEqual({ name: 'R&D <1>', rows: [['Curl & Press', '6', 'Row']] });
  });

  it('drops trailing blank cells and rows, and skips hidden sheets', () => {
    const sheets = readXlsx(
      buildXlsx([
        { name: 'Visible', rows: [['Squat', ' ', ''], ['', ''], [undefined]] },
        { name: 'Lookups', rows: [['x']], hidden: true },
      ]),
    );

    expect(sheets).toEqual([{ name: 'Visible', rows: [['Squat']] }]);
  });

  it('reads cells without a reference in order, and elements with a namespace prefix', () => {
    const workbook = `<x:workbook xmlns:x="main" xmlns:r="rel"><x:sheets><x:sheet name="Only" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`;
    const rels = `<Relationships><Relationship Id="rId1" Target="/xl/worksheets/only.xml"/></Relationships>`;
    const sheet = `<x:worksheet><x:sheetData><x:row><x:c t="inlineStr"><x:is><x:t>Dip</x:t></x:is></x:c><x:c><x:v>3</x:v></x:c><x:c t="b"><x:v>1</x:v></x:c></x:row></x:sheetData></x:worksheet>`;
    const bytes = zipSync({
      'xl/workbook.xml': strToU8(workbook),
      'xl/_rels/workbook.xml.rels': strToU8(rels),
      'xl/worksheets/only.xml': strToU8(sheet),
    });

    expect(readXlsx(bytes)).toEqual([{ name: 'Only', rows: [['Dip', '3', 'TRUE']] }]);
  });

  it('throws for a zip that is not a workbook, and for bytes that are not a zip', () => {
    expect(() => readXlsx(zipSync({ mimetype: strToU8('application/vnd.oasis.opendocument.spreadsheet') }))).toThrow();
    expect(() => readXlsx(strToU8('Exercise,Sets'))).toThrow();
  });

  /** A workbook with one visible sheet whose XML is `sheetXml`. */
  const oneSheet = (sheetXml: string | Uint8Array) =>
    zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Hostile" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      'xl/worksheets/sheet1.xml': typeof sheetXml === 'string' ? strToU8(sheetXml) : sheetXml,
    });

  const timed = <T>(read: () => T) => {
    const start = performance.now();
    const result = read();
    return { result, ms: performance.now() - start };
  };

  it.each([
    [
      'unclosed cells',
      `<worksheet><sheetData><row r="1">${'<c r="A1" t="s"><v>'.repeat(50_000)}</row></sheetData></worksheet>`,
    ],
    [
      'a 200 KB attribute',
      `<worksheet><sheetData><row r="1"><c r="A1" ${'x'.repeat(200_000)}><v>1</v></c></row></sheetData></worksheet>`,
    ],
    [
      'a 200 KB unquoted attribute value',
      `<worksheet><sheetData><row r="1"><c r=${'1'.repeat(200_000)}><v>1</v></c></row></sheetData></worksheet>`,
    ],
    ['an unclosed tag', `<worksheet><sheetData><row r="1"><c r="A1"${' a="b"'.repeat(40_000)}`],
    ['200 KB of open brackets', `<worksheet><sheetData>${'<'.repeat(200_000)}</sheetData></worksheet>`],
    [
      '200 KB of entities',
      `<worksheet><sheetData><row><c t="inlineStr"><is><t>${'&#x1'.repeat(50_000)}</t></is></c></row></sheetData></worksheet>`,
    ],
  ])('reads a sheet with %s in linear time', (_, xml) => {
    const { result, ms } = timed(() => readXlsx(oneSheet(xml)));

    expect(result[0]!.name).toBe('Hostile');
    expect(ms).toBeLessThan(1_000);
  });

  it('refuses a sheet that would unzip past the size cap, before inflating it', () => {
    // Zeros compress to almost nothing, so this is a small file that claims 21 MB once unzipped.
    const bytes = oneSheet(new Uint8Array(21 * 1024 * 1024));

    expect(bytes.length).toBeLessThan(100_000);
    expect(() => readXlsx(bytes)).toThrow(SpreadsheetTooLargeError);
  });

  it('never unzips parts outside the workbook, however large', () => {
    const bytes = zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets/></workbook>'),
      'xl/media/image1.png': new Uint8Array(21 * 1024 * 1024),
    });

    expect(readXlsx(bytes)).toEqual([]);
  });

  it('drops cells past the row and column caps instead of allocating for them', () => {
    const xml =
      '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Squat</t></is></c><c r="CW1"><v>100</v></c><c r="CV1"><v>99</v></c><c r="XFD1"><v>1</v></c></row>' +
      '<row r="5000"><c r="A5000"><v>5000</v></c></row>' +
      '<row r="1048576"><c r="A1048576"><v>2</v></c></row>' +
      '</sheetData></worksheet>';

    const { result, ms } = timed(() => readXlsx(oneSheet(xml)));

    expect(result[0]!.rows.length).toBe(5_000);
    expect(result[0]!.rows[0]).toEqual(['Squat', ...Array<string>(98).fill(''), '99']);
    expect(result[0]!.rows[4_999]).toEqual(['5000']);
    expect(ms).toBeLessThan(1_000);
  });

  const rawWorkbook = (sheetXml: string, sharedStrings: string[], sheetEntries: number) =>
    zipSync({
      'xl/workbook.xml': strToU8(
        `<workbook><sheets>${'<sheet name="Day" r:id="rId1"/>'.repeat(sheetEntries)}</sheets></workbook>`,
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      'xl/sharedStrings.xml': strToU8(`<sst>${sharedStrings.map((text) => `<si><t>${text}</t></si>`).join('')}</sst>`),
      'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${sheetXml}</sheetData></worksheet>`),
    });

  it('reads a sheet part once, however many times the workbook lists it', () => {
    const result = readXlsx(rawWorkbook('<row r="1"><c r="A1" t="s"><v>0</v></c></row>', ['Squat'], 300));

    expect(result).toEqual([{ name: 'Day', rows: [['Squat']] }]);
  });

  it('cuts a long cell short', () => {
    const [sheet] = readXlsx(rawWorkbook('<row r="1"><c r="A1" t="s"><v>0</v></c></row>', ['a'.repeat(5_000)], 1));

    expect(sheet!.rows[0]![0]).toBe('a'.repeat(1_000));
  });

  it('refuses a workbook whose cells all point at one long shared string', () => {
    const row = (r: number) =>
      `<row r="${r}">${Array.from({ length: 100 }, () => '<c t="s"><v>0</v></c>').join('')}</row>`;
    const sheetXml = Array.from({ length: 2_500 }, (_, i) => row(i + 1)).join('');

    const start = performance.now();
    expect(() => readXlsx(rawWorkbook(sheetXml, ['x'.repeat(100_000)], 1))).toThrow(SpreadsheetTooLargeError);
    expect(performance.now() - start).toBeLessThan(2_000);
  });

  it('charges a stored part its stored size, even listed many times under a size of 0', () => {
    const zip = zipSync(
      {
        'xl/workbook.xml': strToU8('<workbook><sheets/></workbook>'),
        'xl/sharedStrings.xml': new Uint8Array(12 * 1024 * 1024),
      },
      { level: 0 },
    );
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const endRecord = zip.length - 22;
    const directoryStart = view.getUint32(endRecord + 16, true);
    const recordLength = (at: number) =>
      46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    const first = zip.subarray(directoryStart, directoryStart + recordLength(directoryStart));
    const secondStart = directoryStart + first.length;
    const second = zip.subarray(secondStart, secondStart + recordLength(secondStart));
    const shared = new TextDecoder().decode(second.subarray(46, 46 + 20)) === 'xl/sharedStrings.xml' ? second : first;
    const workbookRecord = shared === second ? first : second;
    const lying = new Uint8Array(shared);
    new DataView(lying.buffer).setUint32(24, 0, true);

    const copies = 4;
    const records = [workbookRecord, ...Array<Uint8Array>(copies).fill(lying)];
    const directoryLength = records.reduce((total, r) => total + r.length, 0);
    const bytes = new Uint8Array(directoryStart + directoryLength + 22);
    bytes.set(zip.subarray(0, directoryStart));
    let at = directoryStart;
    for (const record of records) {
      bytes.set(record, at);
      at += record.length;
    }
    bytes.set(zip.subarray(endRecord), at);
    const end = new DataView(bytes.buffer, at, 22);
    end.setUint16(8, records.length, true);
    end.setUint16(10, records.length, true);
    end.setUint32(12, directoryLength, true);

    expect(() => readXlsx(bytes)).toThrow(SpreadsheetTooLargeError);
  });

  it('refuses a file larger than the cap before unzipping it', () => {
    expect(() => readXlsx(new Uint8Array(21 * 1024 * 1024))).toThrow(SpreadsheetTooLargeError);
  });
});

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });
const message = 'Use writeAtomically from @/db/helpers. Device transactions are synchronous.';

async function lint(source: string, filePath = 'src/store/program/effects.ts') {
  const results = await eslint.lintText(source, { filePath: resolve(filePath) });
  return results.flatMap((result) => result.messages);
}

function transactionErrors(messages: Awaited<ReturnType<typeof lint>>) {
  return messages.filter((result) => result.ruleId === 'no-restricted-syntax' && result.message === message);
}

describe('storage transaction boundary', () => {
  it.each([
    ['direct', 'db.transaction(async tx => {});'],
    ['computed', "db['transaction'](async tx => {});"],
    ['template computed', 'db[`transaction`](async tx => {});'],
    ['optional template computed', 'db?.[`transaction`]?.(async tx => {});'],
    ['template destructured', 'const { [`transaction`]: run } = db; run(async tx => {});'],
    ['aliased', 'const run = db.transaction; run(async tx => {});'],
    ['database alias', 'const connection = db; connection.transaction(async tx => {});'],
    ['destructured', 'const { transaction: run } = db; run(async tx => {});'],
    ['literal destructured', "const { ['transaction']: run } = db; run(async tx => {});"],
    ['assignment destructured', '({ transaction: run } = db); run(async tx => {});'],
    ['parameter destructured', 'function save({ transaction: run }) { run(async tx => {}); }'],
    ['optional', 'db?.transaction?.(async tx => {});'],
    ['optional computed', "db?.['transaction']?.(async tx => {});"],
  ])('rejects %s access and names the replacement', async (_name, source) => {
    expect(transactionErrors(await lint(source))).toHaveLength(1);
  });

  it('also restricts raw access in specs', async () => {
    expect(transactionErrors(await lint('db.transaction(() => {});', 'src/db/helpers.spec.ts'))).toHaveLength(1);
  });

  it('allows the atomic helper and driver definitions', async () => {
    expect(await lint('writeAtomically(db, tx => []);')).toEqual([]);
    expect(await lint('const driver = { transaction(callback) { return callback({}); } };')).toEqual([]);
  });

  it('allows the actual helper and rejects its access in another path', async () => {
    const source = await readFile(resolve('src/db/helpers.ts'), 'utf8');
    expect(await lint(source, 'src/db/helpers.ts')).toEqual([]);
    expect(transactionErrors(await lint(source, 'src/db/helpers-copy.ts'))).toHaveLength(1);
  });

  it.each([
    ['program', 'src/store/program/effects.ts', [135]],
    ['backends', 'src/store/backends/effects.ts', [51, 70]],
  ])('rejects historical unsafe %s transactions', async (name, filePath, lines) => {
    const source = await readFile(resolve(`test/fixtures/storage-boundary/${name}.ts.txt`), 'utf8');
    expect(transactionErrors(await lint(source, filePath)).map((result) => result.line)).toEqual(lines);
  });

  it('accepts current consumers of the helper', async () => {
    for (const filePath of ['src/store/program/effects.ts', 'src/store/backends/effects.ts']) {
      expect(transactionErrors(await lint(await readFile(resolve(filePath), 'utf8'), filePath))).toEqual([]);
    }
  });

  it.each([
    "const key = ['trans', 'action'].join(''); db[key](async tx => {});",
    'const key = "transaction"; db[`${key}`](async tx => {});',
  ])('does not claim to detect dynamic property construction in %s', async (source) => {
    expect(await lint(source)).toEqual([]);
  });

  it.each(['toSorted', 'toSpliced', 'toReversed'])('preserves the Hermes %s restriction', async (method) => {
    expect((await lint(`values.${method}();`)).map((result) => result.ruleId)).toEqual(['no-restricted-properties']);
    expect(await lint(`values.${method}();`, 'src/db/helpers.ts')).toHaveLength(1);
    expect(await lint(`values.${method}();`, 'src/db/helpers.spec.ts')).toEqual([]);
  });
});

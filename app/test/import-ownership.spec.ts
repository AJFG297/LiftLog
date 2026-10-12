import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Services } from '@/services';

const eslint = new ESLint({ cwd: process.cwd() });
async function errors(source: string, filePath: string) {
  const results = await eslint.lintText(source, { filePath: resolve(filePath) });
  return results
    .flatMap((result) => result.messages)
    .filter((message) => message.ruleId === 'storage/import-ownership');
}

describe('import ownership boundary', () => {
  it.each([
    [
      "import { applyHistoryImport as apply } from '@/store/history-import-actions';",
      'src/components/smart/import.tsx',
    ],
    ["import { applyHistoryImport } from '../../store/history-import-actions';", 'src/store/settings/import.ts'],
    ["import { ProgramWriter as Writer } from './program-writer';", 'src/services/other.ts'],
    ["import type { DescriptorWriter } from '@/services/descriptor-writer';", 'src/store/stored-sessions/effects.ts'],
    ["export * from '@/store/history-import-actions';", 'src/models/reexport.ts'],
    ["const actions = await import('../store/history-import-actions');", 'src/services/other.ts'],
    ["const writer = require('@/services/program-writer');", 'src/services/other.ts'],
  ])('rejects composition outside its owner: %s', async (source, path) => {
    expect(await errors(source, path)).toHaveLength(1);
  });

  it.each([
    ["import { ProgramWriter } from './program-writer';", 'src/services/index.ts'],
    ["import { DescriptorWriter } from '@/services/descriptor-writer';", 'src/services/history-import.ts'],
    ["import { applyHistoryImport } from '@/store/history-import-actions';", 'src/store/program/index.ts'],
    ["import { applyHistoryImport } from '../../store/history-import-actions';", 'src/store/stats/effects.ts'],
    ["import { ProgramWriter } from '@/services/program-writer';", 'src/services/history-import.spec.ts'],
    ["import { DescriptorWriter } from '@/services/descriptor-writer';", 'src/utils/__test__/effect-store.ts'],
  ])('accepts the declared owner: %s', async (source, path) => {
    expect(await errors(source, path)).toEqual([]);
  });

  it('exposes only flushing to ordinary services', () => {
    const programCanRun: 'run' extends keyof Services['programWriter'] ? true : false = false;
    const descriptorCanRun: 'run' extends keyof Services['descriptorWriter'] ? true : false = false;
    expect([programCanRun, descriptorCanRun]).toEqual([false, false]);
  });
});

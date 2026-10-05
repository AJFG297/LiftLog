import { convertSpreadsheetWithAi } from '@/store/ai-planner';
import { showSnackbar } from '@/store/app';
import { importPlanFromFile, setPendingImport } from '@/store/program';
import { applyProgramImportExportEffects } from '@/store/program/import-export-effects';
import { createAddEffectTestBed } from '@/utils/__test__/add-effect-testbed';
import { describe, expect, it } from 'vitest';

function makeTestBed() {
  const testBed = createAddEffectTestBed({ services: { tolgee: { t: (key: string) => key } } });
  applyProgramImportExportEffects(testBed.addEffect);
  return testBed;
}

const csv = (text: string) => new TextEncoder().encode(text);

describe('importing a spreadsheet with no routine table', () => {
  it('offers to convert its sheets with AI', async () => {
    const testBed = makeTestBed();

    await testBed.dispatchHandled(
      importPlanFromFile({ name: 'Program.csv', bytes: csv('Week 1\nSquat 5x5 @ 75%\nBench 3x8\n') }),
    );

    expect(testBed.getDispatchedAction(showSnackbar).payload).toEqual({
      text: 'plan.import.error.no_routine_table.message',
      action: 'plan.import.convert_with_ai.button',
      dispatchAction: convertSpreadsheetWithAi({
        fileName: 'Program.csv',
        sheets: [{ name: '', rows: [['Week 1'], ['Squat 5x5 @ 75%'], ['Bench 3x8']] }],
      }),
    });
    testBed.expectNotDispatched(setPendingImport);
  });

  it('offers nothing for a file that is not a plan at all', async () => {
    const testBed = makeTestBed();

    await testBed.dispatchHandled(importPlanFromFile({ name: 'notes.liftlogplan', bytes: csv('hello') }));

    expect(testBed.getDispatchedAction(showSnackbar).payload).toEqual({ text: 'plan.import.error.message' });
  });
});

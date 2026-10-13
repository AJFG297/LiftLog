import { PLAN_FILE_EXTENSION, PLAN_FILE_MIME, serializeProgramBlueprint } from '@/models/plan-file';
import { parsePlanImport, type PlanImportFailure } from '@/services/plan-import';
import { convertSpreadsheetWithAi } from '@/store/ai-planner';
import { showSnackbar } from '@/store/app';
import {
  exportPlan,
  importPlanFromFile,
  importPlanFromPicker,
  importPlanFromUri,
  setPendingImport,
} from '@/store/program';
import { AddEffectFn } from '@/store/store';
import { File } from 'expo-file-system';

const PLAN_IMPORT_ERROR_KEYS: Record<PlanImportFailure, string> = {
  notAPlan: 'plan.import.error.message',
  needsNewerApp: 'plan.import.error.needs_newer_app.message',
  legacySpreadsheet: 'plan.import.error.legacy_spreadsheet.message',
  unreadableSpreadsheet: 'plan.import.error.unreadable_spreadsheet.message',
  spreadsheetTooLarge: 'plan.import.error.spreadsheet_too_large.message',
  noRoutineTable: 'plan.import.error.no_routine_table.message',
};

/** Turns a plan name into a safe file name, e.g. "Push / Pull!" -> "Push_Pull". */
function toFileName(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
  return `${cleaned || 'plan'}.${PLAN_FILE_EXTENSION}`;
}

export function applyProgramImportExportEffects(addEffect: AddEffectFn) {
  addEffect(exportPlan, async ({ payload: { programId } }, { getState, extra: { fileExportService } }) => {
    const blueprint = getState().program.savedPrograms[programId];
    if (!blueprint) {
      return;
    }
    await fileExportService.exportBytes(
      toFileName(blueprint.name),
      serializeProgramBlueprint(blueprint),
      PLAN_FILE_MIME,
    );
  });

  addEffect(importPlanFromPicker, async (_, { dispatch, extra: { filePickerService } }) => {
    const picked = await filePickerService.pickFile();
    if (!picked) {
      return;
    }
    dispatch(importPlanFromFile({ name: picked.name, bytes: picked.bytes }));
  });

  addEffect(importPlanFromUri, async ({ payload: { uri } }, { dispatch, extra: { tolgee, logger } }) => {
    let bytes: Uint8Array;
    try {
      bytes = await new File(uri).bytes();
    } catch (e) {
      logger.error(`Failed to read plan file at ${uri}:`, e);
      dispatch(showSnackbar({ text: tolgee.t('plan.import.error.message') }));
      return;
    }
    dispatch(importPlanFromFile({ bytes }));
  });

  addEffect(importPlanFromFile, async ({ payload }, { dispatch, extra: { tolgee, logger } }) => {
    const result = parsePlanImport(payload);
    if (!result.ok) {
      logger.error('Failed to import plan file', { failure: result.failure, error: result.error });
      const text = tolgee.t(PLAN_IMPORT_ERROR_KEYS[result.failure]);
      if (result.failure === 'noRoutineTable') {
        dispatch(
          showSnackbar({
            text,
            action: tolgee.t('plan.import.convert_with_ai.button'),
            dispatchAction: convertSpreadsheetWithAi({
              fileName: payload.name || result.planName,
              sheets: result.sheets,
            }),
          }),
        );
        return;
      }
      dispatch(showSnackbar({ text }));
      return;
    }
    dispatch(setPendingImport({ programBlueprint: result.blueprint }));
  });
}

import { showSnackbar } from '@/store/app';
import { importFromExternal, selectPreferredWeightUnit } from '@/store/settings';
import { AddEffectFn } from '@/store/store';
import { setStatsIsDirty } from '@/store/stats';
import { getExternalImporter } from '@/services/csv-import';

export function addImportExternalEffects(addEffect: AddEffectFn) {
  addEffect(
    importFromExternal,
    async (
      { payload: { format } },
      { dispatch, getState, extra: { filePickerService, tolgee, logger, historyImport } },
    ) => {
      const file = await filePickerService.pickFile();
      if (!file) {
        return;
      }

      const defaultWeightUnit = selectPreferredWeightUnit(getState());

      try {
        const backupData = getExternalImporter(format)(file.bytes, { defaultWeightUnit });

        const result = await historyImport.apply({ kind: 'external', data: backupData });
        if (result.kind === 'failed') {
          logger.error('External import incomplete', result);
          dispatch(
            showSnackbar({
              text: 'Import incomplete. Some data may have been saved. Import the file again to finish.',
            }),
          );
          return;
        }
        dispatch(
          showSnackbar({
            text:
              result.kind === 'unchanged'
                ? tolgee.t('backup.import_from_other_apps.already_imported.message')
                : tolgee.t('backup.import_from_other_apps.complete.message', { count: result.count }),
          }),
        );
        if (result.kind === 'complete') dispatch(setStatsIsDirty(true));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('External import failed', { err, format });
        dispatch(
          showSnackbar({
            text: tolgee.t('backup.import_from_other_apps.failed.message', { error: message }),
          }),
        );
      }
    },
  );
}

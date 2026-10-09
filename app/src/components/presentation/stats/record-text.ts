import type { TranslateFn } from '@/i18n/translate-fn';
import type { RecordListRow } from '@/store/stats/records-list';

/** A record's kind as the Records list and the exercise page's timeline name it: "Heaviest" or "Est. 1RM". */
export function recordKindLabel(t: TranslateFn, kind: RecordListRow['kind']): string {
  return kind === 'heaviestWeight'
    ? t('progress.records.kind.heaviest.label')
    : t('progress.records.kind.one_rep_max.label');
}

import { applyHistoryImport } from '@/models/history-import-actions';
import type { Session } from '@/models/session-models';

export function importedHistory(workouts: Session[]) {
  return applyHistoryImport({ workouts, programs: {}, exercises: {} });
}

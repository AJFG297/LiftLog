import { useIncomingPlanFile } from '@/hooks/useIncomingPlanFile';
import { useAppSelector } from '@/store';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

/**
 * Watches for a plan parsed from an imported file (whether picked in-app or
 * opened from the OS) and routes to the import preview screen to confirm it.
 * A spreadsheet sent to the AI to convert instead routes to the AI planner.
 */
export function PlanImportGate() {
  useIncomingPlanFile();
  const hasPendingImport = useAppSelector((s) => !!s.program.pendingImport);
  const hasPendingSpreadsheet = useAppSelector((s) => !!s.aiPlanner.pendingSpreadsheet);
  const { navigate } = useRouter();
  useEffect(() => {
    if (hasPendingImport) {
      navigate('/routines/import-plan');
    }
  }, [hasPendingImport, navigate]);
  useEffect(() => {
    if (hasPendingSpreadsheet) {
      navigate('/routines/ai/planner');
    }
  }, [hasPendingSpreadsheet, navigate]);
  return null;
}

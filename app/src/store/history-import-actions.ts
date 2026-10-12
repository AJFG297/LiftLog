import { createAction } from '@reduxjs/toolkit';
import type { BackupData } from '@/models/backup';
import type { ExerciseDescriptor } from '@/models/exercise-models';
import type { ProgramBlueprint } from '@/models/blueprint-models';
import type { Session } from '@/models/session-models';

export const applyHistoryImport =
  createAction<Required<Pick<BackupData, 'workouts' | 'programs' | 'exercises'>>>('historyImport/apply');
export const reconcileHistoryMerge = createAction<{
  programs: Record<string, ProgramBlueprint>;
  exercises: Record<string, ExerciseDescriptor>;
  sessions: Record<string, Session>;
}>('historyImport/reconcile');

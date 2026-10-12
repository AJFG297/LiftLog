import type { Store } from '@reduxjs/toolkit';
import type { RootState } from '@/store';
import type { BackupData } from '@/models/backup';
import type { ExerciseMerge } from '@/models/exercise-merge';
import type { ExerciseDescriptor } from '@/models/exercise-models';
import { ExerciseResolver, logAmbiguousInDev } from '@/models/exercise-resolver';
import { applyHistoryImport, reconcileHistoryMerge } from '@/store/history-import-actions';
import { loadBuiltInExerciseNames } from '@/services/exercise-catalog';
import { mergeExerciseNames, repointProgram, repointSession } from '@/services/data-migrations/merge-exercise-names';
import { setLatestExercisesFor } from '@/store/stored-sessions';
import type { ProgramWriter } from '@/services/program-writer';
import type { DescriptorWriter } from '@/services/descriptor-writer';
import type { WorkoutRepository } from '@/services/workout-repository';
import type { Logger } from '@/services/logger';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import type { ProgressionKey } from '@/models/blueprint-models';

export type ImportStage =
  | 'hydration'
  | 'linking'
  | 'dedupe'
  | 'descriptors'
  | 'programs'
  | 'workouts'
  | 'repair'
  | 'flush'
  | 'cache';
export type ImportOutcome =
  | { kind: 'complete'; count: number }
  | { kind: 'unchanged' }
  | {
      kind: 'failed';
      stage: ImportStage;
      error: unknown;
      durableStages: ImportStage[];
      possibleWrites: ImportStage[];
      committedRounds: ExerciseMerge[][];
      pending: 'repair-and-cache' | 'cache';
    };
export type ImportRequest = { kind: 'backup'; data: BackupData } | { kind: 'external'; data: BackupData };
type StoreAccess = Pick<Store<RootState>, 'getState' | 'dispatch' | 'subscribe'>;
type Dependencies = {
  db: ExpoSQLiteDatabase;
  workoutRepository: WorkoutRepository;
  programWriter: ProgramWriter;
  descriptorWriter: DescriptorWriter;
  logger: Logger;
};

export class HistoryImport {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly store: StoreAccess,
    private readonly services: Dependencies,
  ) {}

  apply(request: ImportRequest): Promise<ImportOutcome> {
    const run = this.tail.then(() => this.applyInOrder(request));
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async applyInOrder(request: ImportRequest): Promise<ImportOutcome> {
    const progress: { stage: ImportStage } = { stage: 'hydration' };
    const durableStages: ImportStage[] = [];
    const possibleWrites: ImportStage[] = [];
    const committedRounds: ExerciseMerge[][] = [];
    const { store, services } = this;
    try {
      await this.waitForHydration();
      return await services.programWriter.run((flushPrograms) =>
        services.descriptorWriter.run(async (flushDescriptors) => {
          // Catch up ordinary edits and failed imports before reading repair input.
          progress.stage = 'descriptors';
          possibleWrites.push(progress.stage);
          await flushDescriptors();
          progress.stage = 'programs';
          possibleWrites.push(progress.stage);
          await flushPrograms();
          progress.stage = 'dedupe';
          const existing =
            request.kind === 'external'
              ? await services.workoutRepository.existingIds(request.data.workouts.map((workout) => workout.id))
              : new Set<string>();
          const workouts = request.data.workouts.filter((workout) => !existing.has(workout.id));
          if (request.kind === 'backup' || workouts.length) {
            progress.stage = 'linking';
            const builtInNames = await loadBuiltInExerciseNames();
            const resolver = new ExerciseResolver({
              savedExercises: { ...store.getState().storedSessions.savedExercises, ...request.data.exercises },
              builtInNames,
              preserveLinkedIds: request.kind === 'backup',
              onAmbiguous: logAmbiguousInDev(services.logger),
            });
            const linkedWorkouts = workouts.map((workout) => resolver.linkSession(workout));
            const programs = Object.fromEntries(
              Object.entries(request.data.programs).map(([id, program]) => [id, resolver.linkProgram(program)]),
            );
            store.dispatch(
              applyHistoryImport({
                workouts: linkedWorkouts,
                programs,
                exercises: { ...request.data.exercises, ...resolver.stubs },
              }),
            );
            progress.stage = 'descriptors';
            possibleWrites.push(progress.stage);
            await flushDescriptors();
            durableStages.push(progress.stage);
            progress.stage = 'programs';
            possibleWrites.push(progress.stage);
            await flushPrograms();
            durableStages.push(progress.stage);
            progress.stage = 'workouts';
            possibleWrites.push(progress.stage);
            await services.workoutRepository.putMany(linkedWorkouts);
            durableStages.push(progress.stage);
          }
          progress.stage = 'repair';
          possibleWrites.push(progress.stage);
          let before = store.getState().storedSessions.savedExercises;
          await mergeExerciseNames(
            services.db,
            () => store.getState().storedSessions.hiddenBuiltInIds,
            services.workoutRepository,
            (round) => {
              this.reconcile(round, before);
              committedRounds.push(round);
              before = store.getState().storedSessions.savedExercises;
            },
            async () => {
              progress.stage = 'flush';
              possibleWrites.push(progress.stage);
              await flushPrograms();
              await flushDescriptors();
              before = store.getState().storedSessions.savedExercises;
              progress.stage = 'repair';
            },
          );
          durableStages.push('repair');
          progress.stage = 'flush';
          possibleWrites.push(progress.stage);
          await flushPrograms();
          await flushDescriptors();
          durableStages.push(progress.stage);
          progress.stage = 'cache';
          const snapshot = store.getState().storedSessions.latestExercises;
          const latest = await services.workoutRepository.latestPerLineage();
          const current = store.getState().storedSessions.latestExercises;
          const keys = [...new Set([...Object.keys(snapshot), ...Object.keys(latest)])].filter(
            (key) => current[key as ProgressionKey] === snapshot[key as ProgressionKey],
          ) as ProgressionKey[];
          store.dispatch(setLatestExercisesFor({ keys, latest }));
          return workouts.length || request.kind === 'backup'
            ? { kind: 'complete', count: workouts.length }
            : { kind: 'unchanged' };
        }),
      );
    } catch (error) {
      return {
        kind: 'failed',
        stage: progress.stage,
        error,
        durableStages,
        possibleWrites,
        committedRounds,
        pending: progress.stage === 'cache' ? 'cache' : 'repair-and-cache',
      };
    }
  }

  private waitForHydration(): Promise<void> {
    const ready = () => {
      const state = this.store.getState();
      return state.settings.isHydrated && state.program.isHydrated && state.storedSessions.isHydrated;
    };
    if (ready()) return Promise.resolve();
    return new Promise((resolve) => {
      const unsubscribe = this.store.subscribe(() => {
        if (ready()) {
          unsubscribe();
          resolve();
        }
      });
      if (ready()) {
        unsubscribe();
        resolve();
      }
    });
  }

  private reconcile(round: ExerciseMerge[], before: Record<string, ExerciseDescriptor>): void {
    const state = this.store.getState();
    const exercises = { ...state.storedSessions.savedExercises };
    for (const merge of round) {
      const id = merge.survivor.id;
      const survivorChanged = exercises[id] !== before[id];
      const changedLoser = merge.mergedIds.find((loser) => exercises[loser] && exercises[loser] !== before[loser]);
      const descriptor = survivorChanged
        ? exercises[id]
        : changedLoser
          ? exercises[changedLoser]
          : merge.survivorDescriptor;
      merge.mergedIds.forEach((loser) => delete exercises[loser]);
      if (descriptor) exercises[id] = descriptor;
      else if (survivorChanged) delete exercises[id];
    }
    this.store.dispatch(
      reconcileHistoryMerge({
        exercises,
        programs: Object.fromEntries(
          Object.entries(state.program.savedPrograms).map(([id, program]) => [id, repointProgram(program, [round])]),
        ),
        sessions: Object.fromEntries(
          Object.entries(state.storedSessions.sessions).map(([id, session]) => [id, repointSession(session, [round])]),
        ),
      }),
    );
  }
}

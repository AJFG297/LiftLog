import type { Store } from '@reduxjs/toolkit';
import type { RootState } from '@/store/store';
import type { ExerciseBlueprint, ProgressionKey } from '@/models/blueprint-models';
import { progressionKeyOf } from '@/models/blueprint-models';
import type { RecordedExercise } from '@/models/session-models';
import type { CarryOver } from '@/models/session-models/carry-over';
import { sessionWithExerciseEdited } from '@/models/session-models/carry-over';
import {
  blueprintsForPick,
  blueprintSwappedTo,
  sessionWithExerciseSwapped,
  sessionWithPickAdded,
} from '@/models/exercise-pick';
import type { PickedExerciseRef } from '@/models/exercise-pick';
import type { WorkoutRepository } from '@/services/workout-repository';
import type { Logger } from '@/services/logger';
import { selectCarryOver, updateStoredSession } from '@/store/stored-sessions';

const targetBrand: unique symbol = Symbol('ExerciseTarget');
export type ExerciseTarget = { readonly [targetBrand]: true };
export type AddOutcome = { kind: 'added'; firstIndex: number } | { kind: 'unchanged' } | { kind: 'closed' };
export type EditOutcome = { kind: 'applied' } | { kind: 'obsolete' } | { kind: 'closed' } | { kind: 'foreign-target' };
type StoreAccess = Pick<Store<RootState>, 'getState' | 'dispatch'>;
interface CarryOverServices {
  workoutRepository: Pick<WorkoutRepository, 'latestPerLineage'>;
  logger: Pick<Logger, 'error'>;
}

export function createExerciseEntry(store: StoreAccess, services: CarryOverServices) {
  const pending = new Map<string, Promise<unknown>>();
  const targets = new WeakMap<ExerciseTarget, { workoutId: string; index: number; blueprint: ExerciseBlueprint }>();

  function inOrder<T>(
    workoutId: string,
    keys: readonly ProgressionKey[],
    apply: (carryOver: CarryOver) => T,
  ): Promise<T> {
    const previous = pending.get(workoutId);
    if (!previous && !ownKeys(store.getState(), workoutId, keys).length) {
      try {
        return Promise.resolve(apply(selectCarryOver(store.getState(), workoutId)));
      } catch (error) {
        return Promise.reject(error);
      }
    }
    const run = (async () => {
      await previous;
      return apply(await carryOverFor(store.getState, services, workoutId, keys));
    })();
    const settled = run
      .catch(() => undefined)
      .then(() => {
        if (pending.get(workoutId) === settled) pending.delete(workoutId);
      });
    pending.set(workoutId, settled);
    return run;
  }

  return {
    target({ workoutId, index }: { workoutId: string; index: number }): ExerciseTarget | undefined {
      const blueprint = store.getState().storedSessions.sessions[workoutId]?.recordedExercises[index]?.blueprint;
      if (!blueprint) return undefined;
      const target: ExerciseTarget = { [targetBrand]: true };
      targets.set(target, { workoutId, index, blueprint });
      return target;
    },
    add({
      workoutId,
      picked,
      asSuperset,
      onAdded,
    }: {
      workoutId: string;
      picked: readonly PickedExerciseRef[];
      asSuperset: boolean;
      onAdded?: (firstIndex: number) => void;
    }): Promise<AddOutcome> {
      const keys = blueprintsForPick(picked, false).map((blueprint) => blueprint.progressionKey());
      return inOrder<AddOutcome>(workoutId, keys, (carryOver) => {
        const current = store.getState().storedSessions.sessions[workoutId];
        if (!current) return { kind: 'closed' };
        if (!picked.length) return { kind: 'unchanged' };
        const firstIndex = current.recordedExercises.length;
        store.dispatch(
          updateStoredSession({
            sessionId: workoutId,
            update: (s) => sessionWithPickAdded(s, picked, asSuperset, carryOver),
          }),
        );
        onAdded?.(firstIndex);
        return { kind: 'added', firstIndex };
      });
    },
    swap({ target, picked }: { target: ExerciseTarget; picked: PickedExerciseRef }): Promise<EditOutcome> {
      const captured = targets.get(target);
      if (!captured) return Promise.resolve({ kind: 'foreign-target' });
      const { workoutId, index, blueprint } = captured;
      const keys = [blueprintSwappedTo(blueprint, picked).progressionKey()];
      return inOrder<EditOutcome>(workoutId, keys, (carryOver) => {
        const current = store.getState().storedSessions.sessions[workoutId];
        if (!current) return { kind: 'closed' };
        if (current.recordedExercises[index]?.movementKey() !== blueprint.movementKey()) return { kind: 'obsolete' };
        store.dispatch(
          updateStoredSession({
            sessionId: workoutId,
            update: (s) => sessionWithExerciseSwapped(s, index, blueprint.movementKey(), picked, carryOver),
          }),
        );
        return { kind: 'applied' };
      });
    },
    edit({ target, blueprint }: { target: ExerciseTarget; blueprint: ExerciseBlueprint }): Promise<EditOutcome> {
      const captured = targets.get(target);
      if (!captured) return Promise.resolve({ kind: 'foreign-target' });
      const { workoutId, index } = captured;
      const keys = captured.blueprint.movementKey() === blueprint.movementKey() ? [] : [blueprint.progressionKey()];
      return inOrder<EditOutcome>(workoutId, keys, (carryOver) => {
        const current = store.getState().storedSessions.sessions[workoutId];
        if (!current) return { kind: 'closed' };
        if (current.recordedExercises[index]?.blueprint !== captured.blueprint) return { kind: 'obsolete' };
        store.dispatch(
          updateStoredSession({
            sessionId: workoutId,
            update: (s) => sessionWithExerciseEdited(s, index, blueprint, carryOver),
          }),
        );
        return { kind: 'applied' };
      });
    },
  };
}
export type ExerciseEntry = ReturnType<typeof createExerciseEntry>;

async function carryOverFor(
  getState: () => RootState,
  { workoutRepository, logger }: CarryOverServices,
  sessionId: string,
  progressionKeys: readonly ProgressionKey[],
): Promise<CarryOver> {
  const own = ownKeys(getState(), sessionId, progressionKeys);
  if (!own.length) {
    return selectCarryOver(getState(), sessionId);
  }
  let before: Record<ProgressionKey, RecordedExercise | undefined>;
  try {
    const read = await workoutRepository.latestPerLineage({ progressionKeys: own, excludeWorkoutId: sessionId });
    before = Object.fromEntries(Object.entries(read).map(([key, performance]) => [key, performance.exercise]));
  } catch (error) {
    logger.error(`Couldn't read last time for ${own.join(', ')}; opening on the cache`, error);
    const { latestExercises } = getState().storedSessions;
    before = Object.fromEntries(
      (Object.keys(latestExercises) as ProgressionKey[])
        .filter((key) => own.includes(progressionKeyOf(key)))
        .map((key) => [key, latestExercises[key]]),
    );
  }
  const cached = selectCarryOver(getState(), sessionId);
  return { ...cached, latest: { ...cached.latest, ...before } };
}

function ownKeys(state: RootState, sessionId: string, progressionKeys: readonly ProgressionKey[]): ProgressionKey[] {
  const { latestExerciseWorkoutIds } = state.storedSessions;
  return [
    ...new Set(
      (Object.keys(latestExerciseWorkoutIds) as ProgressionKey[])
        .filter((key) => latestExerciseWorkoutIds[key] === sessionId)
        .map(progressionKeyOf)
        .filter((key) => progressionKeys.includes(key)),
    ),
  ];
}

import type { Store } from '@reduxjs/toolkit';
import type { RootState } from '@/store/store';
import type { ExerciseBlueprint, ProgressionKey } from '@/models/blueprint-models';
import { progressionKeyOf } from '@/models/blueprint-models';
import type { RecordedExercise } from '@/models/session-models';
import { sessionWithExerciseEdited, type CarryOver } from '@/models/session-models/carry-over';
import type { WorkoutRepository } from '@/services/workout-repository';
import type { Logger } from '@/services/logger';
import {
  blueprintsForPick,
  blueprintSwappedTo,
  type PickedExerciseRef,
  sessionWithExerciseSwapped,
  sessionWithPickAdded,
} from '@/models/exercise-pick';
import { updateStoredSession } from '@/store/stored-sessions';

type AddExercises = {
  sessionId: string;
  picked: readonly PickedExerciseRef[];
  asSuperset: boolean;
  onAdded?: (firstIndex: number) => void;
};
type SwapExercise = { sessionId: string; index: number; picked: PickedExerciseRef };
type EditExercise = { sessionId: string; index: number; updated: ExerciseBlueprint };

export function createWorkoutExerciseChanges({
  store,
  services,
}: {
  store: Pick<Store<RootState>, 'getState' | 'dispatch'>;
  services: CarryOverServices;
}) {
  const { getState, dispatch } = store;
  return {
    add({ sessionId, picked, asSuperset, onAdded }: AddExercises): Promise<void> {
      if (!getState().storedSessions.sessions[sessionId] || !picked.length) {
        return Promise.resolve();
      }
      const keys = blueprintsForPick(picked, false).map((blueprint) => blueprint.progressionKey());
      return withCarryOver(getState, services, sessionId, keys, (carryOver) => {
        const current = getState().storedSessions.sessions[sessionId];
        if (!current) {
          return;
        }
        dispatch(
          updateStoredSession({
            sessionId,
            update: (session) => sessionWithPickAdded(session, picked, asSuperset, carryOver),
          }),
        );
        onAdded?.(current.recordedExercises.length);
      });
    },
    swap({ sessionId, index, picked }: SwapExercise): Promise<void> {
      const swappedOut = getState().storedSessions.sessions[sessionId]?.recordedExercises[index]?.blueprint;
      if (!swappedOut) {
        return Promise.resolve();
      }
      const key = blueprintSwappedTo(swappedOut, picked).progressionKey();
      return withCarryOver(getState, services, sessionId, [key], (carryOver) =>
        dispatch(
          updateStoredSession({
            sessionId,
            update: (session) =>
              sessionWithExerciseSwapped(session, index, swappedOut.movementKey(), picked, carryOver),
          }),
        ),
      );
    },
    edit({ sessionId, index, updated }: EditExercise): Promise<void> {
      const edited = getState().storedSessions.sessions[sessionId]?.recordedExercises[index]?.blueprint;
      if (!edited) {
        return Promise.resolve();
      }
      const keys = edited.movementKey() === updated.movementKey() ? [] : [updated.progressionKey()];
      return withCarryOver(getState, services, sessionId, keys, (carryOver) =>
        dispatch(
          updateStoredSession({
            sessionId,
            update: (session) =>
              session.recordedExercises[index]?.blueprint === edited
                ? sessionWithExerciseEdited(session, index, updated, carryOver)
                : session,
          }),
        ),
      );
    },
  };
}

function selectCarryOver(state: RootState, sessionId: string): CarryOver {
  const { latestExercises, latestExerciseWorkoutIds } = state.storedSessions;
  const latest = Object.fromEntries(
    Object.entries(latestExercises).filter(([key]) => latestExerciseWorkoutIds[key as ProgressionKey] !== sessionId),
  );
  return { latest, unit: state.settings.useImperialUnits ? 'pounds' : 'kilograms' };
}

const pendingCarryOver = new Map<string, Promise<void>>();

interface CarryOverServices {
  workoutRepository: Pick<WorkoutRepository, 'latestPerLineage'>;
  logger: Pick<Logger, 'error'>;
}

function withCarryOver(
  getState: () => RootState,
  services: CarryOverServices,
  sessionId: string,
  progressionKeys: readonly ProgressionKey[],
  apply: (carryOver: CarryOver) => void,
): Promise<void> {
  const pending = pendingCarryOver.get(sessionId);
  if (!pending && !ownKeys(getState(), sessionId, progressionKeys).length) {
    apply(selectCarryOver(getState(), sessionId));
    return Promise.resolve();
  }
  const run = (async () => {
    await pending;
    apply(await carryOverFor(getState, services, sessionId, progressionKeys));
  })();
  const settled: Promise<void> = run
    .catch(() => {})
    .then(() => {
      if (pendingCarryOver.get(sessionId) === settled) {
        pendingCarryOver.delete(sessionId);
      }
    });
  pendingCarryOver.set(sessionId, settled);
  return run;
}

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

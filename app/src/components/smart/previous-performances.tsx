import { useWorkoutQuery } from '@/hooks/useWorkoutQuery';
import { MovementKey, ProgressionKey } from '@/models/blueprint-models';
import { RecordedExercise, Session } from '@/models/session-models';
import { useAppSelector } from '@/store';
import { selectActiveProgram } from '@/store/program';
import { createContext, ReactNode, useContext } from 'react';

/** How many earlier performances of a movement a workout screen fetches: "last time" and a few before. */
const PREVIOUS_PERFORMANCES_LIMIT = 10;

/** What a workout's exercises came after, read from the workout tables for one session. */
export interface PreviousPerformances {
  /** Earlier performances of a movement, newest first. Empty for one never done, and until the query answers. */
  ofMovement(movement: MovementKey): RecordedExercise[];
  /** The latest performance of each lineage before this session, keyed as `latestExercises` is. */
  byLineage: Readonly<Record<ProgressionKey, RecordedExercise | undefined>>;
  /** False until the query has answered: nothing to show rather than "first time". */
  loaded: boolean;
}

const noPerformances: RecordedExercise[] = [];
const PreviousPerformancesContext = createContext<PreviousPerformances | undefined>(undefined);

/**
 * Loads the previous performances of `session`'s movements and lineages once for the screen, so every
 * card, row and sheet under it reads the same answer instead of querying for itself. The session itself
 * is left out: it is not its own previous. Its own writes are ignored, since they can't change the answer;
 * any other workout write re-runs the query.
 */
export function PreviousPerformancesProvider({ session, children }: { session: Session; children: ReactNode }) {
  const program = useAppSelector(selectActiveProgram);
  const routine = program.sessions.find((planned) => planned.name === session.blueprint.name);
  const movements = [...new Set(session.recordedExercises.map((x) => x.movementKey()))];
  // The lineages the session was built from (see `plannedLineageFor`) can come from the routine rather than
  // the session, when an exercise was swapped mid-workout.
  const progressionKeys = [
    ...new Set([...session.recordedExercises, ...(routine?.exercises ?? [])].map((x) => x.progressionKey())),
  ];
  const result = useWorkoutQuery(
    async (repository) => {
      const [byMovement, latest] = await Promise.all([
        repository.previousPerformances(movements, {
          excludeWorkoutId: session.id,
          limit: PREVIOUS_PERFORMANCES_LIMIT,
        }),
        repository.latestPerLineage({ progressionKeys, excludeWorkoutId: session.id }),
      ]);
      return {
        byMovement,
        byLineage: Object.fromEntries(Object.entries(latest).map(([key, x]) => [key, x.exercise])) as Record<
          ProgressionKey,
          RecordedExercise
        >,
      };
    },
    [session.id, movements.join('\n'), progressionKeys.join('\n')],
    { ignoreWrite: (write) => !write.activeChanged && write.workoutIds.every((id) => id === session.id) },
  );
  const value: PreviousPerformances = {
    ofMovement: (movement) => result?.byMovement.get(movement) ?? noPerformances,
    byLineage: result?.byLineage ?? {},
    loaded: result !== undefined,
  };
  return <PreviousPerformancesContext.Provider value={value}>{children}</PreviousPerformancesContext.Provider>;
}

/** The previous performances the nearest {@link PreviousPerformancesProvider} loaded. */
export function usePreviousPerformances(): PreviousPerformances {
  const value = useContext(PreviousPerformancesContext);
  if (!value) {
    throw new Error('usePreviousPerformances must be used under a PreviousPerformancesProvider');
  }
  return value;
}

/**
 * Whether a {@link PreviousPerformancesProvider} is already above: a component that would mount one for
 * its own session (`SessionComponent`) reuses it, so a screen holding several sessions runs one query.
 */
export function useHasPreviousPerformances(): boolean {
  return useContext(PreviousPerformancesContext) !== undefined;
}

import { useWorkoutQuery } from '@/hooks/useWorkoutQuery';
import { Session } from '@/models/session-models';
import { USUAL_DURATION_SAMPLE } from '@/models/workout-summary';
import { SessionRecord, sessionRecords } from '@/store/stats/personal-records';
import { getSessionReferenceTime } from '@/store/stored-sessions';

/** How a workout compares with what came before it, read from the workout tables. */
export interface WorkoutComparison {
  /** The newest earlier workout of the same routine, logged or not: what the sets are compared with. */
  previous: Session | undefined;
  /** The last few earlier workouts of the routine that were done, for its usual length. */
  usual: readonly Session[];
  /** The records the workout set against everything before it. */
  records: SessionRecord[];
}

/**
 * What the summary and the workout detail show against a workout's history. Undefined until the queries
 * answer, and re-read after any workout write; the workout's own reference time is a dep, so a set logged
 * while the summary is open moves "before" with it.
 */
export function useWorkoutComparison(session: Session | undefined): WorkoutComparison | undefined {
  const referenceMs = session ? getSessionReferenceTime(session).toInstant().toEpochMilli() : undefined;
  return useWorkoutQuery(
    async (repository) => {
      if (!session) {
        return undefined;
      }
      const name = session.blueprint.name;
      const [[previous], usual, bests] = await Promise.all([
        repository.latestNamed(name, 1, { before: session, includeUnstarted: true }),
        repository.latestNamed(name, USUAL_DURATION_SAMPLE, { before: session }),
        repository.bestsBefore(session),
      ]);
      return { previous, usual, records: sessionRecords(session, bests) };
    },
    [session?.id, session?.blueprint.name, referenceMs],
  );
}

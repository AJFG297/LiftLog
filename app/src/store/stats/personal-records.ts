import { MovementKey } from '@/models/blueprint-models';
import { Session } from '@/models/session-models';
import { Weight } from '@/models/weight';
import { calculateOneRepMax } from '@/store/stats/calculate-stats';

export interface PersonalRecord {
  exerciseName: string;
  oneRepMax: Weight;
}

function bestOneRepMax(session: Session): Map<MovementKey, PersonalRecord> {
  const best = new Map<MovementKey, PersonalRecord>();

  for (const exercise of session.recordedExercises) {
    if (exercise.type !== 'RecordedWeightedExercise' || !exercise.isStarted || !exercise.tracksResistance) {
      continue;
    }

    // Same key selectRecentlyCompletedExercises uses; it already guards the cardio/weighted name collision.
    const key = exercise.movementKey();

    for (const potentialSet of exercise.setsCountingTowards('countsTowardsPrs')) {
      if (!potentialSet.set?.repsCompleted) {
        continue;
      }
      const oneRepMax = calculateOneRepMax(potentialSet, exercise.effectiveWeight(potentialSet, session.bodyweight));
      const current = best.get(key);
      if (!current || oneRepMax.isGreaterThan(current.oneRepMax)) {
        best.set(key, { exerciseName: exercise.blueprint.name, oneRepMax });
      }
    }
  }

  return best;
}

/**
 * Records per session, walking oldest to newest with a running best per exercise.
 *
 * A record only counts if the exercise was seen in an *earlier* session - otherwise the first time anyone
 * lifts anything is a PR, and a user with a single event in your feed gets a badge on everything they do.
 */
export function findPersonalRecords(sessionsOldestFirst: Session[]): Map<string, PersonalRecord[]> {
  const runningBest = new Map<MovementKey, Weight>();
  const recordsBySession = new Map<string, PersonalRecord[]>();

  for (const session of sessionsOldestFirst) {
    const records: PersonalRecord[] = [];

    for (const [key, candidate] of bestOneRepMax(session)) {
      const previous = runningBest.get(key);

      if (previous && candidate.oneRepMax.isGreaterThan(previous)) {
        records.push(candidate);
      }

      if (!previous || candidate.oneRepMax.isGreaterThan(previous)) {
        runningBest.set(key, candidate.oneRepMax);
      }
    }

    if (records.length > 0) {
      recordsBySession.set(session.id, records);
    }
  }

  return recordsBySession;
}

/**
 * A record set in one workout, with the best it beat. A heavier set than ever is `heaviestWeight`;
 * otherwise a better estimated one-rep max (more reps at a weight lifted before) is `estimatedOneRepMax`.
 * A workout sets at most one record per movement, so `key` identifies it.
 */
export type SessionRecord =
  | { kind: 'heaviestWeight'; key: MovementKey; exerciseName: string; weight: Weight; reps: number; previous: Weight }
  | { kind: 'estimatedOneRepMax'; key: MovementKey; exerciseName: string; oneRepMax: Weight; previous: Weight };

/**
 * The records `session` sets against `earlier`, the workouts before it. As in {@link findPersonalRecords},
 * an exercise seen for the first time sets none. Heaviest weight only counts on an exercise loaded with
 * external weight, since a bodyweight movement's load moves with the lifter's bodyweight.
 */
export function sessionRecords(session: Session, earlier: readonly Session[]): SessionRecord[] {
  const previousOneRepMax = new Map<MovementKey, Weight>();
  const previousHeaviest = new Map<MovementKey, Weight>();
  for (const past of earlier) {
    for (const [key, record] of bestOneRepMax(past)) {
      const best = previousOneRepMax.get(key);
      if (!best || record.oneRepMax.isGreaterThan(best)) {
        previousOneRepMax.set(key, record.oneRepMax);
      }
    }
    for (const [key, heaviest] of heaviestSets(past)) {
      const best = previousHeaviest.get(key);
      if (!best || heaviest.weight.isGreaterThan(best)) {
        previousHeaviest.set(key, heaviest.weight);
      }
    }
  }

  const heaviestToday = heaviestSets(session);
  const records: SessionRecord[] = [];
  for (const [key, candidate] of bestOneRepMax(session)) {
    const heaviest = heaviestToday.get(key);
    const heaviestBefore = previousHeaviest.get(key);
    if (heaviest && heaviestBefore && heaviest.weight.isGreaterThan(heaviestBefore)) {
      records.push({ kind: 'heaviestWeight', key, ...heaviest, previous: heaviestBefore });
      continue;
    }
    const before = previousOneRepMax.get(key);
    if (before && candidate.oneRepMax.isGreaterThan(before)) {
      records.push({
        kind: 'estimatedOneRepMax',
        key,
        exerciseName: candidate.exerciseName,
        oneRepMax: candidate.oneRepMax,
        previous: before,
      });
    }
  }
  return records;
}

interface HeaviestSet {
  exerciseName: string;
  weight: Weight;
  reps: number;
}

/** The heaviest logged set per exercise that counts towards records, on externally loaded exercises only. */
function heaviestSets(session: Session): Map<MovementKey, HeaviestSet> {
  const heaviest = new Map<MovementKey, HeaviestSet>();
  for (const exercise of session.recordedExercises) {
    if (exercise.type !== 'RecordedWeightedExercise' || exercise.blueprint.resistance !== 'external') {
      continue;
    }
    const key = exercise.movementKey();
    for (const potentialSet of exercise.setsCountingTowards('countsTowardsPrs')) {
      if (!potentialSet.set?.repsCompleted) {
        continue;
      }
      const current = heaviest.get(key);
      const { weight } = potentialSet;
      const reps = potentialSet.set.repsCompleted;
      const heavier = !current || weight.isGreaterThan(current.weight);
      if (heavier || (weight.equals(current.weight, true) && reps > current.reps)) {
        heaviest.set(key, { exerciseName: exercise.blueprint.name, weight, reps });
      }
    }
  }
  return heaviest;
}

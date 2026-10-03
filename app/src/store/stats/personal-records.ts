import { MovementKey } from '@/models/blueprint-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { Weight } from '@/models/weight';
import { calculateOneRepMax } from '@/store/stats/calculate-stats';

export interface PersonalRecord {
  exerciseName: string;
  oneRepMax: Weight;
}

/** A movement's best estimated 1RM in one workout, with the set it came from. */
interface BestOneRepMax extends PersonalRecord, OneRepMaxSet {}

/** An estimated 1RM and the set it comes from, as lifted. */
export interface OneRepMaxSet {
  oneRepMax: Weight;
  weight: Weight;
  reps: number;
}

/**
 * The set with the best Epley estimate in `exercise`, over the logged sets that count towards records, with
 * bodyweight folded in. Undefined for a movement that tracks no load, or with no such set logged.
 */
export function bestOneRepMaxSet(
  exercise: RecordedWeightedExercise,
  bodyweight: Weight | undefined,
): OneRepMaxSet | undefined {
  if (!exercise.tracksResistance) {
    return undefined;
  }
  let best: OneRepMaxSet | undefined;
  for (const potentialSet of exercise.setsCountingTowards('countsTowardsPrs')) {
    const reps = potentialSet.set?.repsCompleted;
    if (!reps) {
      continue;
    }
    const oneRepMax = calculateOneRepMax(potentialSet, exercise.effectiveWeight(potentialSet, bodyweight));
    if (!best || oneRepMax.isGreaterThan(best.oneRepMax)) {
      best = { oneRepMax, weight: potentialSet.weight, reps };
    }
  }
  return best;
}

function bestOneRepMax(session: Session): Map<MovementKey, BestOneRepMax> {
  const best = new Map<MovementKey, BestOneRepMax>();

  for (const exercise of session.recordedExercises) {
    if (exercise.type !== 'RecordedWeightedExercise' || !exercise.isStarted) {
      continue;
    }
    const candidate = bestOneRepMaxSet(exercise, session.bodyweight);
    if (!candidate) {
      continue;
    }

    // Same key `WorkoutRepository.previousPerformances` groups by; it already guards the cardio/weighted
    // name collision.
    const key = exercise.movementKey();
    const current = best.get(key);
    if (!current || candidate.oneRepMax.isGreaterThan(current.oneRepMax)) {
      best.set(key, { exerciseName: exercise.blueprint.name, ...candidate });
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
        records.push({ exerciseName: candidate.exerciseName, oneRepMax: candidate.oneRepMax });
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
  | {
      kind: 'estimatedOneRepMax';
      key: MovementKey;
      exerciseName: string;
      oneRepMax: Weight;
      /** The set the estimate comes from, as lifted. */
      weight: Weight;
      reps: number;
      previous: Weight;
    };

/** What a movement's earlier workouts hold against a new one: a {@link RecordLedger}'s state for it. */
export interface PreviousBest {
  oneRepMax?: Weight;
  heaviest?: Weight;
}
export type PreviousBests = ReadonlyMap<MovementKey, PreviousBest>;

/**
 * The records `session` sets against `before`, the bests of the workouts before it
 * (`WorkoutRepository.bestsBefore`). As in {@link findPersonalRecords}, an exercise seen for the first time
 * sets none. See {@link RecordLedger} for the rules; to walk a whole history, keep one ledger rather than
 * calling this per workout.
 */
export function sessionRecords(session: Session, before: PreviousBests): SessionRecord[] {
  return new RecordLedger(before).add(session);
}

/**
 * The running bests per movement (best estimated 1RM and heaviest weight), fed one workout at a time.
 * {@link add} returns the records that workout sets against everything added before it, then folds it in,
 * so walking a history oldest first yields each workout's records in a single pass.
 *
 * The rules: a heavier set than ever is a `heaviestWeight` record; otherwise a better estimated 1RM is an
 * `estimatedOneRepMax` one, so a movement sets at most one per workout. A movement with no earlier best sets
 * none. Heaviest weight only counts on an exercise loaded with external weight, since a bodyweight
 * movement's load moves with the lifter's bodyweight; a movement that tracks no load sets neither.
 */
export class RecordLedger {
  private readonly bestOneRepMax = new Map<MovementKey, Weight>();
  private readonly heaviest = new Map<MovementKey, Weight>();

  /** Starts from `before`, the bests of workouts already walked, or from nothing. */
  constructor(before: PreviousBests = new Map()) {
    for (const [key, best] of before) {
      if (best.oneRepMax) {
        this.bestOneRepMax.set(key, best.oneRepMax);
      }
      if (best.heaviest) {
        this.heaviest.set(key, best.heaviest);
      }
    }
  }

  /** The bests so far, as {@link sessionRecords} takes them. */
  get bests(): PreviousBests {
    const bests = new Map<MovementKey, PreviousBest>();
    for (const [key, oneRepMax] of this.bestOneRepMax) {
      bests.set(key, { oneRepMax });
    }
    for (const [key, heaviest] of this.heaviest) {
      bests.set(key, { ...bests.get(key), heaviest });
    }
    return bests;
  }

  add(session: Session): SessionRecord[] {
    const oneRepMaxToday = bestOneRepMax(session);
    const heaviestToday = heaviestSets(session);

    const records: SessionRecord[] = [];
    for (const [key, candidate] of oneRepMaxToday) {
      const heaviest = heaviestToday.get(key);
      const heaviestBefore = this.heaviest.get(key);
      if (heaviest && heaviestBefore && heaviest.weight.isGreaterThan(heaviestBefore)) {
        records.push({ kind: 'heaviestWeight', key, ...heaviest, previous: heaviestBefore });
        continue;
      }
      const before = this.bestOneRepMax.get(key);
      if (before && candidate.oneRepMax.isGreaterThan(before)) {
        records.push({
          kind: 'estimatedOneRepMax',
          key,
          exerciseName: candidate.exerciseName,
          oneRepMax: candidate.oneRepMax,
          weight: candidate.weight,
          reps: candidate.reps,
          previous: before,
        });
      }
    }

    for (const [key, candidate] of oneRepMaxToday) {
      const best = this.bestOneRepMax.get(key);
      if (!best || candidate.oneRepMax.isGreaterThan(best)) {
        this.bestOneRepMax.set(key, candidate.oneRepMax);
      }
    }
    for (const [key, candidate] of heaviestToday) {
      const best = this.heaviest.get(key);
      if (!best || candidate.weight.isGreaterThan(best)) {
        this.heaviest.set(key, candidate.weight);
      }
    }
    return records;
  }
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

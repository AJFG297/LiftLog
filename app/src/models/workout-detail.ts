import { MovementKey, SessionBlueprint } from '@/models/blueprint-models';
import { PotentialSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import { LetteredSetKind, setKindHas } from '@/models/session-models/set-kind';
import { Weight } from '@/models/weight';
import { calculateOneRepMax } from '@/store/stats/calculate-stats';
import { SessionRecord } from '@/store/stats/personal-records';
import { LocalDate } from '@js-joda/core';

/**
 * A past workout's structure as a new routine: its exercises as they ended up that day, including any
 * added, removed or edited during it, under `name`. The notes stay, since they describe the routine.
 */
export function routineFromSession(session: Session, name: string): SessionBlueprint {
  return session.blueprint.with({ name });
}

/**
 * A past workout to do again: the same exercises and sets, nothing logged, as a new workout on `date`.
 * The logged weights stay as the new workout's placeholders, as the history's "start this workout" did.
 */
export function repeatSession(session: Session, date: LocalDate, id: string): Session {
  return session.withNothingCompleted().with({ id, date, restTimer: undefined, reflection: undefined });
}

/** `name` if the plan has no routine called that yet, otherwise the first free "name 2", "name 3" and so on. */
export function uniqueRoutineName(name: string, existing: readonly string[]): string {
  if (!existing.includes(name)) {
    return name;
  }
  let counter = 2;
  while (existing.includes(`${name} ${counter}`)) {
    counter += 1;
  }
  return `${name} ${counter}`;
}

/** A set's label: working sets are numbered among themselves, the other kinds show their letter. */
export type DetailSetLabel = { kind: 'working'; number: number } | { kind: LetteredSetKind };

/** One logged set in a past workout's table. */
export interface DetailSetRow {
  /** Stable within the exercise: the list and the index in it. */
  key: string;
  label: DetailSetLabel;
  /** What was entered, before any bodyweight, as the workout screen shows it. */
  weight: Weight;
  reps: number;
  /** Undefined where a set can't set a record (warm-up, drop, myo) or the exercise carries no load. */
  oneRepMax: Weight | undefined;
  /** The set that set this workout's record for the movement. */
  pr: boolean;
}

/**
 * The logged sets of each exercise in `session`, index for index with `recordedExercises` (a cardio
 * exercise gets `undefined`). Warm-ups come first, as on the workout screen. `records` are the workout's
 * records from `sessionRecords`; each is tagged on the first set that reaches it, so an exercise done
 * twice in one workout tags its record once.
 */
export function sessionSetRows(session: Session, records: readonly SessionRecord[]): (DetailSetRow[] | undefined)[] {
  const claimed = new Set<MovementKey>();
  return session.recordedExercises.map((exercise) =>
    exercise instanceof RecordedWeightedExercise ? setRows(exercise, session.bodyweight, records, claimed) : undefined,
  );
}

function setRows(
  exercise: RecordedWeightedExercise,
  bodyweight: Weight | undefined,
  records: readonly SessionRecord[],
  claimed: Set<MovementKey>,
): DetailSetRow[] {
  const key = exercise.movementKey();
  const record = records.find((r) => r.key === key);
  const rows: DetailSetRow[] = [];

  exercise.warmupSets.forEach((slot, index) => {
    if (slot.set) {
      rows.push({
        key: `warmup-${index}`,
        label: { kind: 'warmup' },
        weight: slot.weight,
        reps: slot.set.repsCompleted,
        oneRepMax: undefined,
        pr: false,
      });
    }
  });

  let working = 0;
  exercise.potentialSets.forEach((slot, index) => {
    if (slot.kind === 'working') {
      working += 1;
    }
    if (!slot.set) {
      return;
    }
    const countsTowardsPrs = setKindHas(slot.kind, 'countsTowardsPrs') && slot.set.repsCompleted > 0;
    const oneRepMax =
      exercise.tracksResistance && countsTowardsPrs
        ? calculateOneRepMax(slot, exercise.effectiveWeight(slot, bodyweight))
        : undefined;
    const pr = !!record && countsTowardsPrs && !claimed.has(key) && reachesRecord(slot, oneRepMax, record);
    if (pr) {
      claimed.add(key);
    }
    rows.push({
      key: `working-${index}`,
      label: slot.kind === 'working' ? { kind: 'working', number: working } : { kind: slot.kind },
      weight: slot.weight,
      reps: slot.set.repsCompleted,
      oneRepMax,
      pr,
    });
  });

  return rows;
}

function reachesRecord(slot: PotentialSet, oneRepMax: Weight | undefined, record: SessionRecord): boolean {
  if (record.kind === 'heaviestWeight') {
    return slot.weight.equals(record.weight, true) && slot.set?.repsCompleted === record.reps;
  }
  return !!oneRepMax && oneRepMax.equals(record.oneRepMax, true);
}

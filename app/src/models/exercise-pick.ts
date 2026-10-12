import {
  ExerciseBlueprint,
  lineageKeys,
  MovementKey,
  Rest,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { CarryOver, nextRecordedExercise, sessionWithExerciseReplaced } from '@/models/session-models/carry-over';

export interface PickedExerciseRef {
  id: string;
  name: string;
}

export function blueprintsForPick(
  picked: readonly PickedExerciseRef[],
  asSuperset: boolean,
): WeightedExerciseBlueprint[] {
  return picked.map((exercise, index) =>
    WeightedExerciseBlueprint.of({
      name: exercise.name,
      exerciseId: exercise.id,
      sets: 3,
      repsConfig: { type: 'fixed', reps: 10 },
      restBetweenSets: Rest.medium,
      supersetWithNext: asSuperset && index < picked.length - 1,
    }),
  );
}

/**
 * The exercises with a pick added to the end. A superset flag left on the old last exercise linked nothing
 * there; with exercises after it, it would join them, so it's cleared.
 */
export function withPickAppended(
  exercises: readonly ExerciseBlueprint[],
  picked: readonly PickedExerciseRef[],
  asSuperset: boolean,
): ExerciseBlueprint[] {
  if (!picked.length) {
    return [...exercises];
  }
  const kept = exercises.map((exercise, index) =>
    index === exercises.length - 1 && exercise instanceof WeightedExerciseBlueprint && exercise.supersetWithNext
      ? exercise.with({ supersetWithNext: false })
      : exercise,
  );
  return [...kept, ...blueprintsForPick(picked, asSuperset)];
}

/**
 * The workout with a pick added to the end, clearing a stranded superset flag as {@link withPickAppended} does.
 * Each exercise opens on what its place would carry over in a routine (see {@link nextRecordedExercise}).
 */
export function sessionWithPickAdded(
  session: Session,
  picked: readonly PickedExerciseRef[],
  asSuperset: boolean,
  { latest, unit }: CarryOver,
): Session {
  if (!picked.length) {
    return session;
  }
  const lastIndex = session.recordedExercises.length - 1;
  const last = session.recordedExercises[lastIndex];
  let result = session;
  if (last instanceof RecordedWeightedExercise && last.blueprint.supersetWithNext) {
    const recordedExercises = session.recordedExercises.with(
      lastIndex,
      last.with({ blueprint: last.blueprint.with({ supersetWithNext: false }) }),
    );
    result = session.with({
      recordedExercises,
      blueprint: session.blueprint.with({ exercises: recordedExercises.map((exercise) => exercise.blueprint) }),
    });
  }
  const added = blueprintsForPick(picked, asSuperset);
  const lineages = lineageKeys([...result.blueprint.exercises, ...added]).slice(result.blueprint.exercises.length);
  return added.reduce(
    (next, blueprint, index) => next.withAddedExercise(nextRecordedExercise(blueprint, lineages[index]!, latest, unit)),
    result,
  );
}

/**
 * The workout with the exercise at `index`, `swappedOut`, swapped for `picked`: its plan as it is now, under
 * the picked exercise's name and id, so its history follows it (see {@link sessionWithExerciseReplaced}).
 * Unchanged if that place no longer holds `swappedOut`, which a swap waiting on a read can find; an edit of
 * its plan meanwhile is kept.
 */
export function sessionWithExerciseSwapped(
  session: Session,
  index: number,
  swappedOut: MovementKey,
  picked: PickedExerciseRef,
  carryOver: CarryOver,
): Session {
  const current = session.recordedExercises[index];
  if (current?.movementKey() !== swappedOut) {
    return session;
  }
  return sessionWithExerciseReplaced(session, index, blueprintSwappedTo(current.blueprint, picked), carryOver);
}

export function blueprintSwappedTo(blueprint: ExerciseBlueprint, picked: PickedExerciseRef): ExerciseBlueprint {
  const exercise = { name: picked.name, exerciseId: picked.id };
  return blueprint instanceof WeightedExerciseBlueprint ? blueprint.with(exercise) : blueprint.with(exercise);
}

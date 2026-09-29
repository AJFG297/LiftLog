import { ProgramBlueprint, Rest, SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { Duration } from '@js-joda/core';

/** Where a workout's exercise sits in its routine. */
export interface RoutineExerciseLocation {
  sessionIndex: number;
  exerciseIndex: number;
}

/**
 * The routine exercise that a workout's exercise is compared with when the workout finishes. It follows
 * `getPlanDiff`: the first routine with the workout's name, and exercises matched by name, the nth of a
 * name with the nth. Undefined when the workout has no routine, or the routine lacks the exercise.
 */
export function routineExerciseLocation(
  program: ProgramBlueprint,
  workout: SessionBlueprint,
  exerciseIndex: number,
): RoutineExerciseLocation | undefined {
  const exercise = workout.exercises[exerciseIndex];
  const sessionIndex = program.sessions.findIndex((s) => s.name === workout.name);
  if (!exercise || sessionIndex < 0) {
    return undefined;
  }
  const nth = workout.exercises.slice(0, exerciseIndex).filter((x) => x.name === exercise.name).length;
  const routineIndices = program.sessions[sessionIndex]!.exercises.flatMap((x, i) =>
    x.name === exercise.name ? [i] : [],
  );
  const routineIndex = routineIndices[nth];
  const routineExercise =
    routineIndex === undefined ? undefined : program.sessions[sessionIndex]!.exercises[routineIndex];
  return routineExercise instanceof WeightedExerciseBlueprint
    ? { sessionIndex, exerciseIndex: routineIndex! }
    : undefined;
}

/**
 * `rest` with a new min rest, which is the one rest time the app shows (plan decision D5). The max rest
 * rises with it if it has to, so the window never closes before it opens; the failure rest is untouched.
 */
export function withMinRest(rest: Rest, minRest: Duration): Rest {
  return {
    minRest,
    maxRest: rest.maxRest.compareTo(minRest) < 0 ? minRest : rest.maxRest,
    failureRest: rest.failureRest,
  };
}

export function routineExerciseRest(program: ProgramBlueprint, location: RoutineExerciseLocation): Rest | undefined {
  const exercise = program.sessions[location.sessionIndex]?.exercises[location.exerciseIndex];
  return exercise instanceof WeightedExerciseBlueprint ? exercise.restBetweenSets : undefined;
}

export function programWithExerciseRest(
  program: ProgramBlueprint,
  location: RoutineExerciseLocation,
  rest: Rest,
): ProgramBlueprint {
  return program.withSession(location.sessionIndex, (session) => {
    const exercise = session.exercises[location.exerciseIndex];
    if (!(exercise instanceof WeightedExerciseBlueprint)) {
      return session;
    }
    return session.with({
      exercises: session.exercises.with(location.exerciseIndex, exercise.with({ restBetweenSets: rest })),
    });
  });
}

/**
 * The running workout with the exercise's rest changed. Written together with the routine's, so the
 * "Update your routine?" sheet at the finish doesn't ask about the same rest again.
 */
export function sessionWithExerciseRest(session: Session, exerciseIndex: number, rest: Rest): Session {
  const exercise = session.recordedExercises[exerciseIndex];
  if (!(exercise instanceof RecordedWeightedExercise)) {
    return session;
  }
  // The units flag only matters when an edit changes the exercise's type, which a rest never does.
  return session.withEditedExercise(exerciseIndex, exercise.blueprint.with({ restBetweenSets: rest }), false);
}

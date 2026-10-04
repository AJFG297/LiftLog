import { ExerciseBlueprint, ProgramBlueprint, SessionBlueprint } from '@/models/blueprint-models';
import { RecordedExercise, RecordedWeightedExercise, Session } from '@/models/session-models';

/**
 * Each exercise blueprint of a plan, a routine or a workout, put through one function: how the resolver
 * links them and how the exercise merge repoints them.
 */
export type MapBlueprint = <T extends ExerciseBlueprint>(blueprint: T) => T;

export function mapSessionBlueprintExercises(session: SessionBlueprint, map: MapBlueprint): SessionBlueprint {
  return session.with({ exercises: session.exercises.map(map) });
}

export function mapProgramExercises(program: ProgramBlueprint, map: MapBlueprint): ProgramBlueprint {
  return program.with({ sessions: program.sessions.map((x) => mapSessionBlueprintExercises(x, map)) });
}

/** The session with `map` applied to every exercise blueprint in it: its plan's and each recorded one's. */
export function mapSessionExercises(session: Session, map: MapBlueprint): Session {
  return session.with({
    blueprint: mapSessionBlueprintExercises(session.blueprint, map),
    recordedExercises: session.recordedExercises.map(
      (exercise): RecordedExercise =>
        exercise instanceof RecordedWeightedExercise
          ? exercise.with({ blueprint: map(exercise.blueprint) })
          : exercise.with({ blueprint: map(exercise.blueprint) }),
    ),
  });
}

import { lineageKeys, MovementKey, SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { LatestByLineage, nextRecordedExercise } from '@/models/session-models/carry-over';
import type { RecordedExercise } from '@/models/session-models/recorded-exercise';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import { carriedFrom, TodaysTarget, todaysTarget } from '@/models/session-models/todays-target';
import { WeightUnit } from '@/models/weight';

/** Each planned exercise opened through the carry-over logic shared by routine start, add, swap and Do again. */
export function nextSessionExercises(
  routine: SessionBlueprint,
  latest: LatestByLineage,
  unit: WeightUnit,
): RecordedExercise[] {
  const lineages = lineageKeys(routine.exercises);
  return routine.exercises.map((planned, index) => nextRecordedExercise(planned, lineages[index]!, latest, unit));
}

/** What the next session that plans an exercise opens it on, and why. */
export interface NextTime {
  /** The routine it comes from. */
  routineName: string;
  /** The top set and the reason, as the workout's "Today" line will read them. */
  target: TodaysTarget;
  /** A bodyweight movement: its weight is what is added, and none reads as bodyweight. */
  usesBodyweight: boolean;
}

/**
 * The next time `movement` comes up: from the first of `routines` (in the order they come up) that plans it,
 * at its first place there, opened by {@link nextRecordedExercise} as starting that routine would open it,
 * with {@link todaysTarget} saying why. Undefined when no routine plans it.
 */
export function nextTimeOf(
  routines: readonly SessionBlueprint[],
  movement: MovementKey,
  latest: LatestByLineage,
  unit: WeightUnit,
): NextTime | undefined {
  for (const routine of routines) {
    const index = routine.exercises.findIndex((exercise) => exercise.movementKey() === movement);
    const planned = routine.exercises[index];
    if (!(planned instanceof WeightedExerciseBlueprint)) {
      continue;
    }
    // Measured as the workout's Today line measures it (`useTodaysTarget`), so the two read alike. Every
    // performance of a weighted exercise is weighted, so finding none means it was never done.
    const sessionExercises = nextSessionExercises(routine, latest, unit);
    const opened = sessionExercises[index];
    if (!(opened instanceof RecordedWeightedExercise)) {
      continue;
    }
    const previous = carriedFrom(opened, sessionExercises, routine.exercises, latest);
    const target = todaysTarget(opened, previous, previous !== undefined);
    return target && { routineName: routine.name, target, usesBodyweight: planned.resistance === 'bodyweight' };
  }
  return undefined;
}

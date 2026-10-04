import {
  applyEarnedProgression,
  CardioExerciseBlueprint,
  ExerciseBlueprint,
  latestInLineage,
  lineageKeys,
  MovementKey,
  ProgressionKey,
  SessionBlueprint,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { RecordedCardioExercise, RecordedCardioExerciseSet } from '@/models/session-models/recorded-cardio-exercise';
import type { RecordedExercise } from '@/models/session-models/recorded-exercise';
import { PotentialSet, RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import { carriedFrom, TodaysTarget, todaysTarget } from '@/models/session-models/todays-target';
import { Weight, WeightUnit } from '@/models/weight';

/** The latest performance of each lineage (see `lineageKeys`), as the store's `latestExercises` holds them. */
export type LatestByLineage = Readonly<Record<ProgressionKey, RecordedExercise | undefined>>;

/**
 * The exercises a new session of `routine` opens on: each carried on from the latest performance of its
 * lineage and moved by the progression rules it earned. Starting a workout and every screen that says what
 * the next one will be read this, so they never disagree.
 */
export function nextSessionExercises(
  routine: SessionBlueprint,
  latest: LatestByLineage,
  unit: WeightUnit,
): RecordedExercise[] {
  const lineages = lineageKeys(routine.exercises);
  return routine.exercises.map((planned, index) =>
    nextExerciseOf(planned, latestInLineage(latest, lineages[index]!), unit),
  );
}

/** One planned exercise as the next session opens it, after `last`, the latest performance of its lineage. */
export function nextExerciseOf(
  planned: ExerciseBlueprint,
  last: RecordedExercise | undefined,
  unit: WeightUnit,
): RecordedExercise {
  if (planned instanceof CardioExerciseBlueprint) {
    const lastCardio = last instanceof RecordedCardioExercise ? last : undefined;
    return RecordedCardioExercise.empty(planned).with({
      sets: planned.sets.map((s, i) =>
        RecordedCardioExerciseSet.empty(s).with({
          incline: lastCardio?.sets[i]?.incline,
          resistance: lastCardio?.sets[i]?.resistance,
        }),
      ),
    });
  }
  return nextWeightedExerciseOf(planned, last instanceof RecordedWeightedExercise ? last : undefined, unit);
}

/**
 * A weighted exercise as the next session opens it: `last` carried into the plan
 * (`RecordedWeightedExercise.carriedInto`), then moved by the first rule that can move, if `last` earned it.
 * With no `last` it starts from the plan at no weight.
 */
export function nextWeightedExerciseOf(
  planned: WeightedExerciseBlueprint,
  last: RecordedWeightedExercise | undefined,
  unit: WeightUnit,
): RecordedWeightedExercise {
  const carried = last
    ? last.carriedInto(planned, unit)
    : new RecordedWeightedExercise(
        planned,
        planned.plannedSets.map((s) => PotentialSet.of({ weight: new Weight(0, unit), target: s.reps, kind: s.kind })),
        undefined,
      );
  const progressed = last ? applyEarnedProgression(planned.progression, carried, last) : carried;
  // Built from the plan rather than carried, and only now, so a percentage follows today's progressed
  // working weight.
  return progressed.withWarmupsFromPlan(unit);
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
 * at its first place there, opened by {@link nextWeightedExerciseOf} as starting that routine would open it,
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
    const lineage = lineageKeys(routine.exercises)[index]!;
    const last = latestInLineage(latest, lineage);
    const opened = nextWeightedExerciseOf(planned, last instanceof RecordedWeightedExercise ? last : undefined, unit);
    // Measured as the workout's Today line measures it (`useTodaysTarget`), so the two read alike. Every
    // performance of a weighted exercise is weighted, so finding none means it was never done.
    const previous = carriedFrom(opened, lineage, latest);
    const target = todaysTarget(opened, previous, previous !== undefined);
    return target && { routineName: routine.name, target, usesBodyweight: planned.resistance === 'bodyweight' };
  }
  return undefined;
}

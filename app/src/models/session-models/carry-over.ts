import {
  applyEarnedProgression,
  CardioExerciseBlueprint,
  ExerciseBlueprint,
  latestInLineage,
  ProgressionKey,
} from '@/models/blueprint-models';
import { RecordedCardioExercise, RecordedCardioExerciseSet } from '@/models/session-models/recorded-cardio-exercise';
import type { RecordedExercise } from '@/models/session-models/recorded-exercise';
import { PotentialSet, RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import { Weight, WeightUnit } from '@/models/weight';

/** The latest performance of each lineage, keyed by `lineageKeys`, as the store's `latestExercises` is. */
export type LatestByLineage = Readonly<Record<ProgressionKey, RecordedExercise | undefined>>;

/** What an exercise entering a workout is opened from: see {@link nextRecordedExercise}. */
export interface CarryOver {
  latest: LatestByLineage;
  unit: WeightUnit;
}

/**
 * `blueprint` as it opens in a new workout at the place whose lineage is `lineage`: last time's numbers
 * carried onto its sets and moved by any progression rule they earned, with warm-ups built from the plan.
 * Cardio carries incline and resistance. Starting a routine, adding or swapping an exercise and Do again
 * all open exercises through this, so they agree on what "last time" gives.
 */
export function nextRecordedExercise(
  blueprint: ExerciseBlueprint,
  lineage: ProgressionKey,
  latest: LatestByLineage,
  unit: WeightUnit,
): RecordedExercise {
  const lastExercise = latestInLineage(latest, lineage);
  if (blueprint instanceof CardioExerciseBlueprint) {
    const cardioLastExercise = lastExercise instanceof RecordedCardioExercise ? lastExercise : undefined;
    return RecordedCardioExercise.empty(blueprint).with({
      sets: blueprint.sets.map((s, i) =>
        RecordedCardioExerciseSet.empty(s).with({
          incline: cardioLastExercise?.sets[i]?.incline,
          resistance: cardioLastExercise?.sets[i]?.resistance,
        }),
      ),
    });
  }
  const weightedLastExercise = lastExercise instanceof RecordedWeightedExercise ? lastExercise : undefined;
  const newExercise = weightedLastExercise
    ? weightedLastExercise.carriedInto(blueprint, unit)
    : new RecordedWeightedExercise(
        blueprint,
        blueprint.plannedSets.map((s) =>
          PotentialSet.of({ weight: new Weight(0, unit), target: s.reps, kind: s.kind }),
        ),
        undefined,
      );
  const progressed = weightedLastExercise
    ? applyEarnedProgression(blueprint.progression, newExercise, weightedLastExercise)
    : newExercise;
  // Built from the plan rather than carried, and only now, so a percentage follows today's
  // progressed working weight.
  return progressed.withWarmupsFromPlan(unit);
}

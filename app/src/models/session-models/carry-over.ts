import {
  applyEarnedProgression,
  CardioExerciseBlueprint,
  ExerciseBlueprint,
  latestInLineage,
  lineageKeys,
  ProgressionKey,
} from '@/models/blueprint-models';
import { RecordedCardioExercise, RecordedCardioExerciseSet } from '@/models/session-models/recorded-cardio-exercise';
import type { RecordedExercise } from '@/models/session-models/recorded-exercise';
import { PotentialSet, RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import type { Session } from '@/models/session-models/session';
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

/**
 * The workout with the exercise at `index` replaced by a different exercise planned as `blueprint`, opened
 * on what it carries over at that place, as an add would. Sets already logged stay as they were.
 */
export function sessionWithExerciseReplaced(
  session: Session,
  index: number,
  blueprint: ExerciseBlueprint,
  { latest, unit }: CarryOver,
): Session {
  const current = session.recordedExercises[index];
  if (!current) {
    return session;
  }
  const lineage = lineageKeys(session.blueprint.exercises.with(index, blueprint))[index]!;
  return session.withExercise(index, keepingLogged(current, nextRecordedExercise(blueprint, lineage, latest, unit)));
}

/**
 * The exercise editor's edit of the exercise at `index`. Picking another exercise by name, or turning it
 * weighted or cardio, makes it a different movement, which opens as a swap does
 * ({@link sessionWithExerciseReplaced}); any other edit keeps today's numbers (`Session.withEditedExercise`).
 */
export function sessionWithExerciseEdited(
  session: Session,
  index: number,
  blueprint: ExerciseBlueprint,
  carryOver: CarryOver,
): Session {
  const current = session.recordedExercises[index];
  if (!current || current.blueprint.movementKey() !== blueprint.movementKey()) {
    return sessionWithExerciseReplaced(session, index, blueprint, carryOver);
  }
  return session.withEditedExercise(index, blueprint, carryOver.unit === 'pounds');
}

function keepingLogged(current: RecordedExercise, opened: RecordedExercise): RecordedExercise {
  if (current instanceof RecordedWeightedExercise && opened instanceof RecordedWeightedExercise) {
    const keep = (was: readonly PotentialSet[]) => (slot: PotentialSet, i: number) => (was[i]?.set ? was[i] : slot);
    return opened.with({
      potentialSets: opened.potentialSets.map(keep(current.potentialSets)),
      warmupSets: opened.warmupSets.map(keep(current.warmupSets)),
      notes: current.notes,
    });
  }
  if (current instanceof RecordedCardioExercise && opened instanceof RecordedCardioExercise) {
    return opened.with({
      sets: opened.sets.map((set, i) => {
        const was = current.sets[i];
        return was?.completionDateTime || was?.currentBlockStartTime ? was : set;
      }),
      notes: current.notes,
    });
  }
  return opened;
}

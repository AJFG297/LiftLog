import { Resistance } from '@/models/blueprint-models';
import { PotentialSet, RecordedWeightedExercise } from '@/models/session-models';
import { Weight } from '@/models/weight';

/** What makes a tile a warm-up's: it is muted, W-badged, and never has an RPE row. */
export interface WarmupTile {
  /** The plan's percentage of the working weight, shown under the weight. Undefined for any other load. */
  percent: number | undefined;
  /** Last session's same-position warm-up, hinted faintly until this one is logged. */
  previous: WarmupHint | undefined;
}

/** `weight` is left out when there's no load worth showing. */
interface WarmupHint {
  reps: number;
  weight: Weight | undefined;
}

/**
 * The tile for the warm-up at `index`. `previous` is the earlier performance the working sets are
 * compared against (see {@link RecordedWeightedExercise.previousPerformanceIn}); its warm-up at the
 * same position gives the hint. Omit it where no hint is wanted, as in history.
 */
export function warmupTileFor(
  exercise: RecordedWeightedExercise,
  index: number,
  previous?: RecordedWeightedExercise,
): WarmupTile {
  return {
    percent: exercise.warmupPercentAt(index),
    previous: warmupHintFrom(previous?.warmupSets[index], exercise.blueprint.resistance),
  };
}

/**
 * The hint for a previous warm-up slot, when it was logged. The weight is dropped for a movement
 * with no resistance, and for plain bodyweight, where it would only say `BW`.
 */
function warmupHintFrom(slot: PotentialSet | undefined, resistance: Resistance): WarmupHint | undefined {
  if (!slot?.set) {
    return undefined;
  }
  const showsWeight = resistance === 'external' || (resistance === 'bodyweight' && !slot.weight.value.isZero());
  return { reps: slot.set.repsCompleted, weight: showsWeight ? slot.weight : undefined };
}

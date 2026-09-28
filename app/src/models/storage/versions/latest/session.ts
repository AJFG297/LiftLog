import type { BigNumberJSON, DurationJSON, LocalDateJSON, OffsetDateTimeJSON } from '@/models/storage/versions/libs';
import type {
  RepsTargetJSON,
  WeightedExerciseBlueprintJSON,
  CardioExerciseBlueprintJSON,
  DistanceJSON,
  CardioExerciseSetBlueprintJSON,
} from '@/models/storage/versions/latest/blueprint';
import type { WeightJSON } from '@/models/storage/versions/libs/weight';

export interface SessionJSON {
  version: 10;
  id: string;
  blueprint: { name: string; notes: string };
  recordedExercises: RecordedExerciseJSON[];
  date: LocalDateJSON;
  bodyweight: WeightJSON | undefined;
}

/**
 * @discriminator type
 */
export type RecordedExerciseJSON = RecordedCardioExerciseJSON | RecordedWeightedExerciseJSON;

export interface RecordedCardioExerciseSetJSON {
  blueprint: CardioExerciseSetBlueprintJSON;
  completionDateTime?: OffsetDateTimeJSON | undefined;
  duration?: DurationJSON | undefined;
  distance?: DistanceJSON | undefined;
  resistance?: BigNumberJSON | undefined;
  incline?: BigNumberJSON | undefined;
  weight?: WeightJSON | undefined;
  /**
   * @asType integer
   */
  steps?: number | undefined;
}

export interface RecordedCardioExerciseJSON {
  type: 'RecordedCardioExercise';
  blueprint: CardioExerciseBlueprintJSON;
  sets: RecordedCardioExerciseSetJSON[];
  notes?: string | undefined;
}

export interface RecordedWeightedExerciseJSON {
  type: 'RecordedWeightedExercise';
  blueprint: WeightedExerciseBlueprintJSON;
  /** Working sets only; warm-ups live in `warmupSets`. */
  potentialSets: PotentialSetJSON[];
  /** One slot per planned warm-up, rebuilt from the plan every session. Never carries an RPE. */
  warmupSets: PotentialSetJSON[];
  notes?: string | undefined;
}

export interface PotentialSetJSON {
  /** The target this session is chasing for the set, seeded from the blueprint and then its own. */
  target: SetTargetJSON;
  /** Always `warmup` in `warmupSets`. */
  kind: SetKindJSON;
  set?: RecordedSetJSON | undefined;
  weight: WeightJSON;
  /**
   * How hard the set felt, 6-10 in half steps. Lives on the slot rather than the recorded set so it can
   * be picked before the set is logged.
   */
  rpe?: number | undefined;
}

export interface SetTargetJSON {
  reps: RepsTargetJSON;
}

// Spelled out rather than `PlannedSetKindJSON | 'warmup'`: the worker's Kotlin codegen can't turn an anyOf of
// two enums into one class.
export type SetKindJSON = 'working' | 'warmup' | 'drop' | 'myo' | 'failure';

export interface RecordedSetJSON {
  /**
   * @asType integer
   */
  repsCompleted: number;
  completionDateTime: OffsetDateTimeJSON;
}

import {
  DurationJSON,
  InstantJSON,
  RecordedExerciseJSON,
  SessionJSON,
  WeightJSON,
} from '@/models/storage/versions/latest';

/**
 * @discriminator type
 */
export type WorkoutMessagePayload =
  | WorkoutStartedEvent
  | WorkoutUpdatedEvent
  | WorkoutEndedEvent
  | FinishWorkoutCommand;

export type WorkoutMessage = {
  translations: Translations;
  appConfiguration: AppConfiguration;
  payload: WorkoutMessagePayload;
};

export interface WorkoutStartedEvent {
  type: 'WorkoutStartedEvent';
}

export interface WorkoutUpdatedEvent {
  type: 'WorkoutUpdatedEvent';
  workout: SessionJSON;
  restTimerInfo: RestTimerInfo | undefined;
  cardioTimerInfo: CardioTimerInfo | undefined;

  currentExerciseDetails: CurrentExerciseDetails | undefined;
  totalWeightLifted: WeightJSON;
  workoutDuration: DurationJSON;
}

export interface CurrentExerciseDetails {
  exercise: RecordedExerciseJSON;
  /** Which of the exercise's set lists `setIndex` points into. Cardio sets are always `working`. */
  setKind: CurrentSetKind;
  /**
   * @asType integer
   */
  setIndex: number;
}

// The same union as the domain's SetKind, declared again because this file is the worker's wire
// contract: its schema and the generated Kotlin are built from it alone.
export type CurrentSetKind = 'warmup' | 'working';

export interface CardioTimerInfo {
  currentDuration: DurationJSON;
  currentBlockStartTime: InstantJSON | undefined;
  /**
   * @asType integer
   */
  exerciseIndex: number;
  /**
   * @asType integer
   */
  setIndex: number;
}

export interface RestTimerInfo {
  startedAt: InstantJSON;
  partiallyEndAt: InstantJSON;
  endAt: InstantJSON;
}

export interface WorkoutEndedEvent {
  type: 'WorkoutEndedEvent';
}

export interface FinishWorkoutCommand {
  type: 'FinishWorkoutCommand';
}

export interface Translations {
  workoutPersistentNotificationRestBreakMessage: string;
  workoutPersistentNotificationStartSoonMessage: string;
  workoutPersistentNotificationStartNowMessage: string;
  workoutPersistentNotificationMinRestOverMessage: string;
  workoutPersistentNotificationMaxRestOverMessage: string;
  workoutPersistentNotificationCurrentExerciseMessage: string;

  // Labels a warm-up as the current set, e.g. "Warm-up: 5 × 60kg". $SET$ is the reps and weight.
  workoutPersistentNotificationWarmupSetMessage: string;

  // Fired once when a cardio set reaches its target; the set keeps running afterwards.
  workoutPersistentNotificationCardioTargetReachedMessage: string;

  workoutPersistentNotificationFinishedMessage: string;

  // The initial content of the notification "Workout in progress"
  workoutPersistentNotificationInProgressMessage: string;

  // The text displayed on the action button to finish the workout
  workoutPersistentNotificationFinishWorkoutAction: string;
}

export interface AppConfiguration {
  notificationsEnabled: boolean;
}

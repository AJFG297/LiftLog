import {
  cardioSetsSchema,
  warmupSetsSchema,
  weightedSetsSchema,
  workoutExercisesSchema,
  workoutsSchema,
} from '@/db/schema';
import { RecordedCardioExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import {
  RecordedCardioExerciseJSON,
  RecordedCardioExerciseSetJSON,
  RecordedExerciseJSON,
  RecordedWeightedExerciseJSON,
  SessionBlueprintJSON,
  SessionJSON,
} from '@/models/storage/versions/latest';
import { sessionBlueprintMigrations } from '@/models/storage/versions/migrations';
import { AnyVersionSessionBlueprintJSON } from '@/models/storage/versions/any';
import { sessionVolume } from '@/store/activity/volume';
import { getSessionReferenceTime } from '@/store/stored-sessions';
import { OffsetDateTime } from '@js-joda/core';
import { getTableColumns, Table } from 'drizzle-orm';

export type WorkoutRow = Omit<typeof workoutsSchema.$inferSelect, 'active'>;
export type WorkoutExerciseRow = typeof workoutExercisesSchema.$inferSelect;
export type WeightedSetRow = typeof weightedSetsSchema.$inferSelect;
export type WarmupSetRow = typeof warmupSetsSchema.$inferSelect;
export type CardioSetRow = typeof cardioSetsSchema.$inferSelect;

/** Everything one workout is stored as. Child rows carry the workout id, so they can be written and deleted by it. */
export interface WorkoutRows {
  workout: WorkoutRow;
  exercises: WorkoutExerciseRow[];
  weightedSets: WeightedSetRow[];
  warmupSets: WarmupSetRow[];
  cardioSets: CardioSetRow[];
}

/**
 * The columns {@link fromWorkoutRows} reads back. The query columns are computed on write for SQL and never
 * rebuild a `Session`, so hydration leaves them out.
 */
export const readColumns = {
  workout: omitColumns(workoutsSchema, ['referenceTimeMs', 'volumeKg']),
  exercise: omitColumns(workoutExercisesSchema, ['kind', 'movementKey', 'progressionKey', 'latestTimeMs']),
  weightedSet: omitColumns(weightedSetsSchema, ['weightKg', 'effectiveWeightKg', 'completedAtMs']),
  warmupSet: getTableColumns(warmupSetsSchema),
  cardioSet: omitColumns(cardioSetsSchema, ['completedAtMs']),
};

/** What {@link fromWorkoutRows} needs: {@link WorkoutRows} without the query columns. */
export interface StoredWorkoutRows {
  workout: Omit<WorkoutRow, 'referenceTimeMs' | 'volumeKg'>;
  exercises: Omit<WorkoutExerciseRow, 'kind' | 'movementKey' | 'progressionKey' | 'latestTimeMs'>[];
  weightedSets: Omit<WeightedSetRow, 'weightKg' | 'effectiveWeightKg' | 'completedAtMs'>[];
  warmupSets: WarmupSetRow[];
  cardioSets: Omit<CardioSetRow, 'completedAtMs'>[];
}

function omitColumns<TTable extends Table, TKey extends keyof TTable['_']['columns']>(table: TTable, keys: TKey[]) {
  return Object.fromEntries(
    Object.entries(getTableColumns(table)).filter(([key]) => !keys.includes(key as TKey)),
  ) as Omit<TTable['_']['columns'], TKey>;
}

/**
 * Splits a session into rows. The exact values come from `toJSON()`, so a row holds precisely what the old
 * payload did; the query columns come from the domain methods that compute them in JS, so SQL can't drift
 * from what the app shows.
 */
export function toWorkoutRows(session: Session): WorkoutRows {
  const json = session.toJSON();
  const workoutId = session.id;
  const exercises: WorkoutExerciseRow[] = [];
  const weightedSets: WeightedSetRow[] = [];
  const warmupSets: WarmupSetRow[] = [];
  const cardioSets: CardioSetRow[] = [];

  session.recordedExercises.forEach((exercise, exercisePosition) => {
    const exerciseJson = json.recordedExercises[exercisePosition]!;
    exercises.push({
      workoutId,
      position: exercisePosition,
      kind: exerciseJson.type === 'RecordedWeightedExercise' ? 'weighted' : 'cardio',
      movementKey: exercise.movementKey(),
      progressionKey: exercise.progressionKey(),
      latestTimeMs: epochMs(exercise.latestTime),
      notes: exerciseJson.notes ?? null,
      blueprint: exerciseJson.blueprint,
    });

    if (exercise instanceof RecordedWeightedExercise && exerciseJson.type === 'RecordedWeightedExercise') {
      exercise.potentialSets.forEach((potentialSet, position) => {
        const setJson = exerciseJson.potentialSets[position]!;
        weightedSets.push({
          workoutId,
          exercisePosition,
          position,
          targetRepsMin: setJson.target.reps.min,
          targetRepsMax: setJson.target.reps.max,
          weightValue: setJson.weight.value,
          weightUnit: setJson.weight.unit,
          weightKg: potentialSet.weight.convertTo('kilograms').value.toNumber(),
          effectiveWeightKg: exercise
            .effectiveWeight(potentialSet, session.bodyweight)
            .convertTo('kilograms')
            .value.toNumber(),
          rpe: setJson.rpe ?? null,
          reps: setJson.set?.repsCompleted ?? null,
          completedAt: setJson.set?.completionDateTime ?? null,
          completedAtMs: epochMs(potentialSet.set?.completionDateTime),
        });
      });
      exerciseJson.warmupSets.forEach((setJson, position) => {
        warmupSets.push({
          workoutId,
          exercisePosition,
          position,
          targetRepsMin: setJson.target.reps.min,
          targetRepsMax: setJson.target.reps.max,
          weightValue: setJson.weight.value,
          weightUnit: setJson.weight.unit,
          reps: setJson.set?.repsCompleted ?? null,
          completedAt: setJson.set?.completionDateTime ?? null,
        });
      });
    } else if (exercise instanceof RecordedCardioExercise && exerciseJson.type === 'RecordedCardioExercise') {
      exercise.sets.forEach((set, position) => {
        const setJson = exerciseJson.sets[position]!;
        cardioSets.push({
          workoutId,
          exercisePosition,
          position,
          blueprint: setJson.blueprint,
          completedAt: setJson.completionDateTime ?? null,
          completedAtMs: epochMs(set.completionDateTime),
          duration: setJson.duration ?? null,
          distanceValue: setJson.distance?.value ?? null,
          distanceUnit: setJson.distance?.unit ?? null,
          resistance: setJson.resistance ?? null,
          incline: setJson.incline ?? null,
          weightValue: setJson.weight?.value ?? null,
          weightUnit: setJson.weight?.unit ?? null,
          steps: setJson.steps ?? null,
        });
      });
    }
  });

  return {
    workout: {
      id: workoutId,
      blueprintVersion: session.blueprint.toJSON().version,
      date: json.date,
      name: json.blueprint.name,
      notes: json.blueprint.notes,
      bodyweightValue: json.bodyweight?.value ?? null,
      bodyweightUnit: json.bodyweight?.unit ?? null,
      referenceTimeMs: epochMs(getSessionReferenceTime(session))!,
      volumeKg: sessionVolume(session),
    },
    exercises,
    weightedSets,
    warmupSets,
    cardioSets,
  };
}

/** Rebuilds the session {@link toWorkoutRows} was given. Child rows may arrive in any order. */
export function fromWorkoutRows(rows: StoredWorkoutRows): Session {
  const { workout } = rows;
  const exercises = rows.exercises.toSorted(byPosition);
  const weightedSets = groupByExercise(rows.weightedSets);
  const warmupSets = groupByExercise(rows.warmupSets);
  const cardioSets = groupByExercise(rows.cardioSets);

  const blueprint = sessionBlueprintMigrations.migrate({
    version: workout.blueprintVersion,
    name: workout.name,
    notes: workout.notes,
    exercises: exercises.map((x) => x.blueprint),
  } as AnyVersionSessionBlueprintJSON);

  const json: SessionJSON = {
    version: 9,
    id: workout.id,
    blueprint: { name: workout.name, notes: workout.notes },
    date: workout.date,
    bodyweight:
      workout.bodyweightValue !== null && workout.bodyweightUnit !== null
        ? { value: workout.bodyweightValue, unit: workout.bodyweightUnit }
        : undefined,
    recordedExercises: exercises.map((exercise, index) =>
      toRecordedExerciseJSON(
        exercise,
        blueprint.exercises[index]!,
        weightedSets.get(exercise.position) ?? [],
        warmupSets.get(exercise.position) ?? [],
        cardioSets.get(exercise.position) ?? [],
      ),
    ),
  };
  return Session.fromJSON(json);
}

function toRecordedExerciseJSON(
  exercise: StoredWorkoutRows['exercises'][number],
  blueprint: SessionBlueprintJSON['exercises'][number],
  weightedSets: StoredWorkoutRows['weightedSets'],
  warmupSets: StoredWorkoutRows['warmupSets'],
  cardioSets: StoredWorkoutRows['cardioSets'],
): RecordedExerciseJSON {
  const notes = exercise.notes ?? undefined;
  if (blueprint.type === 'WeightedExerciseBlueprint') {
    return {
      type: 'RecordedWeightedExercise',
      blueprint,
      notes,
      potentialSets: weightedSets.map((set): RecordedWeightedExerciseJSON['potentialSets'][number] => ({
        target: { reps: { min: set.targetRepsMin, max: set.targetRepsMax } },
        weight: { value: set.weightValue, unit: set.weightUnit },
        rpe: set.rpe ?? undefined,
        set:
          set.reps !== null && set.completedAt !== null
            ? { repsCompleted: set.reps, completionDateTime: set.completedAt }
            : undefined,
      })),
      warmupSets: warmupSets.map((set): RecordedWeightedExerciseJSON['warmupSets'][number] => ({
        target: { reps: { min: set.targetRepsMin, max: set.targetRepsMax } },
        weight: { value: set.weightValue, unit: set.weightUnit },
        set:
          set.reps !== null && set.completedAt !== null
            ? { repsCompleted: set.reps, completionDateTime: set.completedAt }
            : undefined,
      })),
    };
  }
  return {
    type: 'RecordedCardioExercise',
    blueprint,
    notes,
    sets: cardioSets.map(
      (set): RecordedCardioExerciseSetJSON => ({
        blueprint: set.blueprint,
        completionDateTime: set.completedAt ?? undefined,
        duration: set.duration ?? undefined,
        distance:
          set.distanceValue !== null && set.distanceUnit !== null
            ? { value: set.distanceValue, unit: set.distanceUnit }
            : undefined,
        resistance: set.resistance ?? undefined,
        incline: set.incline ?? undefined,
        weight:
          set.weightValue !== null && set.weightUnit !== null
            ? { value: set.weightValue, unit: set.weightUnit }
            : undefined,
        steps: set.steps ?? undefined,
      }),
    ),
  } satisfies RecordedCardioExerciseJSON;
}

/**
 * Whether two sessions would be stored the same. Only what `toJSON()` writes counts, so a change to the rest
 * timer or a running cardio timer is not a change to the workout.
 */
export function samePersistedContent(a: Session, b: Session): boolean {
  return a === b || JSON.stringify(a.toJSON()) === JSON.stringify(b.toJSON());
}

function epochMs(time: OffsetDateTime | undefined): number | null {
  return time ? time.toInstant().toEpochMilli() : null;
}

function byPosition(a: { position: number }, b: { position: number }) {
  return a.position - b.position;
}

function groupByExercise<T extends { exercisePosition: number; position: number }>(rows: T[]): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const group = grouped.get(row.exercisePosition);
    if (group) {
      group.push(row);
    } else {
      grouped.set(row.exercisePosition, [row]);
    }
  }
  for (const group of grouped.values()) {
    group.sort(byPosition);
  }
  return grouped;
}

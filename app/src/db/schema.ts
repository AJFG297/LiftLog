import {
  AnyVersionExerciseDescriptorJSON,
  AnyVersionFeedIdentityJSON,
  AnyVersionFollowedFeedUserJSON,
  AnyVersionFollowerFeedUserJSON,
  AnyVersionFollowRequestInboxMessageJSON,
  AnyVersionPendingFeedUserJSON,
  AnyVersionProgramBlueprintJSON,
  AnyVersionReceivedReactionJSON,
  AnyVersionSentReactionJSON,
  AnyVersionSessionBlueprintJSON,
  AnyVersionSessionUserEventJSON,
} from '@/models/storage/versions/any';
import { BackendFeature, BackendKind } from '@/models/backend';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type {
  BigNumberJSON,
  CardioExerciseSetBlueprintJSON,
  DistanceUnitJSON,
  DurationJSON,
  LocalDateJSON,
  OffsetDateTimeJSON,
  WeightUnitJSON,
} from '@/models/storage/versions/latest';

/**
 * A workout: the user's history and the one in progress. Its exercises and sets live in the child tables
 * below, and every write replaces all of one workout's child rows at once (see `WorkoutRepository`).
 *
 * Columns ending in `_ms` / `_kg` and the keys are computed on write from the domain model, so SQL can
 * order and aggregate what the JS methods compute; they are never read back into a `Session`.
 */
type AnyVersionExerciseBlueprintJSON = AnyVersionSessionBlueprintJSON['exercises'][number];

export const workoutsSchema = sqliteTable(
  'workout',
  {
    id: text().primaryKey(),
    // The workout currently in progress, if any. At most one row may be active.
    active: integer({ mode: 'boolean' }).notNull().default(false),
    // The `SessionBlueprintJSON` version the exercise blueprints below were written at.
    blueprintVersion: integer('blueprint_version').notNull(),
    date: text().$type<LocalDateJSON>().notNull(),
    name: text().notNull(),
    notes: text().notNull(),
    bodyweightValue: text('bodyweight_value').$type<BigNumberJSON>(),
    bodyweightUnit: text('bodyweight_unit').$type<WeightUnitJSON>(),
    // `getSessionReferenceTime`: the latest set, or the start of the day in the writer's zone.
    referenceTimeMs: integer('reference_time_ms').notNull(),
    volumeKg: real('volume_kg').notNull(),
  },
  (table) => [
    uniqueIndex('single_active_workout')
      .on(table.active)
      .where(sql`${table.active} = 1`),
    index('workout_date').on(table.date),
    index('workout_reference_time').on(table.referenceTimeMs),
  ],
);

export const workoutExercisesSchema = sqliteTable(
  'workout_exercise',
  {
    workoutId: text('workout_id')
      .notNull()
      .references(() => workoutsSchema.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    kind: text().$type<'weighted' | 'cardio'>().notNull(),
    movementKey: text('movement_key').notNull(),
    progressionKey: text('progression_key').notNull(),
    latestTimeMs: integer('latest_time_ms'),
    notes: text(),
    // Migrated on read by `sessionBlueprintMigrations`, at the workout's `blueprint_version`.
    blueprint: text({ mode: 'json' }).$type<AnyVersionExerciseBlueprintJSON>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workoutId, table.position] }),
    index('workout_exercise_movement').on(table.movementKey, table.latestTimeMs),
    index('workout_exercise_progression').on(table.progressionKey, table.latestTimeMs),
  ],
);

/** One slot of a weighted exercise. An unlogged slot has no reps or completion time, but keeps its weight, target and RPE. */
export const weightedSetsSchema = sqliteTable(
  'weighted_set',
  {
    workoutId: text('workout_id').notNull(),
    exercisePosition: integer('exercise_position').notNull(),
    position: integer().notNull(),
    targetRepsMin: integer('target_reps_min').notNull(),
    targetRepsMax: integer('target_reps_max').notNull(),
    // Exact, as the user entered it. `weight_kg` is the same weight converted, for aggregates.
    weightValue: text('weight_value').$type<BigNumberJSON>().notNull(),
    weightUnit: text('weight_unit').$type<WeightUnitJSON>().notNull(),
    weightKg: real('weight_kg').notNull(),
    // The load actually moved: bodyweight folded in for bodyweight movements, zero for unloaded ones.
    effectiveWeightKg: real('effective_weight_kg').notNull(),
    rpe: real(),
    reps: integer(),
    // Exact, offset included. `completed_at_ms` is the same instant, for ordering across offsets.
    completedAt: text('completed_at').$type<OffsetDateTimeJSON>(),
    completedAtMs: integer('completed_at_ms'),
  },
  (table) => [
    primaryKey({ columns: [table.workoutId, table.exercisePosition, table.position] }),
    foreignKey({
      columns: [table.workoutId, table.exercisePosition],
      foreignColumns: [workoutExercisesSchema.workoutId, workoutExercisesSchema.position],
    }).onDelete('cascade'),
  ],
);

/**
 * One warm-up slot of a weighted exercise, kept apart from `weighted_set` the way the model keeps
 * warm-ups apart from working sets: every aggregate over `weighted_set` leaves them out without a
 * filter. Warm-ups are never summed or ranked, so there are no query columns and no RPE.
 */
export const warmupSetsSchema = sqliteTable(
  'warmup_set',
  {
    workoutId: text('workout_id').notNull(),
    exercisePosition: integer('exercise_position').notNull(),
    position: integer().notNull(),
    targetRepsMin: integer('target_reps_min').notNull(),
    targetRepsMax: integer('target_reps_max').notNull(),
    weightValue: text('weight_value').$type<BigNumberJSON>().notNull(),
    weightUnit: text('weight_unit').$type<WeightUnitJSON>().notNull(),
    reps: integer(),
    completedAt: text('completed_at').$type<OffsetDateTimeJSON>(),
  },
  (table) => [
    primaryKey({ columns: [table.workoutId, table.exercisePosition, table.position] }),
    foreignKey({
      columns: [table.workoutId, table.exercisePosition],
      foreignColumns: [workoutExercisesSchema.workoutId, workoutExercisesSchema.position],
    }).onDelete('cascade'),
  ],
);

export const cardioSetsSchema = sqliteTable(
  'cardio_set',
  {
    workoutId: text('workout_id').notNull(),
    exercisePosition: integer('exercise_position').notNull(),
    position: integer().notNull(),
    // The set's own copy of what was planned; it can differ from the exercise blueprint's.
    blueprint: text({ mode: 'json' }).$type<CardioExerciseSetBlueprintJSON>().notNull(),
    completedAt: text('completed_at').$type<OffsetDateTimeJSON>(),
    completedAtMs: integer('completed_at_ms'),
    duration: text().$type<DurationJSON>(),
    distanceValue: text('distance_value').$type<BigNumberJSON>(),
    distanceUnit: text('distance_unit').$type<DistanceUnitJSON>(),
    resistance: text().$type<BigNumberJSON>(),
    incline: text().$type<BigNumberJSON>(),
    weightValue: text('weight_value').$type<BigNumberJSON>(),
    weightUnit: text('weight_unit').$type<WeightUnitJSON>(),
    steps: integer(),
  },
  (table) => [
    primaryKey({ columns: [table.workoutId, table.exercisePosition, table.position] }),
    foreignKey({
      columns: [table.workoutId, table.exercisePosition],
      foreignColumns: [workoutExercisesSchema.workoutId, workoutExercisesSchema.position],
    }).onDelete('cascade'),
  ],
);

export const exercisesSchema = sqliteTable('exercise', {
  id: text().primaryKey(),
  payload: text('payload', { mode: 'json' }).$type<AnyVersionExerciseDescriptorJSON>().notNull(),
});

export const programsSchema = sqliteTable(
  'program',
  {
    id: text().primaryKey(),
    active: integer({ mode: 'boolean' }).notNull(),
    payload: text('payload', { mode: 'json' }).$type<AnyVersionProgramBlueprintJSON>().notNull(),
  },
  (table) => [
    uniqueIndex('single_active_program')
      .on(table.active)
      .where(sql`${table.active} = 1`),
  ],
);

export const feedIdentitySchema = sqliteTable(
  'feed_identity',
  {
    id: integer().primaryKey(),
    payload: text('payload', { mode: 'json' }).$type<AnyVersionFeedIdentityJSON>().notNull(),
  },
  () => [check('single_feed_identity', sql`id = 0`)],
);

export const feedFollowedUsersSchema = sqliteTable('feed_followed_user', {
  id: text().primaryKey(),
  payload: text('payload', { mode: 'json' }).$type<AnyVersionFollowedFeedUserJSON>().notNull(),
});
export const feedPendingUsersSchema = sqliteTable('feed_pending_user', {
  id: text().primaryKey(),
  payload: text('payload', { mode: 'json' }).$type<AnyVersionPendingFeedUserJSON>().notNull(),
});
export const feedItemsSchema = sqliteTable('feed_items', {
  id: text().primaryKey(),
  payload: text('payload', { mode: 'json' }).$type<AnyVersionSessionUserEventJSON>().notNull(),
});

export const feedFollowerUsersSchema = sqliteTable('feed_follower_user', {
  id: text().primaryKey(),
  payload: text('payload', { mode: 'json' }).$type<AnyVersionFollowerFeedUserJSON>().notNull(),
});

export const feedFollowRequestsSchema = sqliteTable('feed_follow_request', {
  id: text().primaryKey(),
  payload: text('payload', { mode: 'json' }).$type<AnyVersionFollowRequestInboxMessageJSON>().notNull(),
});

// id is the reactionId, so a redelivered cheer upserts over itself instead of inflating the count.
export const feedReactionsSchema = sqliteTable('feed_reaction', {
  id: text().primaryKey(),
  payload: text('payload', { mode: 'json' }).$type<AnyVersionReceivedReactionJSON>().notNull(),
});

export const feedSentReactionsSchema = sqliteTable('feed_sent_reaction', {
  id: text().primaryKey(),
  payload: text('payload', { mode: 'json' }).$type<AnyVersionSentReactionJSON>().notNull(),
});

export const feedRevokedFollowSecretsSchema = sqliteTable('feed_revoked_follow_secrets', {
  secret: text().primaryKey(),
});
export const feedUnpublishedSessionsSchema = sqliteTable('feed_unpublished_sessions', {
  sessionId: text().primaryKey(),
});

// Just a table we can use to keep track of which data migrations have been run
export const dataMigrationsSchema = sqliteTable('data_migration', {
  id: text().primaryKey(),
});

export const backendsSchema = sqliteTable('backend', {
  id: text().primaryKey(),
  name: text().notNull(),
  url: text().notNull(),
  kind: text().$type<BackendKind>().notNull(),
});

export const backendHeadersSchema = sqliteTable(
  'backend_header',
  {
    backendId: text()
      .notNull()
      .references(() => backendsSchema.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    value: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.backendId, table.name] })],
);

// A missing row means the feature has no backend and does not run.
export const backendAssignmentsSchema = sqliteTable('backend_assignment', {
  feature: text().$type<BackendFeature>().primaryKey(),
  backendId: text().notNull(),
});

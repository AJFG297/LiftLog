import { match } from 'ts-pattern';
import {
  CardioExerciseBlueprint,
  CardioExerciseSetBlueprint,
  CardioTarget,
  cardioTargetEquals,
  ExerciseBlueprint,
  IncreaseStrategy,
  Resistance,
  ProgressionRule,
  progressionEquals,
  formatPlannedSets,
  formatPlannedWarmupSets,
  PlannedSet,
  PlannedWarmupSet,
  plannedSetsEqual,
  plannedWarmupSetsEqual,
  Rest,
  restEquals,
  SessionBlueprint,
  WeightedExerciseBlueprint,
} from './blueprint-models';
import { TranslationKey, UseTranslateResult } from '@tolgee/react';
import { uuid } from '@/utils/uuid';
import { EmptySession } from '@/models/session-models';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';

// ============================================================================
// Change Types
// ============================================================================

type ChangeType = 'added' | 'removed' | 'modified' | 'reordered';

/**
 * Base interface for all changes. Each change has a unique ID for selection.
 */
interface BaseChange {
  id: string;
  type: ChangeType;
}

// ============================================================================
// Session-Level Changes
// ============================================================================

interface SessionNameChange extends BaseChange {
  kind: 'sessionName';
  type: 'modified';
  oldValue: string;
  newValue: string;
}

interface SessionNotesChange extends BaseChange {
  kind: 'sessionNotes';
  type: 'modified';
  oldValue: string;
  newValue: string;
}

type SessionChange = SessionNameChange | SessionNotesChange;

// ============================================================================
// Exercise-Level Changes
// ============================================================================

interface ExerciseAddedChange extends BaseChange {
  kind: 'exercise';
  type: 'added';
  exercise: ExerciseBlueprint;
  newIndex: number;
}

interface ExerciseRemovedChange extends BaseChange {
  kind: 'exercise';
  type: 'removed';
  exercise: ExerciseBlueprint;
  oldIndex: number;
}

interface ExerciseReorderedChange extends BaseChange {
  kind: 'exercise';
  type: 'reordered';
  exerciseName: string;
  oldIndex: number;
  newIndex: number;
}

type ExerciseStructureChange = ExerciseAddedChange | ExerciseRemovedChange | ExerciseReorderedChange;

// ============================================================================
// Exercise Field Changes (for modified exercises)
// ============================================================================

interface ExerciseNameChange extends BaseChange {
  kind: 'exerciseName';
  type: 'modified';
  exerciseIndex: number;
  oldValue: string;
  newValue: string;
  /** A new name is usually a different exercise, swapped in during the workout: the plan takes its id too. */
  newExerciseId: string;
}

/** Set count and rep targets are one list, so they change together. */
interface ExercisePlannedSetsChange extends BaseChange {
  kind: 'exercisePlannedSets';
  type: 'modified';
  exerciseName: string;
  exerciseIndex: number;
  oldValue: PlannedSet[];
  newValue: PlannedSet[];
}

/** Warm-ups are compared in full, loads included - the planned-set change only looks at reps. */
interface ExerciseWarmupSetsChange extends BaseChange {
  kind: 'exerciseWarmupSets';
  type: 'modified';
  exerciseName: string;
  exerciseIndex: number;
  oldValue: PlannedWarmupSet[];
  newValue: PlannedWarmupSet[];
}

interface ExerciseProgressionChange extends BaseChange {
  kind: 'progression';
  type: 'modified';
  exerciseName: string;
  exerciseIndex: number;
  oldValue: ProgressionRule[];
  newValue: ProgressionRule[];
}

/** Grouped rest settings change */
interface ExerciseRestChange extends BaseChange {
  kind: 'exerciseRest';
  type: 'modified';
  exerciseName: string;
  exerciseIndex: number;
  oldValue: Rest;
  newValue: Rest;
}

interface ExerciseSupersetChange extends BaseChange {
  kind: 'exerciseSuperset';
  type: 'modified';
  exerciseName: string;
  exerciseIndex: number;
  oldValue: boolean;
  newValue: boolean;
}

interface ExerciseResistanceChange extends BaseChange {
  kind: 'exerciseResistance';
  type: 'modified';
  exerciseName: string;
  exerciseIndex: number;
  oldValue: Resistance;
  newValue: Resistance;
}

interface ExerciseNotesChange extends BaseChange {
  kind: 'exerciseNotes';
  type: 'modified';
  exerciseName: string;
  exerciseIndex: number;
  oldValue: string;
  newValue: string;
}

interface ExerciseLinkChange extends BaseChange {
  kind: 'exerciseLink';
  type: 'modified';
  exerciseName: string;
  exerciseIndex: number;
  oldValue: string;
  newValue: string;
}

// Cardio-specific changes
interface ExerciseTargetChange extends BaseChange {
  kind: 'exerciseTarget';
  type: 'modified';
  exerciseName: string;
  exerciseIndex: number;
  setIndex: number;
  oldValue: CardioTarget;
  newValue: CardioTarget;
}

interface ExerciseTrackingChange extends BaseChange {
  kind: 'exerciseTracking';
  type: 'modified';
  exerciseName: string;
  exerciseIndex: number;
  setIndex: number;
  field: Extract<keyof CardioExerciseSetBlueprint, `track${string}`>;
  oldValue: boolean;
  newValue: boolean;
}

/** A cardio set was added */
interface CardioSetAddedChange extends BaseChange {
  kind: 'cardioSet';
  type: 'added';
  exerciseName: string;
  exerciseIndex: number;
  setIndex: number;
  set: CardioExerciseSetBlueprint;
}

/** A cardio set was removed */
interface CardioSetRemovedChange extends BaseChange {
  kind: 'cardioSet';
  type: 'removed';
  exerciseName: string;
  exerciseIndex: number;
  setIndex: number;
  set: CardioExerciseSetBlueprint;
}

/** A cardio set was modified */
interface CardioSetModifiedChange extends BaseChange {
  kind: 'cardioSetModified';
  type: 'modified';
  exerciseName: string;
  exerciseIndex: number;
  setIndex: number;
  oldSet: CardioExerciseSetBlueprint;
  newSet: CardioExerciseSetBlueprint;
}

type CardioSetChange = CardioSetAddedChange | CardioSetRemovedChange | CardioSetModifiedChange;

/** Exercise type changed (weighted <-> cardio) */
interface ExerciseTypeChange extends BaseChange {
  kind: 'exerciseType';
  type: 'modified';
  exerciseIndex: number;
  oldExercise: ExerciseBlueprint;
  newExercise: ExerciseBlueprint;
}

type ExerciseFieldChange =
  | ExerciseNameChange
  | ExercisePlannedSetsChange
  | ExerciseWarmupSetsChange
  | ExerciseProgressionChange
  | ExerciseRestChange
  | ExerciseSupersetChange
  | ExerciseResistanceChange
  | ExerciseNotesChange
  | ExerciseLinkChange
  | ExerciseTargetChange
  | ExerciseTrackingChange
  | ExerciseTypeChange
  | CardioSetChange;

// ============================================================================
// Aggregated Types
// ============================================================================

export type DiffChange = SessionChange | ExerciseStructureChange | ExerciseFieldChange;

/**
 * Groups all changes for a single exercise that was modified
 */
export interface ExerciseModification {
  exerciseName: string;
  exerciseIndex: number;
  /** Where the exercise is in the original session. */
  originalIndex: number;
  changes: ExerciseFieldChange[];
}

/**
 * A pending change to a plan. It is computed when a workout finishes but only applied once the user
 * confirms it, so it carries the plan it was computed against — by the time it is applied, a
 * different plan may be active, or the workout may have moved within its plan.
 */
export type PlanDiff =
  | {
      type: 'diff';
      programId: string;
      sessionIndex: number;
      diff: SessionBlueprintDiff;
    }
  | {
      type: 'add';
      programId: string;
      diff: SessionBlueprintDiff;
    };

export const EmptySessionBlueprintDiff: SessionBlueprintDiff = {
  hasChanges: false,
  addedExercises: [],
  allChanges: [],
  modifiedExercises: [],
  removedExercises: [],
  reorderedExercises: [],
  sessionChanges: [],
  originalSession: EmptySession.blueprint,
  newSession: EmptySession.blueprint,
};

/**
 * The complete diff between two SessionBlueprints
 */
export interface SessionBlueprintDiff {
  /** True if there are any changes */
  hasChanges: boolean;

  /** Session-level changes (name, notes) */
  sessionChanges: SessionChange[];

  /** Exercises that were added */
  addedExercises: ExerciseAddedChange[];

  /** Exercises that were removed */
  removedExercises: ExerciseRemovedChange[];

  /** Exercises that were reordered (but not added/removed) */
  reorderedExercises: ExerciseReorderedChange[];

  /** Exercises that were modified (field-level changes) */
  modifiedExercises: ExerciseModification[];

  /** Flat list of all changes for easy iteration */
  allChanges: DiffChange[];

  originalSession: SessionBlueprint;
  newSession: SessionBlueprint;
}

// ============================================================================
// Diff Implementation
// ============================================================================

function generateChangeId(): string {
  return `change_${uuid()}`;
}

interface MatchedExercise {
  oldExercise: ExerciseBlueprint;
  newExercise: ExerciseBlueprint;
  oldIndex: number;
  newIndex: number;
}

interface ExerciseWithIndex {
  exercise: ExerciseBlueprint;
  index: number;
}

/**
 * Match exercises by name. Among duplicates, an exercise that did not change is matched with itself
 * wherever it sits; the rest pair up in order.
 */
function matchExercisesByName(
  oldExercises: readonly ExerciseBlueprint[],
  newExercises: readonly ExerciseBlueprint[],
): {
  matched: MatchedExercise[];
  added: ExerciseWithIndex[];
  removed: ExerciseWithIndex[];
} {
  const matched: MatchedExercise[] = [];
  const added: ExerciseWithIndex[] = [];
  const removed: ExerciseWithIndex[] = [];

  // Track which exercises have been matched
  const matchedOldIndices = new Set<number>();
  const matchedNewIndices = new Set<number>();

  // Group exercises by name for both old and new
  const oldByName = new Map<string, number[]>();
  const newByName = new Map<string, number[]>();

  oldExercises.forEach((ex, idx) => {
    const indices = oldByName.get(ex.name) ?? [];
    indices.push(idx);
    oldByName.set(ex.name, indices);
  });

  newExercises.forEach((ex, idx) => {
    const indices = newByName.get(ex.name) ?? [];
    indices.push(idx);
    newByName.set(ex.name, indices);
  });

  for (const [name, oldIndices] of oldByName) {
    const unmatchedNew = [...(newByName.get(name) ?? [])];
    const unmatchedOld: number[] = [];

    // Two same-named exercises that differ in nothing are the same exercise, wherever each sits: a
    // workout that did its two bench slots the other way round is a reorder, not two edited exercises.
    for (const oldIdx of oldIndices) {
      const twin = unmatchedNew.findIndex((newIdx) => newExercises[newIdx]!.equals(oldExercises[oldIdx]));
      if (twin === -1) {
        unmatchedOld.push(oldIdx);
      } else {
        pair(oldIdx, unmatchedNew[twin]!);
        unmatchedNew.splice(twin, 1);
      }
    }
    // The rest pair up by their relative position within the name group.
    unmatchedOld.slice(0, unmatchedNew.length).forEach((oldIdx, i) => pair(oldIdx, unmatchedNew[i]!));
  }

  function pair(oldIdx: number, newIdx: number) {
    matched.push({
      oldExercise: oldExercises[oldIdx]!,
      newExercise: newExercises[newIdx]!,
      oldIndex: oldIdx,
      newIndex: newIdx,
    });
    matchedOldIndices.add(oldIdx);
    matchedNewIndices.add(newIdx);
  }

  // Collect unmatched as removed/added
  oldExercises.forEach((ex, idx) => {
    if (!matchedOldIndices.has(idx)) {
      removed.push({ exercise: ex, index: idx });
    }
  });

  newExercises.forEach((ex, idx) => {
    if (!matchedNewIndices.has(idx)) {
      added.push({ exercise: ex, index: idx });
    }
  });

  return { matched, added, removed };
}

function diffWeightedExercises(
  oldEx: WeightedExerciseBlueprint,
  newEx: WeightedExerciseBlueprint,
  exerciseIndex: number,
): ExerciseFieldChange[] {
  const changes: ExerciseFieldChange[] = [];
  const exerciseName = newEx.name;

  // A swap to a same-named exercise changes only the id, and the plan must still follow it.
  if (oldEx.name !== newEx.name || oldEx.exerciseId !== newEx.exerciseId) {
    changes.push({
      id: generateChangeId(),
      kind: 'exerciseName',
      type: 'modified',
      exerciseIndex,
      oldValue: oldEx.name,
      newValue: newEx.name,
      newExerciseId: newEx.exerciseId,
    });
  }

  if (!plannedSetsEqual(oldEx.plannedSets, newEx.plannedSets)) {
    changes.push({
      id: generateChangeId(),
      kind: 'exercisePlannedSets',
      type: 'modified',
      exerciseName,
      exerciseIndex,
      oldValue: oldEx.plannedSets,
      newValue: newEx.plannedSets,
    });
  }

  if (!plannedWarmupSetsEqual(oldEx.warmupSets, newEx.warmupSets)) {
    changes.push({
      id: generateChangeId(),
      kind: 'exerciseWarmupSets',
      type: 'modified',
      exerciseName,
      exerciseIndex,
      oldValue: oldEx.warmupSets,
      newValue: newEx.warmupSets,
    });
  }

  if (!progressionEquals(oldEx.progression, newEx.progression)) {
    changes.push({
      id: generateChangeId(),
      kind: 'progression',
      type: 'modified',
      exerciseName,
      exerciseIndex,
      oldValue: oldEx.progression,
      newValue: newEx.progression,
    });
  }

  // Grouped rest change
  if (!restEquals(oldEx.restBetweenSets, newEx.restBetweenSets)) {
    changes.push({
      id: generateChangeId(),
      kind: 'exerciseRest',
      type: 'modified',
      exerciseName,
      exerciseIndex,
      oldValue: oldEx.restBetweenSets,
      newValue: newEx.restBetweenSets,
    });
  }

  if (oldEx.supersetWithNext !== newEx.supersetWithNext) {
    changes.push({
      id: generateChangeId(),
      kind: 'exerciseSuperset',
      type: 'modified',
      exerciseName,
      exerciseIndex,
      oldValue: oldEx.supersetWithNext,
      newValue: newEx.supersetWithNext,
    });
  }

  if (oldEx.resistance !== newEx.resistance) {
    changes.push({
      id: generateChangeId(),
      kind: 'exerciseResistance',
      type: 'modified',
      exerciseName,
      exerciseIndex,
      oldValue: oldEx.resistance,
      newValue: newEx.resistance,
    });
  }

  if (oldEx.notes !== newEx.notes) {
    changes.push({
      id: generateChangeId(),
      kind: 'exerciseNotes',
      type: 'modified',
      exerciseName,
      exerciseIndex,
      oldValue: oldEx.notes,
      newValue: newEx.notes,
    });
  }

  if (oldEx.link !== newEx.link) {
    changes.push({
      id: generateChangeId(),
      kind: 'exerciseLink',
      type: 'modified',
      exerciseName,
      exerciseIndex,
      oldValue: oldEx.link,
      newValue: newEx.link,
    });
  }

  return changes;
}

/**
 * Compare two cardio sets and return field-level changes
 */
function diffCardioSets(
  oldSet: CardioExerciseSetBlueprint,
  newSet: CardioExerciseSetBlueprint,
  exerciseName: string,
  exerciseIndex: number,
  setIndex: number,
): ExerciseFieldChange[] {
  const changes: ExerciseFieldChange[] = [];

  if (!cardioTargetEquals(oldSet.target, newSet.target)) {
    changes.push({
      id: generateChangeId(),
      kind: 'exerciseTarget',
      type: 'modified',
      exerciseName,
      exerciseIndex,
      setIndex,
      oldValue: oldSet.target,
      newValue: newSet.target,
    });
  }

  const trackingFields = [
    'trackDuration',
    'trackDistance',
    'trackResistance',
    'trackIncline',
    'trackWeight',
    'trackSteps',
  ] as const;

  for (const field of trackingFields) {
    if (oldSet[field] !== newSet[field]) {
      changes.push({
        id: generateChangeId(),
        kind: 'exerciseTracking',
        type: 'modified',
        exerciseName,
        exerciseIndex,
        setIndex,
        field,
        oldValue: oldSet[field],
        newValue: newSet[field],
      });
    }
  }

  return changes;
}

function diffCardioExercises(
  oldEx: CardioExerciseBlueprint,
  newEx: CardioExerciseBlueprint,
  exerciseIndex: number,
): ExerciseFieldChange[] {
  const changes: ExerciseFieldChange[] = [];
  const exerciseName = newEx.name;

  // A swap to a same-named exercise changes only the id, and the plan must still follow it.
  if (oldEx.name !== newEx.name || oldEx.exerciseId !== newEx.exerciseId) {
    changes.push({
      id: generateChangeId(),
      kind: 'exerciseName',
      type: 'modified',
      exerciseIndex,
      oldValue: oldEx.name,
      newValue: newEx.name,
      newExerciseId: newEx.exerciseId,
    });
  }

  // Diff the sets
  const oldSets = oldEx.sets;
  const newSets = newEx.sets;

  // Compare common sets (by position)
  const minLength = Math.min(oldSets.length, newSets.length);
  for (let i = 0; i < minLength; i++) {
    const oldSet = oldSets[i]!;
    const newSet = newSets[i]!;

    // Check if the set has any differences
    if (!oldSet.equals(newSet)) {
      // Add detailed field-level changes for this set
      const setChanges = diffCardioSets(oldSet, newSet, exerciseName, exerciseIndex, i);
      changes.push(...setChanges);

      // If there are no detailed field changes but sets aren't equal,
      // this shouldn't happen, but just in case, record a generic set modification
      if (setChanges.length === 0) {
        changes.push({
          id: generateChangeId(),
          kind: 'cardioSetModified',
          type: 'modified',
          exerciseName,
          exerciseIndex,
          setIndex: i,
          oldSet,
          newSet,
        });
      }
    }
  }

  // Handle added sets
  for (let i = minLength; i < newSets.length; i++) {
    changes.push({
      id: generateChangeId(),
      kind: 'cardioSet',
      type: 'added',
      exerciseName,
      exerciseIndex,
      setIndex: i,
      set: newSets[i]!,
    });
  }

  // Removed sets, last first, so that applying them in order removes from the tail and no removal
  // shifts the index of the one after it.
  for (let i = oldSets.length - 1; i >= minLength; i--) {
    changes.push({
      id: generateChangeId(),
      kind: 'cardioSet',
      type: 'removed',
      exerciseName,
      exerciseIndex,
      setIndex: i,
      set: oldSets[i]!,
    });
  }

  if (oldEx.notes !== newEx.notes) {
    changes.push({
      id: generateChangeId(),
      kind: 'exerciseNotes',
      type: 'modified',
      exerciseName,
      exerciseIndex,
      oldValue: oldEx.notes,
      newValue: newEx.notes,
    });
  }

  if (oldEx.link !== newEx.link) {
    changes.push({
      id: generateChangeId(),
      kind: 'exerciseLink',
      type: 'modified',
      exerciseName,
      exerciseIndex,
      oldValue: oldEx.link,
      newValue: newEx.link,
    });
  }

  return changes;
}

function diffExercises(
  oldEx: ExerciseBlueprint,
  newEx: ExerciseBlueprint,
  exerciseIndex: number,
): ExerciseFieldChange[] {
  // Check if exercise type changed
  const oldIsWeighted = oldEx instanceof WeightedExerciseBlueprint;
  const newIsWeighted = newEx instanceof WeightedExerciseBlueprint;

  if (oldIsWeighted !== newIsWeighted) {
    return [
      {
        id: generateChangeId(),
        kind: 'exerciseType',
        type: 'modified',
        exerciseIndex,
        oldExercise: oldEx,
        newExercise: newEx,
      },
    ];
  }

  if (oldIsWeighted && newIsWeighted) {
    return diffWeightedExercises(oldEx, newEx, exerciseIndex);
  }

  return diffCardioExercises(oldEx as CardioExerciseBlueprint, newEx as CardioExerciseBlueprint, exerciseIndex);
}

/**
 * Computes the diff between two SessionBlueprint instances.
 *
 * Uses name-based matching for exercises with fallback to position for duplicates.
 * Rest settings are grouped as a single change.
 * Reordering is detected as a separate change type.
 */
export function diffSessionBlueprints(original: SessionBlueprint, modified: SessionBlueprint): SessionBlueprintDiff {
  const sessionChanges: SessionChange[] = [];
  const allChanges: DiffChange[] = [];

  // Session-level changes
  if (original.name !== modified.name) {
    const change: SessionNameChange = {
      id: generateChangeId(),
      kind: 'sessionName',
      type: 'modified',
      oldValue: original.name,
      newValue: modified.name,
    };
    sessionChanges.push(change);
    allChanges.push(change);
  }

  if (original.notes !== modified.notes) {
    const change: SessionNotesChange = {
      id: generateChangeId(),
      kind: 'sessionNotes',
      type: 'modified',
      oldValue: original.notes,
      newValue: modified.notes,
    };
    sessionChanges.push(change);
    allChanges.push(change);
  }

  // Match exercises
  const { matched, added, removed } = matchExercisesByName(original.exercises, modified.exercises);

  // Added exercises
  const addedExercises: ExerciseAddedChange[] = added.map(({ exercise, index }) => ({
    id: generateChangeId(),
    kind: 'exercise',
    type: 'added',
    exercise,
    newIndex: index,
  }));

  // Removed exercises
  const removedExercises: ExerciseRemovedChange[] = removed.map(({ exercise, index }) => ({
    id: generateChangeId(),
    kind: 'exercise',
    type: 'removed',
    exercise,
    oldIndex: index,
  }));

  // Reordered exercises (matched but at different indices)
  const reorderedExercises: ExerciseReorderedChange[] = matched
    .filter(({ oldIndex, newIndex }) => oldIndex !== newIndex)
    .map(({ oldExercise, oldIndex, newIndex }) => ({
      id: generateChangeId(),
      kind: 'exercise',
      type: 'reordered',
      exerciseName: oldExercise.name,
      oldIndex,
      newIndex,
    }));

  // Modified exercises (field-level changes)
  const modifiedExercises: ExerciseModification[] = [];
  for (const { oldExercise, newExercise, oldIndex, newIndex } of matched) {
    const changes = diffExercises(oldExercise, newExercise, newIndex);
    if (changes.length > 0) {
      modifiedExercises.push({
        exerciseName: newExercise.name,
        exerciseIndex: newIndex,
        originalIndex: oldIndex,
        changes,
      });
    }
  }

  // Collect all changes
  allChanges.push(...addedExercises);
  allChanges.push(...removedExercises);
  allChanges.push(...reorderedExercises);
  for (const mod of modifiedExercises) {
    allChanges.push(...mod.changes);
  }

  return {
    hasChanges: allChanges.length > 0,
    sessionChanges,
    addedExercises,
    removedExercises,
    reorderedExercises,
    modifiedExercises,
    allChanges,
    originalSession: original,
    newSession: modified,
  };
}

// ============================================================================
// Filter Diff by Selected Changes
// ============================================================================

/**
 * Creates a subset diff containing only the selected changes.
 *
 * @param diff The complete diff
 * @param selectedChangeIds Set of change IDs to include
 * @returns A new SessionBlueprintDiff with only the selected changes
 */
export function filterDiff(diff: SessionBlueprintDiff, selectedChangeIds: Set<string>): SessionBlueprintDiff {
  const sessionChanges = diff.sessionChanges.filter((c) => selectedChangeIds.has(c.id));
  const addedExercises = diff.addedExercises.filter((c) => selectedChangeIds.has(c.id));
  const removedExercises = diff.removedExercises.filter((c) => selectedChangeIds.has(c.id));
  const reorderedExercises = diff.reorderedExercises.filter((c) => selectedChangeIds.has(c.id));
  const modifiedExercises = diff.modifiedExercises
    .map((mod) => ({
      ...mod,
      changes: mod.changes.filter((c) => selectedChangeIds.has(c.id)),
    }))
    .filter((mod) => mod.changes.length > 0);

  const allChanges = diff.allChanges.filter((c) => selectedChangeIds.has(c.id));

  return {
    hasChanges: allChanges.length > 0,
    sessionChanges,
    addedExercises,
    removedExercises,
    reorderedExercises,
    modifiedExercises,
    allChanges,
    originalSession: diff.originalSession,
    newSession: diff.newSession,
  };
}

// ============================================================================
// Apply Selected Changes
// ============================================================================

/**
 * Applies a diff to create a new SessionBlueprint.
 *
 * @param original The original SessionBlueprint
 * @param modified The modified SessionBlueprint (source of changes)
 * @param diff The computed diff
 * @returns A new SessionBlueprint with only selected changes applied
 */
export function applySessionBlueprintDiff(original: SessionBlueprint, diff: SessionBlueprintDiff): SessionBlueprint {
  let name = original.name;
  let notes = original.notes;

  // Apply session-level changes
  for (const change of diff.sessionChanges) {
    match(change)
      .with({ kind: 'sessionName' }, (c) => {
        name = c.newValue;
      })
      .with({ kind: 'sessionNotes' }, (c) => {
        notes = c.newValue;
      })
      .exhaustive();
  }

  // Build the exercise list
  // Start with a copy of original exercises
  const exercises: ExerciseBlueprint[] = [...original.exercises];

  // Track indices to remove (we'll remove them at the end to preserve indices)
  const indicesToRemove = new Set<number>();

  // Track exercises to add (with their target indices)
  const exercisesToAdd: ExerciseWithIndex[] = [];

  // Apply removed exercises
  for (const change of diff.removedExercises) {
    indicesToRemove.add(change.oldIndex);
  }

  // Apply added exercises
  for (const change of diff.addedExercises) {
    exercisesToAdd.push({
      exercise: change.exercise,
      index: change.newIndex,
    });
  }

  // Apply field-level modifications
  for (const mod of diff.modifiedExercises) {
    const originalIdx = locateInOriginal(original, diff, mod.originalIndex);
    if (originalIdx === -1) continue;

    let exercise = exercises[originalIdx]!;

    for (const change of mod.changes) {
      exercise = match(change)
        .with({ kind: 'exerciseName' }, (c) => exercise.with({ name: c.newValue, exerciseId: c.newExerciseId }))
        .with({ kind: 'exercisePlannedSets' }, (c) =>
          exercise instanceof WeightedExerciseBlueprint ? exercise.with({ plannedSets: c.newValue }) : exercise,
        )
        .with({ kind: 'exerciseWarmupSets' }, (c) =>
          exercise instanceof WeightedExerciseBlueprint ? exercise.with({ warmupSets: c.newValue }) : exercise,
        )
        .with({ kind: 'progression' }, (c) =>
          exercise instanceof WeightedExerciseBlueprint ? exercise.with({ progression: c.newValue }) : exercise,
        )
        .with({ kind: 'exerciseRest' }, (c) =>
          exercise instanceof WeightedExerciseBlueprint ? exercise.with({ restBetweenSets: c.newValue }) : exercise,
        )
        .with({ kind: 'exerciseSuperset' }, (c) =>
          exercise instanceof WeightedExerciseBlueprint ? exercise.with({ supersetWithNext: c.newValue }) : exercise,
        )
        .with({ kind: 'exerciseResistance' }, (c) =>
          exercise instanceof WeightedExerciseBlueprint ? exercise.with({ resistance: c.newValue }) : exercise,
        )
        .with({ kind: 'exerciseNotes' }, (c) => exercise.with({ notes: c.newValue }))
        .with({ kind: 'exerciseLink' }, (c) => exercise.with({ link: c.newValue }))
        .with({ kind: 'exerciseTarget' }, (c) => {
          if (!(exercise instanceof CardioExerciseBlueprint)) return exercise;
          const newSets = [...exercise.sets];
          if (c.setIndex < newSets.length) {
            newSets[c.setIndex] = newSets[c.setIndex]!.with({
              target: c.newValue,
            });
          }
          return exercise.with({ sets: newSets });
        })
        .with({ kind: 'exerciseTracking' }, (c) => {
          if (!(exercise instanceof CardioExerciseBlueprint)) return exercise;
          const newSets = [...exercise.sets];
          if (c.setIndex < newSets.length) {
            newSets[c.setIndex] = newSets[c.setIndex]!.with({
              [c.field]: c.newValue,
            });
          }
          return exercise.with({ sets: newSets });
        })
        .with({ kind: 'cardioSet', type: 'added' }, (c) => {
          if (!(exercise instanceof CardioExerciseBlueprint)) return exercise;
          const newSets = [...exercise.sets];
          // Insert at the specified index, clamping to valid range
          const insertIdx = Math.min(c.setIndex, newSets.length);
          newSets.splice(insertIdx, 0, c.set);
          return exercise.with({ sets: newSets });
        })
        .with({ kind: 'cardioSet', type: 'removed' }, (c) => {
          if (!(exercise instanceof CardioExerciseBlueprint)) return exercise;
          const newSets = [...exercise.sets];
          // Only remove if we have more than 1 set (cardio must have at least 1)
          if (newSets.length > 1 && c.setIndex < newSets.length) {
            newSets.splice(c.setIndex, 1);
          }
          return exercise.with({ sets: newSets });
        })
        .with({ kind: 'cardioSetModified' }, (c) => {
          if (!(exercise instanceof CardioExerciseBlueprint)) return exercise;
          const newSets = [...exercise.sets];
          if (c.setIndex < newSets.length) {
            newSets[c.setIndex] = c.newSet;
          }
          return exercise.with({ sets: newSets });
        })
        .with({ kind: 'exerciseType' }, (c) => c.newExercise)
        .exhaustive();
    }

    exercises[originalIdx] = exercise;
  }

  // Order the exercises the routine keeps. A kept move puts an exercise at the index it had in the
  // workout; the others stay at their routine index, which is the same thing for an exercise that did
  // not move. The sort is stable, so an exercise whose removal was not kept stays where it was among
  // its neighbours.
  const movedTo = new Map<number, number>();
  for (const reorder of diff.reorderedExercises) {
    const originalIdx = locateInOriginal(original, diff, reorder.oldIndex);
    if (originalIdx !== -1) {
      movedTo.set(originalIdx, reorder.newIndex);
    }
  }
  const finalExercises = exercises
    .map((exercise, idx) => ({ exercise, position: movedTo.get(idx) ?? idx, idx }))
    .filter(({ idx }) => !indicesToRemove.has(idx))
    .sort((a, b) => a.position - b.position)
    .map(({ exercise }) => exercise);

  // Added exercises go in at the index they had in the workout, top first, so that each lands below
  // the ones added above it.
  exercisesToAdd.sort((a, b) => a.index - b.index);
  for (const { exercise, index } of exercisesToAdd) {
    finalExercises.splice(Math.min(index, finalExercises.length), 0, exercise);
  }

  return new SessionBlueprint(name, finalExercises, notes, original.color);
}

/**
 * Where the exercise at `originalIndex` of the diff's original session sits in `original`, or -1. The
 * routine can have been edited since the diff was computed, so the index is trusted only while the
 * exercise there still has the name it had then.
 */
function locateInOriginal(original: SessionBlueprint, diff: SessionBlueprintDiff, originalIndex: number): number {
  const oldName = diff.originalSession.exercises[originalIndex]?.name;
  return original.exercises[originalIndex]?.name === oldName
    ? originalIndex
    : original.exercises.findIndex((ex) => ex.name === oldName);
}

// ============================================================================
// Utility Functions
// ============================================================================

// ============================================================================
// Translation Key Types
// ============================================================================

/**
 * Represents a translatable string with its key and interpolation parameters.
 * Components should use this with their t() function to get the localized string.
 */
export interface TranslatableString {
  key: TranslationKey;
  params?: Record<string, string | number>;
}

export function getChangeDescription(t: UseTranslateResult['t'], change: DiffChange): string {
  return match(change)
    .returnType<string>()
    .with({ kind: 'sessionName' }, (c) =>
      t('plan.diff.generic_two_value_change.body', {
        oldValue: c.oldValue,
        newValue: c.newValue,
      }),
    )
    .with({ kind: 'sessionNotes' }, () => t('plan.diff.generic_updated.body'))
    .with({ kind: 'exercise', type: 'added' }, (c) => t('plan.diff.exercise_added.body', { name: c.exercise.name }))
    .with({ kind: 'exercise', type: 'removed' }, (c) => t('plan.diff.exercise_removed.body', { name: c.exercise.name }))
    .with({ kind: 'exercise', type: 'reordered' }, (c) =>
      t('plan.diff.exercise_reordered.body', {
        name: c.exerciseName,
        oldPosition: c.oldIndex + 1,
        newPosition: c.newIndex + 1,
      }),
    )
    .with({ kind: 'exerciseName' }, (c) =>
      t('plan.diff.generic_two_value_change.body', {
        oldValue: c.oldValue,
        newValue: c.newValue,
      }),
    )
    .with({ kind: 'exercisePlannedSets' }, (c) =>
      t('plan.diff.generic_two_value_change.body', {
        oldValue: formatPlannedSets(c.oldValue),
        newValue: formatPlannedSets(c.newValue),
      }),
    )
    .with({ kind: 'exerciseWarmupSets' }, (c) =>
      t('plan.diff.generic_two_value_change.body', {
        oldValue: stringifyWarmupSets(t, c.oldValue),
        newValue: stringifyWarmupSets(t, c.newValue),
      }),
    )
    .with({ kind: 'progression' }, (c) =>
      t('plan.diff.generic_two_value_change.body', {
        oldValue: stringifyProgression(t, c.oldValue),
        newValue: stringifyProgression(t, c.newValue),
      }),
    )
    .with({ kind: 'exerciseRest' }, () => t('plan.diff.generic_updated.body'))
    .with({ kind: 'exerciseSuperset' }, (c) =>
      t(c.newValue ? 'plan.diff.generic_enabled.body' : 'plan.diff.generic_disabled.body'),
    )
    .with({ kind: 'exerciseResistance' }, (c) =>
      t('plan.diff.generic_two_value_change.body', { oldValue: c.oldValue, newValue: c.newValue }),
    )
    .with({ kind: 'exerciseNotes' }, () => t('plan.diff.generic_updated.body'))
    .with({ kind: 'exerciseLink' }, () => t('plan.diff.generic_updated.body'))
    .with({ kind: 'exerciseTarget' }, () => t('plan.diff.generic_updated.body'))
    .with({ kind: 'exerciseTracking' }, (c) =>
      t(c.newValue ? 'plan.diff.generic_enabled.body' : 'plan.diff.generic_disabled.body'),
    )
    .with({ kind: 'exerciseType' }, (c) =>
      t('plan.diff.generic_two_value_change.body', {
        oldValue: c.oldExercise instanceof WeightedExerciseBlueprint ? 'weighted' : 'cardio',
        newValue: c.newExercise instanceof WeightedExerciseBlueprint ? 'weighted' : 'cardio',
      }),
    )
    .with({ kind: 'cardioSet', type: 'added' }, (c) =>
      t('plan.diff.cardio_set_added.body', { setNumber: c.setIndex + 1 }),
    )
    .with({ kind: 'cardioSet', type: 'removed' }, (c) =>
      t('plan.diff.cardio_set_removed.body', { setNumber: c.setIndex + 1 }),
    )
    .with({ kind: 'cardioSetModified' }, (c) => t('plan.diff.cardio_set_modified.body', { setNumber: c.setIndex + 1 }))
    .exhaustive();
}

/**
 * Get a short label translation key for a change (for compact UI).
 * Use with t(result.key, result.params) in your component.
 */
export function getChangeLabelKey(change: DiffChange): TranslatableString {
  return match(change)
    .returnType<TranslatableString>()
    .with({ kind: 'sessionName' }, () => ({
      key: 'plan.diff.session_name.label',
    }))
    .with({ kind: 'sessionNotes' }, () => ({
      key: 'plan.diff.session_notes.label',
    }))
    .with({ kind: 'exercise', type: 'added' }, (c) => ({
      key: 'plan.diff.exercise_added.label',
      params: { name: c.exercise.name },
    }))
    .with({ kind: 'exercise', type: 'removed' }, (c) => ({
      key: 'plan.diff.exercise_removed.label',
      params: { name: c.exercise.name },
    }))
    .with({ kind: 'exercise', type: 'reordered' }, (c) => ({
      key: 'plan.diff.exercise_reordered.label',
      params: { name: c.exerciseName },
    }))
    .with({ kind: 'exerciseName' }, () => ({
      key: 'plan.diff.name.label',
    }))
    .with({ kind: 'exercisePlannedSets' }, () => ({
      key: 'plan.diff.sets.label',
    }))
    .with({ kind: 'exerciseWarmupSets' }, () => ({
      key: 'plan.diff.warmup_sets.label',
    }))
    .with({ kind: 'progression' }, () => ({
      key: 'plan.diff.progressive_overload.label',
    }))
    .with({ kind: 'exerciseRest' }, () => ({
      key: 'plan.diff.rest.label',
    }))
    .with({ kind: 'exerciseSuperset' }, () => ({
      key: 'plan.diff.superset.label',
    }))
    .with({ kind: 'exerciseResistance' }, () => ({
      key: 'plan.diff.resistance.label',
    }))
    .with({ kind: 'exerciseNotes' }, () => ({
      key: 'plan.diff.notes.label',
    }))
    .with({ kind: 'exerciseLink' }, () => ({
      key: 'plan.diff.link.label',
    }))
    .with({ kind: 'exerciseTarget' }, () => ({
      key: 'plan.diff.target.label',
    }))
    .with({ kind: 'exerciseTracking' }, (c) => ({
      key: `plan.diff.${c.field.replace('track', 'track_').toLowerCase()}.label` as TranslationKey,
    }))
    .with({ kind: 'exerciseType' }, () => ({
      key: 'plan.diff.exercise_type.label',
    }))
    .with({ kind: 'cardioSet', type: 'added' }, (c) => ({
      key: 'plan.diff.cardio_set_added.label',
      params: { setNumber: c.setIndex + 1 },
    }))
    .with({ kind: 'cardioSet', type: 'removed' }, (c) => ({
      key: 'plan.diff.cardio_set_removed.label',
      params: { setNumber: c.setIndex + 1 },
    }))
    .with({ kind: 'cardioSetModified' }, (c) => ({
      key: 'plan.diff.cardio_set_modified.label',
      params: { setNumber: c.setIndex + 1 },
    }))
    .exhaustive();
}

function stringifyWarmupSets(t: UseTranslateResult['t'], warmups: PlannedWarmupSet[]): string {
  return warmups.length
    ? formatPlannedWarmupSets(warmups, (percent) => t('workout.warmup_set.percent.label', { percent }))
    : t('plan.diff.warmup_sets_none.body');
}

function stringifyProgression(t: UseTranslateResult['t'], progression: ProgressionRule[]): string {
  if (!progression.length) {
    return t('exercise.progressive_overload.no.label');
  }
  return progression.map((rule) => stringifyProgressionRule(t, rule)).join(', ');
}

function stringifyProgressionRule(t: UseTranslateResult['t'], rule: ProgressionRule): string {
  const amount = localeFormatBigNumber(rule.step);
  const axis = t(
    rule.axis === 'reps' ? 'exercise.progression.axis.reps.label' : 'exercise.progression.axis.load.label',
  );
  const move =
    rule.scope.type === 'allSets'
      ? t('plan.diff.progression_rule_all_sets.label', { amount, axis })
      : t('plan.diff.progression_rule_lowest_sets.label', {
          amount,
          axis,
          strategy: stringifyIncreaseStrategy(t, rule.scope.pick),
        });
  return rule.ceiling === undefined
    ? move
    : t('plan.diff.progression_rule_ceiling.label', { move, ceiling: localeFormatBigNumber(rule.ceiling) });
}

function stringifyIncreaseStrategy(t: UseTranslateResult['t'], strategy: IncreaseStrategy) {
  return match(strategy)
    .with('all', () => t('exercise.progressive_overload.increase_lowest_set.increase_strategy.all.label'))
    .with('first', () => t('exercise.progressive_overload.increase_lowest_set.increase_strategy.first.label'))
    .with('middle', () => t('exercise.progressive_overload.increase_lowest_set.increase_strategy.middle.label'))
    .with('last', () => t('exercise.progressive_overload.increase_lowest_set.increase_strategy.last.label'))
    .exhaustive();
}

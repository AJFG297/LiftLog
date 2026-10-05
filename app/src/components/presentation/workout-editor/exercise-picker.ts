import { fuzzyMatchScore } from '@/models/exercise-fuzzy-match';
import {
  ExerciseBlueprint,
  lineageKeys,
  MovementKey,
  Rest,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { MuscleGroup, muscleGroupOf } from '@/models/muscle-groups';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { CarryOver, nextRecordedExercise, sessionWithExerciseReplaced } from '@/models/session-models/carry-over';
import type { OffsetDateTime } from '@js-joda/core';

/**
 * The equipment chips, as the catalog spells them. They're also what a custom exercise can store, so the
 * number pad's steps and plate maths (models/equipment.ts) work for it too.
 */
export const EQUIPMENT_CHOICES = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'body only',
  'kettlebells',
  'bands',
  'other',
] as const;
export type EquipmentChoice = (typeof EQUIPMENT_CHOICES)[number];

/** The equipment chip an exercise files under. An E-Z bar counts as a barbell, and the rest as Other. */
export function equipmentChoiceOf(exercise: ExerciseDescriptor): EquipmentChoice {
  const equipment = exercise.equipment?.trim().toLowerCase();
  if (equipment === 'e-z curl bar') {
    return 'barbell';
  }
  return EQUIPMENT_CHOICES.find((choice) => choice === equipment) ?? 'other';
}

/** A performance with the exercise it was of: the shape of the latest recorded exercises. */
export interface ExercisePerformance {
  blueprint: { exerciseId: string };
  latestTime: OffsetDateTime | undefined;
}

/** How many recent exercises the picker lists above the rest. */
export const RECENT_LIMIT = 5;

/** The exercises done most recently, newest first, once each, and only those still in the catalog. */
export function recentExerciseIds(
  performances: readonly (ExercisePerformance | undefined)[],
  exercises: Record<string, ExerciseDescriptor>,
  limit = RECENT_LIMIT,
): string[] {
  const dated = performances.flatMap((performance) =>
    performance?.latestTime && exercises[performance.blueprint.exerciseId]
      ? [{ id: performance.blueprint.exerciseId, time: performance.latestTime }]
      : [],
  );
  dated.sort((a, b) => b.time.compareTo(a.time));
  const ids: string[] = [];
  for (const { id } of dated) {
    if (!ids.includes(id)) {
      ids.push(id);
    }
    if (ids.length === limit) {
      break;
    }
  }
  return ids;
}

export interface PickerFilters {
  query: string;
  muscle: MuscleGroup | undefined;
  equipment: EquipmentChoice | undefined;
}

export type PickerSection = 'recent' | 'all' | 'matches' | MuscleGroup;

export type PickerRow =
  | { kind: 'header'; key: string; section: PickerSection }
  | { kind: 'exercise'; key: string; id: string }
  /** Offers the query as a new exercise when some names match it loosely but none exactly. */
  | { kind: 'create'; key: string; name: string }
  /** The query names an exercise exactly, but the chips hide it: a way to clear them instead of a duplicate. */
  | { kind: 'filtered'; key: string; name: string };

export interface PickerList {
  rows: PickerRow[];
  /** The number of exercises the list shows. */
  count: number;
  /** Nothing matches the query and the chips: the screen says so instead of listing rows. */
  noMatch: boolean;
  /** Some exercise the chips hide matches the query, so clearing them would show it. */
  hiddenByFilters: boolean;
  /** No exercise in the whole catalog is named exactly what was typed, so it can be made. */
  canCreate: boolean;
}

/**
 * The picker's list. With no query: Recent, then every other exercise by name. With a query: the matches,
 * best first, and recents lose their own section. The chips narrow both.
 */
export function pickerListOf(
  exercises: Record<string, ExerciseDescriptor>,
  recentIds: readonly string[],
  filters: PickerFilters,
): PickerList {
  const query = filters.query.trim();
  const passes = (exercise: ExerciseDescriptor) =>
    (!filters.muscle || muscleGroupOf(exercise) === filters.muscle) &&
    (!filters.equipment || equipmentChoiceOf(exercise) === filters.equipment);
  const rows: PickerRow[] = [];

  if (!query) {
    const recent = recentIds.filter((id) => exercises[id] && passes(exercises[id]));
    if (recent.length) {
      rows.push({ kind: 'header', key: 'header-recent', section: 'recent' });
      rows.push(...recent.map((id): PickerRow => ({ kind: 'exercise', key: `recent-${id}`, id })));
    }
    const rest = Object.entries(exercises)
      .filter(([id, exercise]) => !recent.includes(id) && passes(exercise))
      .sort((a, b) => byName(a[1].name, b[1].name))
      .map(([id]): PickerRow => ({ kind: 'exercise', key: id, id }));
    if (rest.length) {
      rows.push({ kind: 'header', key: 'header-all', section: filters.muscle ?? 'all' });
      rows.push(...rest);
    }
    return { rows, count: recent.length + rest.length, noMatch: false, hiddenByFilters: false, canCreate: false };
  }

  // Scored across the whole catalog: an exact name the chips hide must not be offered as a new exercise.
  const matches = Object.entries(exercises).flatMap(([id, exercise]) => {
    const score = fuzzyMatchScore(query, exercise.name);
    return score === null ? [] : [{ id, name: exercise.name, score, shown: passes(exercise) }];
  });
  const isExact = ({ name }: { name: string }) => name.trim().toLowerCase() === query.toLowerCase();
  const shown = matches.filter((match) => match.shown);
  const hidden = matches.filter((match) => !match.shown);
  const canCreate = !matches.some(isExact);
  const hiddenByFilters = hidden.length > 0;
  if (!shown.length) {
    return { rows, count: 0, noMatch: true, hiddenByFilters, canCreate };
  }
  shown.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  rows.push({ kind: 'header', key: 'header-matches', section: 'matches' });
  rows.push(...shown.map(({ id }): PickerRow => ({ kind: 'exercise', key: id, id })));
  const hiddenExact = shown.some(isExact) ? undefined : hidden.find(isExact);
  if (canCreate) {
    rows.push({ kind: 'create', key: 'create', name: query });
  } else if (hiddenExact) {
    rows.push({ kind: 'filtered', key: 'filtered', name: hiddenExact.name });
  }
  return { rows, count: shown.length, noMatch: false, hiddenByFilters, canCreate };
}

/** Tapping a row adds it to the end of the selection, or takes it out and closes the gap. */
export function toggledPick(picked: readonly string[], id: string): string[] {
  return picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
}

/** A new custom exercise from the create form. Level and the rest aren't asked for. */
export function customExerciseOf(input: {
  name: string;
  muscles: string[];
  equipment: string | undefined;
}): ExerciseDescriptor {
  return {
    name: input.name.trim(),
    category: '',
    equipment: input.equipment ?? null,
    force: null,
    instructions: '',
    level: 'beginner',
    mechanic: null,
    primaryMuscles: input.muscles,
    secondaryMuscles: [],
  };
}

/** An exercise picked from the list, as the blueprint links it. */
export interface PickedExerciseRef {
  id: string;
  name: string;
}

/**
 * The blueprints for a pick, in tap order: 3 × 10 with the medium rest and no progression rules. As a
 * superset, each links to the next, so the last closes the chain.
 */
export function blueprintsForPick(
  picked: readonly PickedExerciseRef[],
  asSuperset: boolean,
): WeightedExerciseBlueprint[] {
  return picked.map((exercise, index) =>
    WeightedExerciseBlueprint.of({
      name: exercise.name,
      exerciseId: exercise.id,
      sets: 3,
      repsConfig: { type: 'fixed', reps: 10 },
      restBetweenSets: Rest.medium,
      supersetWithNext: asSuperset && index < picked.length - 1,
    }),
  );
}

/**
 * The exercises with a pick added to the end. A superset flag left on the old last exercise linked nothing
 * there; with exercises after it, it would join them, so it's cleared.
 */
export function withPickAppended(
  exercises: readonly ExerciseBlueprint[],
  picked: readonly PickedExerciseRef[],
  asSuperset: boolean,
): ExerciseBlueprint[] {
  if (!picked.length) {
    return [...exercises];
  }
  const kept = exercises.map((exercise, index) =>
    index === exercises.length - 1 && exercise instanceof WeightedExerciseBlueprint && exercise.supersetWithNext
      ? exercise.with({ supersetWithNext: false })
      : exercise,
  );
  return [...kept, ...blueprintsForPick(picked, asSuperset)];
}

/**
 * The workout with a pick added to the end, clearing a stranded superset flag as {@link withPickAppended} does.
 * Each exercise opens on what its place would carry over in a routine (see {@link nextRecordedExercise}).
 */
export function sessionWithPickAdded(
  session: Session,
  picked: readonly PickedExerciseRef[],
  asSuperset: boolean,
  { latest, unit }: CarryOver,
): Session {
  if (!picked.length) {
    return session;
  }
  const lastIndex = session.recordedExercises.length - 1;
  const last = session.recordedExercises[lastIndex];
  let result = session;
  if (last instanceof RecordedWeightedExercise && last.blueprint.supersetWithNext) {
    const recordedExercises = session.recordedExercises.with(
      lastIndex,
      last.with({ blueprint: last.blueprint.with({ supersetWithNext: false }) }),
    );
    result = session.with({
      recordedExercises,
      blueprint: session.blueprint.with({ exercises: recordedExercises.map((exercise) => exercise.blueprint) }),
    });
  }
  const added = blueprintsForPick(picked, asSuperset);
  const lineages = lineageKeys([...result.blueprint.exercises, ...added]).slice(result.blueprint.exercises.length);
  return added.reduce(
    (next, blueprint, index) => next.withAddedExercise(nextRecordedExercise(blueprint, lineages[index]!, latest, unit)),
    result,
  );
}

/**
 * The workout with the exercise at `index`, `swappedOut`, swapped for `picked`: its plan as it is now, under
 * the picked exercise's name and id, so its history follows it (see {@link sessionWithExerciseReplaced}).
 * Unchanged if that place no longer holds `swappedOut`, which a swap waiting on a read can find; an edit of
 * its plan meanwhile is kept.
 */
export function sessionWithExerciseSwapped(
  session: Session,
  index: number,
  swappedOut: MovementKey,
  picked: PickedExerciseRef,
  carryOver: CarryOver,
): Session {
  const current = session.recordedExercises[index];
  if (current?.movementKey() !== swappedOut) {
    return session;
  }
  return sessionWithExerciseReplaced(session, index, blueprintSwappedTo(current.blueprint, picked), carryOver);
}

/** The same plan for the picked exercise: its name and id, so its history follows it. */
export function blueprintSwappedTo(blueprint: ExerciseBlueprint, picked: PickedExerciseRef): ExerciseBlueprint {
  const exercise = { name: picked.name, exerciseId: picked.id };
  return blueprint instanceof WeightedExerciseBlueprint ? blueprint.with(exercise) : blueprint.with(exercise);
}

/** A to Z, with unnamed exercises (one left blank in Settings > Exercises) last rather than first. */
function byName(a: string, b: string): number {
  return Number(!a.trim()) - Number(!b.trim()) || a.localeCompare(b);
}

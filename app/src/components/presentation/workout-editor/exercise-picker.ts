import { ExerciseDescriptor } from '@/models/exercise-models';
import { searchEntriesOf, searchScores } from '@/models/exercise-search';
import { MuscleGroup, muscleGroupOf } from '@/models/muscle-groups';
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

/** How many exercises Similar lists when swapping: a shortcut, not a second catalog. */
export const SIMILAR_LIMIT = 8;

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

/** Where the picker was opened from, beyond what the chips filter. */
export interface PickerContext {
  /** The id of the exercise being swapped out. */
  swapping?: string;
  /** The user's own (custom) exercises, which search favours like recents. */
  ownIds?: readonly string[];
}

export type PickerSection = 'similar' | 'recent' | 'all' | 'matches' | MuscleGroup;

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
 * The picker's list. With no query: when swapping, Similar (same muscle group: same main muscle first, then
 * same equipment, then recents, then by name); Recent; then every other exercise by name, each exercise once. With a query: the
 * matches, best first (`searchScores`), a recent or own one ahead of an otherwise equal match, and no sections
 * besides. The chips narrow all of it.
 */
export function pickerListOf(
  exercises: Record<string, ExerciseDescriptor>,
  recentIds: readonly string[],
  filters: PickerFilters,
  context: PickerContext = {},
): PickerList {
  const query = filters.query.trim();
  const passes = (exercise: ExerciseDescriptor) =>
    (!filters.muscle || muscleGroupOf(exercise) === filters.muscle) &&
    (!filters.equipment || equipmentChoiceOf(exercise) === filters.equipment);
  const rows: PickerRow[] = [];

  if (!query) {
    const similar = similarIds(exercises, recentIds, context.swapping, passes);
    if (similar.length) {
      rows.push({ kind: 'header', key: 'header-similar', section: 'similar' });
      rows.push(...similar.map((id): PickerRow => ({ kind: 'exercise', key: `similar-${id}`, id })));
    }
    const recent = recentIds.filter((id) => exercises[id] && passes(exercises[id]) && !similar.includes(id));
    if (recent.length) {
      rows.push({ kind: 'header', key: 'header-recent', section: 'recent' });
      rows.push(...recent.map((id): PickerRow => ({ kind: 'exercise', key: `recent-${id}`, id })));
    }
    const rest = Object.entries(exercises)
      .filter(([id, exercise]) => !similar.includes(id) && !recent.includes(id) && passes(exercise))
      .sort((a, b) => byName(a[1].name, b[1].name))
      .map(([id]): PickerRow => ({ kind: 'exercise', key: id, id }));
    if (rest.length) {
      rows.push({ kind: 'header', key: 'header-all', section: filters.muscle ?? 'all' });
      rows.push(...rest);
    }
    const count = similar.length + recent.length + rest.length;
    return { rows, count, noMatch: false, hiddenByFilters: false, canCreate: false };
  }

  // Scored across the whole catalog: an exact name the chips hide must not be offered as a new exercise.
  const scores = searchScores(searchEntriesOf(exercises), query, [...recentIds, ...(context.ownIds ?? [])]);
  const matches = [...scores].map(([id, score]) => {
    const exercise = exercises[id]!;
    return { id, name: exercise.name, score, shown: passes(exercise) };
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

/**
 * Swap shortcuts: the exercises the chips let through that file under the swapped one's muscle group. Those
 * with its main muscle come first, so a squat lists squats before calf raises, then those on the same
 * equipment, then the recent ones, then by name.
 */
function similarIds(
  exercises: Record<string, ExerciseDescriptor>,
  recentIds: readonly string[],
  swapping: string | undefined,
  passes: (exercise: ExerciseDescriptor) => boolean,
): string[] {
  const swapped = swapping === undefined ? undefined : exercises[swapping];
  const group = swapped && muscleGroupOf(swapped);
  if (!swapped || !group) {
    return [];
  }
  const muscle = swapped.primaryMuscles[0];
  const equipment = equipmentChoiceOf(swapped);
  const recency = (id: string) => {
    const at = recentIds.indexOf(id);
    return at === -1 ? recentIds.length : at;
  };
  const similar = Object.entries(exercises).filter(
    ([id, exercise]) => id !== swapping && muscleGroupOf(exercise) === group && passes(exercise),
  );
  similar.sort(
    ([a, x], [b, y]) =>
      Number(y.primaryMuscles[0] === muscle) - Number(x.primaryMuscles[0] === muscle) ||
      Number(equipmentChoiceOf(y) === equipment) - Number(equipmentChoiceOf(x) === equipment) ||
      recency(a) - recency(b) ||
      byName(x.name, y.name),
  );
  return similar.slice(0, SIMILAR_LIMIT).map(([id]) => id);
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

/** A to Z, with unnamed exercises (one left blank in Settings > Exercises) last rather than first. */
function byName(a: string, b: string): number {
  return Number(!a.trim()) - Number(!b.trim()) || a.localeCompare(b);
}

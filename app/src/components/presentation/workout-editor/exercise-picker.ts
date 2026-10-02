import { fuzzyMatchScore } from '@/components/presentation/workout-editor/exercise-fuzzy-match';
import { ExerciseBlueprint, Rest, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import type { OffsetDateTime } from '@js-joda/core';

/** The muscle chips, in the order they're shown after All. */
export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

// Keyed by the catalog's muscle vocabulary. Neck belongs to no chip, so it only shows under All.
const MUSCLE_GROUP_OF: Record<string, MuscleGroup> = {
  chest: 'chest',
  lats: 'back',
  'middle back': 'back',
  'lower back': 'back',
  traps: 'back',
  shoulders: 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  quadriceps: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  adductors: 'legs',
  abductors: 'legs',
  abdominals: 'core',
};

/**
 * The chip an exercise files under, from its first primary muscle. Filing by any muscle would put every press
 * and row under Arms through their secondary muscles.
 */
export function muscleGroupOf(exercise: ExerciseDescriptor): MuscleGroup | undefined {
  const first = exercise.primaryMuscles[0]?.trim().toLowerCase();
  return first === undefined ? undefined : MUSCLE_GROUP_OF[first];
}

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
    return { rows, noMatch: false, hiddenByFilters: false, canCreate: false };
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
    return { rows, noMatch: true, hiddenByFilters, canCreate };
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
  return { rows, noMatch: false, hiddenByFilters, canCreate };
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

/** The muscle a new exercise starts with when the Create was reached through a one-muscle chip. */
export function musclesForGroup(group: MuscleGroup | undefined): string[] {
  const muscles = Object.entries(MUSCLE_GROUP_OF)
    .filter(([, of]) => of === group)
    .map(([muscle]) => muscle);
  return muscles.length === 1 ? muscles : [];
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

/** The workout with a pick added to the end, clearing a stranded superset flag as {@link withPickAppended} does. */
export function sessionWithPickAdded(
  session: Session,
  picked: readonly PickedExerciseRef[],
  asSuperset: boolean,
  useImperialUnits: boolean,
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
  return blueprintsForPick(picked, asSuperset).reduce(
    (next, blueprint) => next.withAddedExercise(blueprint, useImperialUnits),
    result,
  );
}

/** A to Z, with unnamed exercises (one left blank in Settings > Exercises) last rather than first. */
function byName(a: string, b: string): number {
  return Number(!a.trim()) - Number(!b.trim()) || a.localeCompare(b);
}

import { fuzzyMatchScore } from '@/components/presentation/workout-editor/exercise-fuzzy-match';
import { ExerciseDescriptor, musclesOf } from '@/models/exercise-models';
import Enumerable from 'linq';

export interface ExerciseFilterResult {
  ids: string[];
  /** A new exercise to offer when no exercise's name matches the query exactly. */
  suggestion: ExerciseDescriptor | 'NONE';
}

/** Ranks the exercises that match `searchText` and share a muscle with `muscleFilters`, best match first. */
export function filterExercises(
  exercises: Record<string, ExerciseDescriptor>,
  searchText: string,
  muscleFilters: string[],
): ExerciseFilterResult {
  const trimmed = searchText.trim();
  const trimmedSearchText = escapeRegExp(trimmed);
  const fullMatchRegex = new RegExp('^' + trimmedSearchText + '$', 'i');
  let hasExactMatch = false;
  const ids = Enumerable.from(Object.entries(exercises))
    .select((x) => ({
      entry: { id: x[0], exercise: x[1] },
      score: trimmedSearchText ? fuzzyMatchScore(trimmedSearchText, x[1].name) : 0,
    }))
    .where(
      (x) =>
        (!muscleFilters.length ||
          musclesOf(x.entry.exercise).some((exerciseMuscle) => muscleFilters.includes(exerciseMuscle))) &&
        (!trimmedSearchText || x.score !== null),
    )
    .orderByDescending((x) => x.score ?? 0)
    .thenBy((x) => x.entry.exercise.name)
    .doAction((x) => {
      if (!hasExactMatch && trimmedSearchText && fullMatchRegex.test(x.entry.exercise.name)) {
        hasExactMatch = true;
      }
    })
    .select((x) => x.entry.id)
    .toArray();

  const suggestion: ExerciseDescriptor | 'NONE' =
    !hasExactMatch && trimmedSearchText
      ? {
          name: trimmed,
          category: '',
          equipment: null,
          force: null,
          instructions: '',
          level: '',
          mechanic: '',
          primaryMuscles: muscleFilters,
          secondaryMuscles: [],
        }
      : 'NONE';
  return { ids, suggestion };
}

/**
 * What the search opens with for the exercise being picked: its name when that names an exercise in the
 * list, as when swapping one out, so the list starts on it. A placeholder name like "New Exercise" names
 * nothing, so the search starts empty with every exercise listed.
 */
export function searchSeedFor(exercises: Record<string, ExerciseDescriptor>, exerciseName: string): string {
  const name = exerciseName.trim().toLowerCase();
  return name && Object.values(exercises).some((exercise) => exercise.name.trim().toLowerCase() === name)
    ? exerciseName
    : '';
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

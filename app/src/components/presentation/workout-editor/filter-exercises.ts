import { ExerciseDescriptor, musclesOf } from '@/models/exercise-models';
import { searchEntriesOf, searchScores } from '@/models/exercise-search';
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
  const scores = trimmed ? searchScores(searchEntriesOf(exercises), trimmed) : undefined;
  const lowerQuery = trimmed.toLowerCase();
  let hasExactMatch = false;
  const ids = Enumerable.from(Object.entries(exercises))
    .select((x) => ({
      entry: { id: x[0], exercise: x[1] },
      score: scores ? scores.get(x[0]) : 0,
    }))
    .where(
      (x) =>
        (!muscleFilters.length ||
          musclesOf(x.entry.exercise).some((exerciseMuscle) => muscleFilters.includes(exerciseMuscle))) &&
        x.score !== undefined,
    )
    .orderByDescending((x) => x.score ?? 0)
    .thenBy((x) => x.entry.exercise.name)
    .doAction((x) => {
      if (!hasExactMatch && trimmed && x.entry.exercise.name.toLowerCase() === lowerQuery) {
        hasExactMatch = true;
      }
    })
    .select((x) => x.entry.id)
    .toArray();

  const suggestion: ExerciseDescriptor | 'NONE' =
    !hasExactMatch && trimmed
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

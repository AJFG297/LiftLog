import ExerciseSearchAndFilters from '@/components/presentation/workout-editor/exercise-search-and-filters';
import { filterExercises } from '@/components/presentation/workout-editor/filter-exercises';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { useAppSelector } from '@/store';
import { selectExercises } from '@/store/stored-sessions';
import { useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

/**
 * The search field and muscle filters. It reports results only as the query or filters change, so a
 * caller that opens it with an `exerciseName` must seed its list with `filterExercises` for that name.
 */
export default function ExerciseFilterer(props: {
  exerciseName: string;
  onFilteredExerciseIdsChange: (ids: string[]) => void;
  onSuggestedNewExercise: (exerciseDescriptor: ExerciseDescriptor | 'NONE') => void;
}) {
  const exercises = useAppSelector(selectExercises);
  const { onFilteredExerciseIdsChange, onSuggestedNewExercise } = props;
  const [muscleFilters, setMuscleFilters] = useState([] as string[]);
  const [searchText, setSearchText] = useState(props.exerciseName);

  const search = useDebouncedCallback(() => {
    const result = filterExercises(exercises, searchText, muscleFilters);
    onFilteredExerciseIdsChange(result.ids);
    onSuggestedNewExercise(result.suggestion);
  }, 100);

  return (
    <ExerciseSearchAndFilters
      searchText={searchText}
      setSearchText={(s) => {
        setSearchText(s);
        search();
      }}
      muscleFilters={muscleFilters}
      setMuscleFilters={(m) => {
        setMuscleFilters(m);
        search();
      }}
    />
  );
}

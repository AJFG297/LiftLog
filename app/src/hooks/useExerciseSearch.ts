import { ExerciseDescriptor } from '@/models/exercise-models';
import { useAppSelector } from '@/store';
import { clearExerciseSearchResult } from '@/store/app';
import { uuid } from '@/utils/uuid';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Keyboard } from 'react-native';
import { useDispatch } from 'react-redux';

/**
 * Opens the exercise search route and hands the picked exercise to `onSelect`. The search is its own
 * route, so its result comes back through the store, tagged with this caller's request id.
 */
export function useExerciseSearch(onSelect: (exercise: ExerciseDescriptor) => void) {
  const { push } = useRouter();
  const dispatch = useDispatch();
  const requestId = useRef(uuid()).current;
  const searchResult = useAppSelector((x) => x.app.exerciseSearchResult);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (searchResult?.requestId !== requestId) {
      return;
    }
    onSelectRef.current(searchResult.exercise);
    dispatch(clearExerciseSearchResult());
  }, [searchResult, requestId, dispatch]);

  return (exerciseName: string) => {
    Keyboard.dismiss();
    push({
      pathname: '/exercise-search',
      params: { requestId, exerciseName },
    });
  };
}

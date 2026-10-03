import { getExerciseStatsHref } from '@/components/smart/exercise-stats-href';
import { ExerciseId } from '@/models/blueprint-models';
import { setOverallViewTime } from '@/store/stats';
import { useRouter } from 'expo-router';
import { useDispatch } from 'react-redux';

/**
 * Opens an exercise's expanded stats over all time. The Progress screens list lifts and records from the whole
 * history, but that view only covers its own period (the last 90 days by default), so an older row would open
 * on "no data". Goes when the exercise page replaces the expanded view.
 */
export function useOpenExerciseStats(): (exerciseId: ExerciseId) => void {
  const dispatch = useDispatch();
  const router = useRouter();
  return (exerciseId) => {
    dispatch(setOverallViewTime('all-time'));
    router.push(getExerciseStatsHref(exerciseId));
  };
}

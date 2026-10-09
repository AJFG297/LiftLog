import { exerciseProgressHref } from '@/components/smart/exercise-progress-href';
import { ExerciseId } from '@/models/blueprint-models';
import { useRouter } from 'expo-router';

/**
 * Opens a weighted exercise's progress page, pushed so Back returns to the screen it was opened from. Every
 * place that names an exercise opens it through this. Cardio exercises have no such page.
 */
export function useOpenExerciseProgress(): (exerciseId: ExerciseId) => void {
  const router = useRouter();
  return (exerciseId) => router.push(exerciseProgressHref(exerciseId));
}

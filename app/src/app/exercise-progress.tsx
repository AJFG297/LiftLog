import { ExerciseProgressScreen } from '@/components/smart/exercise-progress-screen';
import { useBackWhenGone } from '@/hooks/useBackWhenGone';
import { useLocalSearchParams } from 'expo-router';

export default function ExerciseProgressPage() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  useBackWhenGone(!exerciseId);
  return exerciseId ? <ExerciseProgressScreen exerciseId={exerciseId} /> : null;
}

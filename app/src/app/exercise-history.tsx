import { ExerciseHistory } from '@/components/smart/exercise-history';
import { ExerciseBlueprint } from '@/models/blueprint-models';
import { useLocalSearchParams } from 'expo-router';

export default function ExerciseHistoryPage() {
  const { exerciseId, type, name } = useLocalSearchParams<{
    exerciseId: string;
    type: ExerciseBlueprint['type'];
    name: string;
  }>();
  return <ExerciseHistory exerciseId={exerciseId} type={type} exerciseName={name} />;
}

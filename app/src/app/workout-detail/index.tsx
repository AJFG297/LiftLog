import { WorkoutDetail } from '@/components/smart/workout-detail';
import { useLocalSearchParams } from 'expo-router';

export default function WorkoutDetailPage() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <WorkoutDetail sessionId={sessionId} />;
}

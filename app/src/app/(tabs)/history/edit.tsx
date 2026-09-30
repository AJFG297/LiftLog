import { PastWorkoutEditor } from '@/components/smart/past-workout-editor';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function HistoryEditPage() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { dismissTo } = useRouter();
  return <PastWorkoutEditor sessionId={sessionId} close={() => dismissTo('/history')} />;
}

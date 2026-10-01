import { PastWorkoutEditor } from '@/components/smart/past-workout-editor';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function HistoryEditPage() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { back, canDismiss, dismissTo } = useRouter();
  // Back to whichever screen opened the editor (Home or All history). A deep link opens it alone in its
  // stack, so then it falls back to All history.
  return <PastWorkoutEditor sessionId={sessionId} close={() => (canDismiss() ? back() : dismissTo('/history'))} />;
}

import { PastWorkoutEditor } from '@/components/smart/past-workout-editor';
import { useLocalSearchParams, useRouter } from 'expo-router';

/**
 * The workout detail's Edit workout. It lives on the root stack beside the detail, not in the history tab, so the
 * detail stays underneath and back returns to it.
 */
export default function WorkoutDetailEditPage() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { back } = useRouter();
  return <PastWorkoutEditor sessionId={sessionId} close={back} />;
}

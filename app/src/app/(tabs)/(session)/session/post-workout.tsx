import { WorkoutSummary } from '@/components/smart/workout-summary';
import { Stack, useLocalSearchParams } from 'expo-router';

export default function PostWorkoutPage() {
  const { sessionId, source } = useLocalSearchParams<{
    sessionId?: string;
    source?: 'finished' | 'live' | 'history';
  }>();
  const finished = source === 'finished';

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !finished }} />
      <WorkoutSummary sessionId={sessionId ?? ''} finished={finished} />
    </>
  );
}

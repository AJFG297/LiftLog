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
      {/* Pushed rather than presented as a modal: an iOS modal sits above the root view, which would hide
          the toast the update-routine sheet leaves on this screen. */}
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !finished }} />
      <WorkoutSummary sessionId={sessionId ?? ''} finished={finished} />
    </>
  );
}

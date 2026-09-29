import { WorkoutSummary } from '@/components/smart/workout-summary';
import { Stack, useLocalSearchParams } from 'expo-router';

// This route sits on the root stack, outside the tabs, so the summary covers the tab bar and Done sits on
// the bottom edge. Native tabs can't hide their bar for one screen. The URL stays /session/post-workout.
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

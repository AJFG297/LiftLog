import { RoutineEditor } from '@/components/smart/routine-editor';
import { Stack, useLocalSearchParams } from 'expo-router';

export default function RoutineEditorPage() {
  const {
    sessionIndex,
    programId,
    new: isNew,
  } = useLocalSearchParams<{
    sessionIndex: string;
    programId: string;
    /** "1" to start a new routine at `sessionIndex`, the end of the program. */
    new?: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RoutineEditor programId={programId} sessionIndex={Number(sessionIndex)} isNew={isNew === '1'} />
    </>
  );
}

import { SessionExerciseEditor } from '@/components/smart/session-exercise-editor';
import { useLocalSearchParams } from 'expo-router';

export default function ExerciseEditorPage() {
  const { sessionId, index } = useLocalSearchParams<{ sessionId: string; index: string }>();
  return <SessionExerciseEditor sessionId={sessionId} index={Number(index)} />;
}

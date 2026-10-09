import { RoutineExerciseEditor } from '@/components/smart/routine-exercise-editor';
import { useLocalSearchParams } from 'expo-router';

export default function RoutineExerciseEditorPage() {
  const { programId, sessionIndex, exerciseIndex } = useLocalSearchParams<{
    programId: string;
    sessionIndex: string;
    exerciseIndex: string;
  }>();
  return (
    <RoutineExerciseEditor
      programId={programId}
      sessionIndex={Number(sessionIndex)}
      exerciseIndex={Number(exerciseIndex)}
    />
  );
}

import { ExerciseSearch } from '@/components/smart/exercise-search';
import type { ExercisePickerParams } from '@/hooks/useExerciseSearch';
import { useLocalSearchParams } from 'expo-router';

export default function ExerciseSearchPage() {
  const { requestId, mode, exerciseName, contextName, contextIds } = useLocalSearchParams<ExercisePickerParams>();
  return (
    <ExerciseSearch
      requestId={requestId}
      mode={mode === 'add' ? 'add' : 'swap'}
      exerciseName={exerciseName ?? ''}
      context={contextIds === undefined ? undefined : { name: contextName ?? '', exerciseIds: parseIds(contextIds) }}
    />
  );
}

function parseIds(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

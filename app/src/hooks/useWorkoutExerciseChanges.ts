import { useServices } from '@/components/smart/services-provider';
import type { RootState } from '@/store/store';
import { createWorkoutExerciseChanges } from '@/store/stored-sessions/workout-exercise-changes';
import { useStore } from 'react-redux';

export function useWorkoutExerciseChanges() {
  const store = useStore<RootState>();
  const services = useServices();
  return createWorkoutExerciseChanges({ store, services });
}

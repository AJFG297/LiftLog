import { RoutinesScreen } from '@/components/smart/routines-screen';
import { useLocalSearchParams } from 'expo-router';

/** The Routines tab. Programs and the routine editor open in this tab's own stack (`manage-workouts/`). */
export default function RoutinesTab() {
  const { focusprogramId } = useLocalSearchParams<{ focusprogramId?: string }>();
  return <RoutinesScreen focusProgramId={focusprogramId} />;
}

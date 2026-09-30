import { RoutinesScreen } from '@/components/smart/routines-screen';
import { useLocalSearchParams } from 'expo-router';

/** The Routines screen. The Routines tab renders this route's default export too. */
export default function ProgramListPage() {
  const { focusprogramId } = useLocalSearchParams<{ focusprogramId?: string }>();
  return <RoutinesScreen focusProgramId={focusprogramId} />;
}

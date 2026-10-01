import { ProgramEditor } from '@/components/smart/program-editor';
import { useLocalSearchParams } from 'expo-router';

export default function ProgramPage() {
  const { programId } = useLocalSearchParams<{ programId: string }>();
  return <ProgramEditor programId={programId} />;
}

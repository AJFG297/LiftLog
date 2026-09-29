import { SessionDiffSaveEditor } from '@/components/smart/session-diff-save';
import { useLocalSearchParams } from 'expo-router';

export default function DiffSavePage() {
  const { from } = useLocalSearchParams<{ from?: 'summary' }>();
  return <SessionDiffSaveEditor overSummary={from === 'summary'} />;
}

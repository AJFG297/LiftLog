import { routinesHref } from '@/components/smart/routines-href';
import { Redirect, useLocalSearchParams } from 'expo-router';

/** The Routines screen's old address. It lives in the Routines tab now; this keeps old links working. */
export default function ProgramListRedirect() {
  const { focusprogramId } = useLocalSearchParams<{ focusprogramId?: string }>();
  return <Redirect href={routinesHref(focusprogramId)} />;
}

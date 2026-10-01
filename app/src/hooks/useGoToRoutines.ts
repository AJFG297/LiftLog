import { goToRoutinesActions, routinesHref } from '@/components/smart/routines-href';
import { useNavigationContainerRef, useRouter } from 'expo-router';

/**
 * Opens the Routines screen, optionally on one program, from any tab or screen over the tabs, without
 * stacking a second Routines screen (see `goToRoutinesActions`).
 */
export function useGoToRoutines() {
  const navigation = useNavigationContainerRef();
  const { navigate } = useRouter();
  return (focusProgramId?: string) => {
    const actions = goToRoutinesActions(navigation.getRootState(), focusProgramId);
    if (!actions) {
      navigate(routinesHref(focusProgramId));
      return;
    }
    for (const action of actions) {
      navigation.dispatch(action);
    }
  };
}

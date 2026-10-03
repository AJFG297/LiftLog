import { router } from 'expo-router';
import { AppState } from 'react-native';

/**
 * Opens the "Update your routine?" sheet over Home, the way the in-app Finish does, for a workout finished
 * from the workout notification. That can happen with the app in the background, where opening a screen
 * would go unseen, so the sheet then waits for the app's next return to the foreground. `stillPending` is
 * checked at that point, so a diff that was dealt with in the meantime doesn't open an empty sheet.
 */
export function offerPlanUpdateInForeground(stillPending: () => boolean) {
  const open = () => {
    if (!stillPending()) {
      return;
    }
    router.dismissTo('/');
    router.push('/diff-save');
  };
  if (AppState.currentState === 'active') {
    open();
    return;
  }
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      subscription.remove();
      open();
    }
  });
}

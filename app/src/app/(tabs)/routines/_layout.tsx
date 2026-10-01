import StackWithHeader from '@/components/layout/stack-with-header';
import { WithWorkoutInProgressBar } from '@/components/smart/workout-in-progress';

// A deep link straight to a program or routine, or a push with `withAnchor` (saving a shared workout to the
// plan from the feed), still gets the Routines screen under it, so Back lands there. A plain push doesn't.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function Layout() {
  return (
    <WithWorkoutInProgressBar>
      <StackWithHeader />
    </WithWorkoutInProgressBar>
  );
}

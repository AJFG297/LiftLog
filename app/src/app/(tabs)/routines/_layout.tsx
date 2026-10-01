import StackWithHeader from '@/components/layout/stack-with-header';
import { WithWorkoutInProgressBar } from '@/components/smart/workout-in-progress';

// A link straight to a program or routine (from the feed, an import) still has the Routines screen under it,
// so Back lands there.
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

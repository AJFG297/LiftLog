import StackWithHeader from '@/components/layout/stack-with-header';
import { WithWorkoutInProgressBar } from '@/components/smart/workout-in-progress';

export default function Layout() {
  return (
    <WithWorkoutInProgressBar>
      <StackWithHeader />
    </WithWorkoutInProgressBar>
  );
}

import type { NavigatorState } from '@/models/home/resume-workout';

/** The workout screen (`session/index`) and its sheets (`session/rest`, ...) in the Home stack. */
const WORKOUT_ROUTE_PREFIX = 'session/';

/**
 * Whether a tab draws the workout-in-progress bar: there is a workout, and the tab isn't showing it.
 *
 * A tab shows the workout while the top of its own stack is the workout screen or one of its sheets. That
 * stays true while a screen over the tabs (the exercise picker, an exercise's history) opens or closes on
 * top of it, which the URL doesn't: it names the new screen as soon as it starts sliding in, and the bar
 * would flash in under the workout. A minimised workout has left the Home stack, and every other tab's
 * stack never holds it, so the bar shows there.
 *
 * `state` is any navigation state that holds the tab's route, such as the tabs navigator's own state or
 * `getRootState()`, and `tabKey` the key of that route.
 */
export function showsWorkoutInProgressBar(
  state: NavigatorState | undefined,
  tabKey: string,
  hasWorkout: boolean,
): boolean {
  if (!hasWorkout) {
    return false;
  }
  const stack = state && stateOfRoute(state, tabKey);
  // A stack's top route is its last one.
  const top = stack?.routes[stack.routes.length - 1];
  return !top?.name.startsWith(WORKOUT_ROUTE_PREFIX);
}

function stateOfRoute(state: NavigatorState, key: string): NavigatorState | undefined {
  for (const route of state.routes) {
    if (route.key === key) {
      return route.state;
    }
    const found = route.state && stateOfRoute(route.state, key);
    if (found) {
      return found;
    }
  }
  return undefined;
}

import type { NavigationAction } from 'expo-router/react-navigation';

/** The slice of a navigation state this reads; `getRootState()` and its nested states all fit it. */
export interface NavigatorState {
  key?: string;
  routes: readonly NavigatorRoute[];
}

export interface NavigatorRoute {
  key?: string;
  name: string;
  state?: NavigatorState;
}

const HOME_TAB = '(session)';
const HOME_SCREEN = 'index';
const WORKOUT_SCREEN = 'session/index';

/**
 * The actions that bring the workout back from any tab: the Home stack becomes Home with the one
 * workout screen on it, then the Home tab is selected. A workout screen already in the stack keeps its
 * key, so it doesn't remount, and whatever was stacked above it (one of its sheets, a history page) is
 * dropped, so back from the workout always lands on Home.
 *
 * A plain push can't do this: from another tab it only reuses the workout screen when that is on top of
 * the Home stack, and adds a second one otherwise.
 *
 * Undefined when the Home stack isn't in the state yet.
 */
export function resumeWorkoutActions(root: NavigatorState | undefined): NavigationAction[] | undefined {
  const found = root && findHomeStack(root);
  if (!found?.tabs.key || !found.home.key) {
    return undefined;
  }
  const { tabs, home } = found;
  const homeRoute = home.routes.find((route) => route.name === HOME_SCREEN) ?? { name: HOME_SCREEN };
  const workoutRoute = home.routes.find((route) => route.name === WORKOUT_SCREEN) ?? { name: WORKOUT_SCREEN };
  return [
    { type: 'RESET', payload: { ...home, index: 1, routes: [homeRoute, workoutRoute] }, target: home.key },
    { type: 'JUMP_TO', payload: { name: HOME_TAB }, target: tabs.key },
  ];
}

function findHomeStack(state: NavigatorState): { tabs: NavigatorState; home: NavigatorState } | undefined {
  for (const route of state.routes) {
    if (!route.state) {
      continue;
    }
    if (route.name === HOME_TAB) {
      return { tabs: state, home: route.state };
    }
    const found = findHomeStack(route.state);
    if (found) {
      return found;
    }
  }
  return undefined;
}

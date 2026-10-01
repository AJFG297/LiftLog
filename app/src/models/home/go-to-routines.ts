import type { NavigatorRoute, NavigatorState } from '@/models/home/resume-workout';
import type { NavigationAction } from 'expo-router/react-navigation';

const TABS = '(tabs)';
const ROUTINES_TAB = 'routines';
const ROUTINES_SCREEN = 'index';
const IMPORT_SCREENS = ['import-plan', 'import-plan-info'];

/**
 * The actions that land on the one Routines screen from anywhere: whatever is open over the tabs closes,
 * the Routines stack becomes just the Routines screen (keeping its key, so it doesn't remount), and the
 * Routines tab is selected.
 *
 * A link to `/routines` can't do this. From another tab it becomes a navigate to `index` inside the
 * Routines stack, which only reuses that screen when it is on top, so with a program or a routine open
 * it pushes a second Routines screen.
 *
 * `root` is `getRootState()`: expo-router's container, whose one route holds the app's root stack, so the
 * stack holding the tabs is looked for rather than assumed. Undefined when the tabs aren't in it yet.
 */
export function goToRoutinesActions(
  root: NavigatorState | undefined,
  focusProgramId?: string,
): NavigationAction[] | undefined {
  const found = root && findTabs(root);
  if (!found?.stack.key || !found.tabs.key) {
    return undefined;
  }
  const { stack: rootStack, tabsIndex, tabs } = found;
  const params = focusProgramId === undefined ? undefined : { focusprogramId: focusProgramId };
  const actions: NavigationAction[] = [];
  const above = rootStack.routes.length - 1 - tabsIndex;
  if (above > 0) {
    actions.push({ type: 'POP', payload: { count: above }, target: rootStack.key });
  }
  const routines = tabs.routes.find((route) => route.name === ROUTINES_TAB)?.state;
  if (!routines?.key) {
    // The Routines tab hasn't been opened yet, so its stack starts on the Routines screen.
    actions.push({
      type: 'JUMP_TO',
      payload: { name: ROUTINES_TAB, params: { screen: ROUTINES_SCREEN, params } },
      target: tabs.key,
    });
    return actions;
  }
  const existingKey = routines.routes.find((route) => route.name === ROUTINES_SCREEN)?.key;
  // Only the key carries over: the old route's path would still name the old program.
  const screen: NavigatorRoute = existingKey
    ? { key: existingKey, name: ROUTINES_SCREEN, params }
    : { name: ROUTINES_SCREEN, params };
  actions.push(
    { type: 'RESET', payload: { ...routines, index: 0, routes: [screen] }, target: routines.key },
    { type: 'JUMP_TO', payload: { name: ROUTINES_TAB }, target: tabs.key },
  );
  return actions;
}

function findTabs(
  state: NavigatorState,
): { stack: NavigatorState; tabsIndex: number; tabs: NavigatorState } | undefined {
  const tabsIndex = state.routes.findIndex((route) => route.name === TABS);
  const tabs = state.routes[tabsIndex]?.state;
  if (tabs) {
    return { stack: state, tabsIndex, tabs };
  }
  for (const route of state.routes) {
    const found = route.state && findTabs(route.state);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * How many of the plan import's screens (the file picker page, the preview) are on top of a Routines stack,
 * so saving an import can leave them before going to Routines. At least one route stays.
 */
export function importScreensOnTop(routes: readonly { name: string }[]): number {
  let count = 0;
  while (count < routes.length - 1 && IMPORT_SCREENS.includes(routes[routes.length - 1 - count]!.name)) {
    count++;
  }
  return count;
}

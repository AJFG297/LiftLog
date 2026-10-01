import type { NavigatorRoute, NavigatorState } from '@/models/home/resume-workout';
import { Href } from 'expo-router';
import type { NavigationAction } from 'expo-router/react-navigation';

// Programs and routines open in the Routines tab's own stack, so Back returns to the Routines screen.

/** The Routines screen, optionally scrolled to one of the saved programs. */
export function routinesHref(focusProgramId?: string): Href {
  return focusProgramId ? `/routines?focusprogramId=${encodeURIComponent(focusProgramId)}` : '/routines';
}

/** A program's page. */
export function programHref(programId: string): Href {
  return `/routines/manage-workouts/${encodeURIComponent(programId)}`;
}

/** Where a routine is edited: an existing one by its place in the program, a new one at the end. */
export function routineEditorHref(programId: string, sessionIndex: number, options?: { isNew?: boolean }): Href {
  return `/routines/manage-workouts/${encodeURIComponent(programId)}/manage-session/${sessionIndex}${options?.isNew ? '?new=1' : ''}`;
}

const TABS = '(tabs)';
const ROUTINES_TAB = 'routines';
const ROUTINES_SCREEN = 'index';

/**
 * The actions that land on the one Routines screen from anywhere: whatever is open over the tabs closes,
 * the Routines stack becomes just the Routines screen (keeping its key, so it doesn't remount), and the
 * Routines tab is selected.
 *
 * A link to `/routines` can't do this. From another tab it becomes a navigate to `index` inside the
 * Routines stack, which only reuses that screen when it is on top, so with a program or a routine open
 * it pushes a second Routines screen.
 *
 * Undefined when the tabs aren't in the state yet.
 */
export function goToRoutinesActions(
  root: NavigatorState | undefined,
  focusProgramId?: string,
): NavigationAction[] | undefined {
  const tabsIndex = root ? root.routes.findIndex((route) => route.name === TABS) : -1;
  const tabs = root?.routes[tabsIndex]?.state;
  if (!root?.key || !tabs?.key) {
    return undefined;
  }
  const params = focusProgramId === undefined ? undefined : { focusprogramId: focusProgramId };
  const actions: NavigationAction[] = [];
  const above = root.routes.length - 1 - tabsIndex;
  if (above > 0) {
    actions.push({ type: 'POP', payload: { count: above }, target: root.key });
  }
  const stack = tabs.routes.find((route) => route.name === ROUTINES_TAB)?.state;
  if (!stack?.key) {
    // The Routines tab hasn't been opened yet, so its stack starts on the Routines screen.
    actions.push({
      type: 'JUMP_TO',
      payload: { name: ROUTINES_TAB, params: { screen: ROUTINES_SCREEN, params } },
      target: tabs.key,
    });
    return actions;
  }
  const existing: NavigatorRoute = stack.routes.find((route) => route.name === ROUTINES_SCREEN) ?? {
    name: ROUTINES_SCREEN,
  };
  actions.push(
    { type: 'RESET', payload: { ...stack, index: 0, routes: [{ ...existing, params }] }, target: stack.key },
    { type: 'JUMP_TO', payload: { name: ROUTINES_TAB }, target: tabs.key },
  );
  return actions;
}

import type { NavigatorRoute, NavigatorState } from '@/models/home/resume-workout';

/**
 * A navigation state shaped like `getRootState()`: expo-router's container, whose one `__root` route holds
 * the app's root stack, with the tabs on it and `over` stacked above them. A tab whose routes are
 * undefined hasn't been opened yet, so it has no state.
 */
export function rootStateWith({
  home = [{ key: 'home-index', name: 'index' }],
  routines,
  over = [],
}: {
  home?: NavigatorRoute[];
  routines?: NavigatorRoute[];
  over?: NavigatorRoute[];
}): NavigatorState {
  const tab = (name: string, key: string, routes: NavigatorRoute[] | undefined): NavigatorRoute => ({
    key: `${key}-tab`,
    name,
    state: routes ? { key, routes } : undefined,
  });
  return {
    key: 'container',
    routes: [
      {
        key: '__root-route',
        name: '__root',
        state: {
          key: 'root',
          routes: [
            {
              key: 'tabs-route',
              name: '(tabs)',
              state: {
                key: 'tabs',
                routes: [
                  tab('(session)', 'home', home),
                  tab('routines', 'routines', routines),
                  tab('stats', 'stats', undefined),
                  tab('settings', 'settings', undefined),
                ],
              },
            },
            ...over,
          ],
        },
      },
    ],
  };
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { offerPlanUpdateInForeground } from '@/services/plan-update-offer';

const env = vi.hoisted(() => ({
  appState: 'active',
  changeListeners: [] as ((state: string) => void)[],
  navigation: [] as string[],
}));
vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return env.appState;
    },
    addEventListener: (_: string, listener: (state: string) => void) => {
      env.changeListeners.push(listener);
      return { remove: () => env.changeListeners.splice(env.changeListeners.indexOf(listener), 1) };
    },
  },
}));
vi.mock('expo-router', () => ({
  router: {
    dismissTo: (href: string) => env.navigation.push(`dismissTo ${href}`),
    push: (href: string) => env.navigation.push(`push ${href}`),
  },
}));

function moveAppTo(state: string) {
  env.appState = state;
  [...env.changeListeners].forEach((listener) => listener(state));
}

describe('offerPlanUpdateInForeground', () => {
  beforeEach(() => {
    env.appState = 'active';
    env.changeListeners = [];
    env.navigation = [];
  });

  it('opens the sheet over Home straight away while the app is in the foreground', () => {
    offerPlanUpdateInForeground(() => true);

    expect(env.navigation).toEqual(['dismissTo /', 'push /diff-save']);
  });

  it('waits for the app to come back to the foreground, then opens the sheet once', () => {
    env.appState = 'background';

    offerPlanUpdateInForeground(() => true);
    expect(env.navigation).toEqual([]);

    moveAppTo('active');
    moveAppTo('background');
    moveAppTo('active');

    expect(env.navigation).toEqual(['dismissTo /', 'push /diff-save']);
  });

  it('opens nothing if the diff is no longer pending by then', () => {
    env.appState = 'background';
    let pending = true;

    offerPlanUpdateInForeground(() => pending);
    pending = false;
    moveAppTo('active');

    expect(env.navigation).toEqual([]);
  });
});

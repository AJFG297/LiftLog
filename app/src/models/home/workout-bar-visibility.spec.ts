import { describe, expect, it } from 'vitest';
import { rootStateWith } from '@/models/home/__test__/root-state';
import { showsWorkoutInProgressBar } from '@/models/home/workout-bar-visibility';

const home = { key: 'home-index', name: 'index' };
const workout = { key: 'session-1', name: 'session/index' };
const restSheet = { key: 'rest-1', name: 'session/rest' };
const picker = { key: 'picker-1', name: 'exercise-search' };
const routines = [{ key: 'routines-index', name: 'index' }];

describe('showsWorkoutInProgressBar', () => {
  it('hides the bar under the workout screen', () => {
    expect(showsWorkoutInProgressBar(rootStateWith({ home: [home, workout], routines }), 'home-tab', true)).toBe(false);
  });

  it('hides it under one of the workout sheets', () => {
    expect(
      showsWorkoutInProgressBar(rootStateWith({ home: [home, workout, restSheet], routines }), 'home-tab', true),
    ).toBe(false);
  });

  it('keeps it hidden while the exercise picker opens or closes over the workout', () => {
    const root = rootStateWith({ home: [home, workout], routines, over: [picker] });

    expect(showsWorkoutInProgressBar(root, 'home-tab', true)).toBe(false);
  });

  it('shows it on every tab once the workout is minimised', () => {
    const root = rootStateWith({ home: [home], routines });

    expect(showsWorkoutInProgressBar(root, 'home-tab', true)).toBe(true);
    expect(showsWorkoutInProgressBar(root, 'routines-tab', true)).toBe(true);
    expect(showsWorkoutInProgressBar(root, 'stats-tab', true)).toBe(true);
  });

  it('shows it on another tab while the workout is still open on Home', () => {
    expect(showsWorkoutInProgressBar(rootStateWith({ home: [home, workout], routines }), 'routines-tab', true)).toBe(
      true,
    );
  });

  it('never shows without a workout in progress', () => {
    expect(showsWorkoutInProgressBar(rootStateWith({ home: [home], routines }), 'routines-tab', false)).toBe(false);
    expect(showsWorkoutInProgressBar(rootStateWith({ home: [home, workout], routines }), 'home-tab', false)).toBe(
      false,
    );
  });

  describe("from the tabs navigator's own state, as the bar reads it", () => {
    /** The tabs' state: Home's stack holding `homeRoutes`, Routines on its screen. */
    const tabsWith = (homeRoutes: { key: string; name: string }[]) => ({
      key: 'tabs',
      routes: [
        { key: 'home-tab', name: '(session)', state: { key: 'home', routes: homeRoutes } },
        { key: 'routines-tab', name: 'routines', state: { key: 'routines', routes: routines } },
      ],
    });

    it('shows the bar on Home right after Minimise, which leaves Home on its own', () => {
      expect(showsWorkoutInProgressBar(tabsWith([home]), 'home-tab', true)).toBe(true);
    });

    it('hides it on Home right after the workout is reopened from the bar', () => {
      expect(showsWorkoutInProgressBar(tabsWith([home, workout]), 'home-tab', true)).toBe(false);
    });

    it('keeps it on Routines while the workout is open on Home', () => {
      expect(showsWorkoutInProgressBar(tabsWith([home, workout]), 'routines-tab', true)).toBe(true);
    });
  });
});

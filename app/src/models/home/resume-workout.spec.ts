import { describe, expect, it } from 'vitest';
import { rootStateWith } from '@/models/home/__test__/root-state';
import { NavigatorRoute, NavigatorState, resumeWorkoutActions } from '@/models/home/resume-workout';

/** `getRootState()` with the Home stack holding `homeRoutes`. */
function rootWith(homeRoutes: NavigatorRoute[]): NavigatorState {
  return rootStateWith({ home: homeRoutes, routines: [{ key: 'r', name: 'index' }] });
}

const home = { key: 'index-1', name: 'index' };
const workout = { key: 'session-1', name: 'session/index' };

describe('resumeWorkoutActions', () => {
  it('drops the sheet above the open workout screen rather than adding a second one', () => {
    const actions = resumeWorkoutActions(rootWith([home, workout, { key: 'rest-1', name: 'session/rest' }]));

    expect(actions).toEqual([
      { type: 'RESET', payload: { key: 'home', index: 1, routes: [home, workout] }, target: 'home' },
      { type: 'JUMP_TO', payload: { name: '(session)' }, target: 'tabs' },
    ]);
  });

  it('keeps the open workout screen when it is already on top', () => {
    const actions = resumeWorkoutActions(rootWith([home, workout]));

    expect(actions?.[0]).toEqual({
      type: 'RESET',
      payload: { key: 'home', index: 1, routes: [home, workout] },
      target: 'home',
    });
  });

  it('puts the workout screen straight on Home, so back goes to Home and not the page it was opened from', () => {
    const actions = resumeWorkoutActions(rootWith([home, { key: 'history-1', name: 'history/index' }, workout]));

    expect(actions?.[0]).toEqual({
      type: 'RESET',
      payload: { key: 'home', index: 1, routes: [home, workout] },
      target: 'home',
    });
  });

  it('opens a new workout screen on Home when none is in the stack', () => {
    const actions = resumeWorkoutActions(rootWith([home, { key: 'history-1', name: 'history/index' }]));

    expect(actions?.[0]).toEqual({
      type: 'RESET',
      payload: { key: 'home', index: 1, routes: [home, { name: 'session/index' }] },
      target: 'home',
    });
  });

  it('is undefined before the Home stack has a state', () => {
    expect(resumeWorkoutActions(undefined)).toBeUndefined();
    expect(
      resumeWorkoutActions({
        key: 'root',
        routes: [{ key: 'tabs-route', name: '(tabs)', state: { key: 'tabs', routes: [] } }],
      }),
    ).toBeUndefined();
    expect(resumeWorkoutActions({ key: 'home', routes: [home, workout] })).toBeUndefined();
  });
});

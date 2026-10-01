import { describe, expect, it } from 'vitest';
import type { NavigatorRoute, NavigatorState } from '@/models/home/resume-workout';
import { goToRoutinesActions, programHref, routineEditorHref, routinesHref } from './routines-href';

describe('routines hrefs', () => {
  it('opens the Routines screen, optionally on a program', () => {
    expect(routinesHref()).toBe('/routines');
    expect(routinesHref('abc-123')).toBe('/routines?focusprogramId=abc-123');
  });

  it('opens a program inside the Routines tab', () => {
    expect(programHref('abc-123')).toBe('/routines/manage-workouts/abc-123');
  });

  it('opens a routine inside the Routines tab', () => {
    expect(routineEditorHref('abc-123', 2)).toBe('/routines/manage-workouts/abc-123/manage-session/2');
    expect(routineEditorHref('abc-123', 3, { isNew: true })).toBe(
      '/routines/manage-workouts/abc-123/manage-session/3?new=1',
    );
  });
});

/** The root stack with the tabs on it (Home and You open), the Routines stack holding `routines`, then `over`. */
function rootWith(routines: NavigatorRoute[] | undefined, over: NavigatorRoute[] = []): NavigatorState {
  return {
    key: 'root',
    routes: [
      {
        key: 'tabs-route',
        name: '(tabs)',
        state: {
          key: 'tabs',
          routes: [
            { key: 'home-tab', name: '(session)', state: { key: 'home', routes: [{ key: 'h', name: 'index' }] } },
            {
              key: 'routines-tab',
              name: 'routines',
              state: routines ? { key: 'routines', routes: routines } : undefined,
            },
            { key: 'you-tab', name: 'settings' },
          ],
        },
      },
      ...over,
    ],
  };
}

const routinesScreen = { key: 'index-1', name: 'index', params: { focusprogramId: 'old' } };
const programPage = { key: 'program-1', name: 'manage-workouts/[programId]/index' };
const editor = { key: 'editor-1', name: 'manage-workouts/[programId]/manage-session/[sessionIndex]/index' };

describe('goToRoutinesActions', () => {
  it('drops the program page and editor rather than stacking a second Routines screen', () => {
    expect(goToRoutinesActions(rootWith([routinesScreen, programPage, editor]))).toEqual([
      {
        type: 'RESET',
        payload: { key: 'routines', index: 0, routes: [{ key: 'index-1', name: 'index', params: undefined }] },
        target: 'routines',
      },
      { type: 'JUMP_TO', payload: { name: 'routines' }, target: 'tabs' },
    ]);
  });

  it('shows the program asked for', () => {
    expect(goToRoutinesActions(rootWith([routinesScreen]), 'abc-123')?.[0]).toEqual({
      type: 'RESET',
      payload: {
        key: 'routines',
        index: 0,
        routes: [{ key: 'index-1', name: 'index', params: { focusprogramId: 'abc-123' } }],
      },
      target: 'routines',
    });
  });

  it('puts the Routines screen under a stack that started on another screen', () => {
    const importPreview = { key: 'import-1', name: 'import-plan' };

    expect(goToRoutinesActions(rootWith([importPreview]), 'abc-123')?.[0]).toEqual({
      type: 'RESET',
      payload: { key: 'routines', index: 0, routes: [{ name: 'index', params: { focusprogramId: 'abc-123' } }] },
      target: 'routines',
    });
  });

  it('opens the Routines tab on its screen when it has never been opened', () => {
    expect(goToRoutinesActions(rootWith(undefined), 'abc-123')).toEqual([
      {
        type: 'JUMP_TO',
        payload: { name: 'routines', params: { screen: 'index', params: { focusprogramId: 'abc-123' } } },
        target: 'tabs',
      },
    ]);
  });

  it('closes what is open over the tabs first', () => {
    const feed = { key: 'feed-1', name: 'feed' };
    const sharedItem = { key: 'detail-1', name: 'workout-detail/index' };

    expect(goToRoutinesActions(rootWith([routinesScreen], [feed, sharedItem]))?.[0]).toEqual({
      type: 'POP',
      payload: { count: 2 },
      target: 'root',
    });
  });

  it('is undefined before the tabs are in the state', () => {
    expect(goToRoutinesActions(undefined)).toBeUndefined();
    expect(goToRoutinesActions({ key: 'root', routes: [{ key: 'feed-1', name: 'feed' }] })).toBeUndefined();
  });
});

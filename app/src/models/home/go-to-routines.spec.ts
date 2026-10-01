import { describe, expect, it } from 'vitest';
import { rootStateWith } from '@/models/home/__test__/root-state';
import { goToRoutinesActions, importScreensOnTop } from '@/models/home/go-to-routines';

const routinesScreen = {
  key: 'index-1',
  name: 'index',
  params: { focusprogramId: 'old' },
  path: '/routines?focusprogramId=old',
};
const programPage = { key: 'program-1', name: 'manage-workouts/[programId]/index' };
const editor = { key: 'editor-1', name: 'manage-workouts/[programId]/manage-session/[sessionIndex]/index' };

describe('goToRoutinesActions', () => {
  it('drops the program page and editor rather than stacking a second Routines screen', () => {
    expect(goToRoutinesActions(rootStateWith({ routines: [routinesScreen, programPage, editor] }))).toEqual([
      {
        type: 'RESET',
        payload: { key: 'routines', index: 0, routes: [{ key: 'index-1', name: 'index', params: undefined }] },
        target: 'routines',
      },
      { type: 'JUMP_TO', payload: { name: 'routines' }, target: 'tabs' },
    ]);
  });

  it('shows the program asked for, without the old path', () => {
    expect(goToRoutinesActions(rootStateWith({ routines: [routinesScreen] }), 'abc-123')?.[0]).toEqual({
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

    expect(goToRoutinesActions(rootStateWith({ routines: [importPreview] }), 'abc-123')?.[0]).toEqual({
      type: 'RESET',
      payload: { key: 'routines', index: 0, routes: [{ name: 'index', params: { focusprogramId: 'abc-123' } }] },
      target: 'routines',
    });
  });

  it('opens the Routines tab on its screen when it has never been opened', () => {
    expect(goToRoutinesActions(rootStateWith({}), 'abc-123')).toEqual([
      {
        type: 'JUMP_TO',
        payload: { name: 'routines', params: { screen: 'index', params: { focusprogramId: 'abc-123' } } },
        target: 'tabs',
      },
    ]);
  });

  it("closes what is open over the tabs on the app's root stack, not expo-router's container", () => {
    const feed = { key: 'feed-1', name: 'feed' };
    const detail = { key: 'detail-1', name: 'workout-detail/index' };

    expect(goToRoutinesActions(rootStateWith({ routines: [routinesScreen], over: [feed, detail] }))).toEqual([
      { type: 'POP', payload: { count: 2 }, target: 'root' },
      {
        type: 'RESET',
        payload: { key: 'routines', index: 0, routes: [{ key: 'index-1', name: 'index', params: undefined }] },
        target: 'routines',
      },
      { type: 'JUMP_TO', payload: { name: 'routines' }, target: 'tabs' },
    ]);
  });

  it('is undefined before the tabs are in the state', () => {
    expect(goToRoutinesActions(undefined)).toBeUndefined();
    expect(
      goToRoutinesActions({
        key: 'container',
        routes: [{ key: '__root-route', name: '__root', state: { key: 'root', routes: [{ name: 'feed' }] } }],
      }),
    ).toBeUndefined();
  });
});

describe('importScreensOnTop', () => {
  const name = (n: string) => ({ name: n });

  it('counts the picker page and preview over the editor they were opened from', () => {
    expect(importScreensOnTop(['index', editor.name, 'import-plan-info', 'import-plan'].map(name))).toBe(2);
  });

  it('counts only the preview when a file was opened over the Routines screen', () => {
    expect(importScreensOnTop(['index', 'import-plan'].map(name))).toBe(1);
  });

  it('leaves the one route of a stack that started on the preview', () => {
    expect(importScreensOnTop([name('import-plan')])).toBe(0);
  });

  it('is 0 when no import screen is on top', () => {
    expect(importScreensOnTop(['index', 'import-plan', programPage.name].map(name))).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { programHref, routineEditorHref, routinesHref } from './routines-href';

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

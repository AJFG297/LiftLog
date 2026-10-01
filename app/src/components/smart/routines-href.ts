import { Href } from 'expo-router';

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

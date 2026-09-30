import { ExerciseBlueprint, SessionBlueprint } from '@/models/blueprint-models';
import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * A routine being edited. Nothing reaches the plan until Save, so the editor, the exercise details screen
 * and the set-type sheet, which are separate routes, all edit this instead of the store.
 */
export interface RoutineDraft {
  /** The routine as saved, or undefined for a new one. */
  original: SessionBlueprint | undefined;
  routine: SessionBlueprint;
  /**
   * One stable key per exercise, in the routine's order, so a card stays open and keeps its React identity
   * while exercises move. Blueprints have no id of their own, and the same exercise can appear twice.
   */
  keys: string[];
}

export interface RoutineDraftLocation {
  programId: string;
  sessionIndex: number;
}

type Listener = () => void;

const drafts = new Map<string, RoutineDraft>();
/**
 * How many editor screens hold each draft. Two can be open on the same routine, say one from Routines and
 * one from the Workout tab's upcoming card, and the draft has to outlive whichever closes first.
 */
const owners = new Map<string, number>();
const listeners = new Set<Listener>();
let keyCounter = 0;

export function newExerciseKey(): string {
  keyCounter += 1;
  return `exercise-${keyCounter}`;
}

function keyOf(location: RoutineDraftLocation): string {
  return `${location.programId}/${location.sessionIndex}`;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function openRoutineDraft(original: SessionBlueprint | undefined): RoutineDraft {
  const routine = original ?? new SessionBlueprint('', [], '');
  return { original, routine, keys: routine.exercises.map(newExerciseKey) };
}

export function routineDraftAt(location: RoutineDraftLocation): RoutineDraft | undefined {
  return drafts.get(keyOf(location));
}

/**
 * Applies an edit that keeps every exercise where it is, if the draft is still open. Exercises added,
 * removed or moved go through {@link setRoutineDraftExercises} instead, so their keys follow them.
 */
export function updateRoutineDraft(
  location: RoutineDraftLocation,
  update: (routine: SessionBlueprint) => SessionBlueprint,
) {
  const key = keyOf(location);
  const draft = drafts.get(key);
  if (!draft) {
    return;
  }
  drafts.set(key, { ...draft, routine: update(draft.routine) });
  notify();
}

/** Replaces the draft's exercises, with `keys` saying which is which. */
export function setRoutineDraftExercises(
  location: RoutineDraftLocation,
  exercises: ExerciseBlueprint[],
  keys: string[],
) {
  const key = keyOf(location);
  const draft = drafts.get(key);
  if (!draft) {
    return;
  }
  drafts.set(key, { ...draft, routine: draft.routine.with({ exercises }), keys });
  notify();
}

/** Whether leaving would lose anything: a change to a saved routine, or anything at all in a new one. */
export function isRoutineDraftChanged(draft: RoutineDraft): boolean {
  if (!draft.original) {
    const { routine } = draft;
    return routine.name.trim() !== '' || routine.notes.trim() !== '' || routine.exercises.length > 0;
  }
  return !draft.routine.equals(draft.original);
}

/** Records `saved` as the routine's saved state, so another editor still open on it has nothing unsaved. */
export function markRoutineDraftSaved(location: RoutineDraftLocation, saved: SessionBlueprint) {
  const key = keyOf(location);
  const draft = drafts.get(key);
  if (!draft) {
    return;
  }
  drafts.set(key, { ...draft, original: saved, routine: saved });
  notify();
}

/**
 * Opens a draft for an editor screen, which owns it: it lives while any editor on that routine is mounted,
 * and is thrown away when the last one goes, saved or not. A second editor on the same routine picks up
 * the first one's draft.
 */
export function useOwnedRoutineDraft(location: RoutineDraftLocation, open: () => RoutineDraft): RoutineDraft {
  const [initial] = useState(open);
  const key = keyOf(location);
  useEffect(() => {
    if (!drafts.has(key)) {
      drafts.set(key, initial);
      notify();
    }
    owners.set(key, (owners.get(key) ?? 0) + 1);
    return () => {
      const left = (owners.get(key) ?? 1) - 1;
      if (left > 0) {
        owners.set(key, left);
        return;
      }
      owners.delete(key);
      drafts.delete(key);
      notify();
    };
  }, [key, initial]);
  return useSyncExternalStore(subscribe, () => drafts.get(key) ?? initial);
}

/** The draft another route edits, such as the exercise details screen: undefined once the editor has gone. */
export function useRoutineDraft(location: RoutineDraftLocation): RoutineDraft | undefined {
  const key = keyOf(location);
  return useSyncExternalStore(subscribe, () => drafts.get(key));
}

import { ExerciseBlueprint } from '@/models/blueprint-models';
import { uuid } from '@/utils/uuid';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * The exercise open in the edit exercise sheet. The sheets the editor opens over itself (Load, and later
 * Rest, Progression and Warm-ups) are routes of their own, so they edit it here by its id rather than
 * through props.
 *
 * The editor that opened it owns it and decides where each change lands through `onChange`: the routine
 * editor writes it straight into the routine, the workout keeps it until the editor is dismissed.
 */
interface ExerciseEdit {
  exercise: ExerciseBlueprint;
  onChange: (exercise: ExerciseBlueprint) => void;
}

type Listener = () => void;

const edits = new Map<string, ExerciseEdit>();
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((listener) => listener());
}

/** Starts an edit under `id`. Returns the function that ends it. */
export function openExerciseEdit(
  id: string,
  exercise: ExerciseBlueprint,
  onChange: (exercise: ExerciseBlueprint) => void,
): () => void {
  edits.set(id, { exercise, onChange });
  notify();
  return () => {
    edits.delete(id);
    notify();
  };
}

export function exerciseEditAt(id: string): ExerciseBlueprint | undefined {
  return edits.get(id)?.exercise;
}

/** Applies `update` to the open edit and hands the result to its owner. Does nothing once it has ended. */
export function updateExerciseEdit(id: string, update: (exercise: ExerciseBlueprint) => ExerciseBlueprint) {
  const edit = edits.get(id);
  if (!edit) {
    return;
  }
  const exercise = update(edit.exercise);
  if (exercise === edit.exercise) {
    return;
  }
  edits.set(id, { ...edit, exercise });
  notify();
  edit.onChange(exercise);
}

/**
 * Opens an edit of `initial` for the editor screen, which owns it for as long as it is mounted. `onChange`
 * is always the newest one passed.
 */
export function useOwnedExerciseEdit(
  initial: ExerciseBlueprint,
  onChange: (exercise: ExerciseBlueprint) => void,
): {
  editId: string;
  exercise: ExerciseBlueprint;
  update: (update: (e: ExerciseBlueprint) => ExerciseBlueprint) => void;
} {
  const [editId] = useState(() => uuid());
  const [opened] = useState(initial);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => openExerciseEdit(editId, opened, (exercise) => latest.current(exercise)), [editId, opened]);
  const exercise = useSyncExternalStore(subscribe, () => edits.get(editId)?.exercise ?? opened);
  return { editId, exercise, update: (update) => updateExerciseEdit(editId, update) };
}

/** The edit a sheet over the editor works on: undefined once the editor has gone. */
export function useExerciseEdit(id: string): ExerciseBlueprint | undefined {
  return useSyncExternalStore(subscribe, () => edits.get(id)?.exercise);
}

import { haptics } from '@/components/presentation/foundation/haptics';
import {
  type NumberPadAccessory,
  type NumberPadField,
  type NumberPadProps,
  numberPadReducer,
  numberPadValue,
  openNumberPad,
  weightAccessoryFor,
} from '@/components/presentation/foundation/number-pad';
import { withRestTimerAt } from '@/components/smart/recorded-exercise-view';
import { equipmentClassOf, weightStepFor } from '@/models/equipment';
import { RecordedExercise, RecordedWeightedExercise, Session } from '@/models/session-models';
import { SetPosition } from '@/models/session-models/recorded-weighted-exercise';
import { Rpe } from '@/models/session-models/rpe';
import {
  SetDrafts,
  SetEntryState,
  SetField,
  SetRow,
  setRowAt,
  withAddedSet,
  withSetLogged,
  withSetRpe,
  withSetToggled,
  withTypedValue,
  weightUnitOf,
} from '@/models/session-models/set-entry';
import { useAppSelector } from '@/store';
import { setLiveWorkoutDrafts } from '@/store/app';
import { selectPreferredWeightUnit } from '@/store/settings';
import { selectExercises } from '@/store/stored-sessions';
import { OffsetDateTime } from '@js-joda/core';
import { useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useReducer, useState } from 'react';
import { useDispatch } from 'react-redux';

type UpdateSession = (update: (session: Session) => Session) => void;
type SetEntryChange = (state: SetEntryState) => SetEntryState;

/** The field the number pad is typing into. */
export interface SetEditing {
  exerciseIndex: number;
  /** The exercise's index and name, so an edit never lands on another exercise that took its place. */
  exerciseKey: string;
  position: SetPosition;
  field: SetField;
}

const NO_DRAFTS: SetDrafts = {};

function liveExerciseKey(exerciseIndex: number, exercise: RecordedExercise): string {
  return `${exerciseIndex}:${exercise.blueprint.name}`;
}

function loggedCount(exercise: RecordedWeightedExercise): number {
  return [...exercise.warmupSets, ...exercise.potentialSets].filter((slot) => slot.set).length;
}

/**
 * One weighted exercise's sets with what was typed into them, and the one way to change both. Shared by the
 * workout screen and the set-type sheet.
 */
export function useSetEntryStore(session: Session, updateSession: UpdateSession) {
  const dispatch = useDispatch();
  const stored = useAppSelector((x) => x.app.liveWorkoutDrafts);

  const stateFor = (exerciseIndex: number): SetEntryState | undefined => {
    const exercise = session.recordedExercises[exerciseIndex];
    if (!(exercise instanceof RecordedWeightedExercise)) {
      return undefined;
    }
    const drafts =
      stored?.sessionId === session.id ? stored.exercises[liveExerciseKey(exerciseIndex, exercise)] : undefined;
    return { exercise, drafts: drafts ?? NO_DRAFTS };
  };

  /**
   * Applies `change` to the exercise as the store holds it, and to its drafts. Logging or undoing a set
   * restarts rest from the latest set, as the old set tiles did.
   */
  const apply = (exerciseIndex: number, change: SetEntryChange): SetEntryState | undefined => {
    const current = stateFor(exerciseIndex);
    if (!current) {
      return undefined;
    }
    const next = change(current);
    if (next.exercise !== current.exercise) {
      updateSession((s) => {
        const exercise = s.recordedExercises[exerciseIndex];
        if (!(exercise instanceof RecordedWeightedExercise)) {
          return s;
        }
        const changed = change({ exercise, drafts: current.drafts }).exercise;
        const updated = s.withExercise(exerciseIndex, changed);
        return loggedCount(changed) === loggedCount(exercise)
          ? updated
          : withRestTimerAt(updated, updated.lastExercise?.lastActivityTime);
      });
      if (loggedCount(next.exercise) > loggedCount(current.exercise)) {
        haptics.setLogged();
      }
    }
    if (next.drafts !== current.drafts) {
      dispatch(
        setLiveWorkoutDrafts({
          sessionId: session.id,
          exerciseKey: liveExerciseKey(exerciseIndex, current.exercise),
          drafts: next.drafts,
        }),
      );
    }
    return next;
  };

  return { stateFor, apply };
}

/**
 * Set logging on the live workout: the field being typed into, the number pad's buffer and props, and the
 * actions on a set row. `pageIndices` are the exercises on screen; typing into one that leaves the page
 * is kept, and the pad closes.
 */
export function useLiveSetEntry(session: Session, updateSession: UpdateSession, pageIndices: readonly number[]) {
  const { stateFor, apply } = useSetEntryStore(session, updateSession);
  const { push } = useRouter();
  const preferredUnit = useAppSelector(selectPreferredWeightUnit);
  const logRpe = useAppSelector((x) => x.settings.logRpe);
  const barWeight = useAppSelector((x) => x.settings.barWeight);
  const availablePlates = useAppSelector((x) => x.settings.availablePlates);
  const catalog = useAppSelector(selectExercises);
  const [stored, setEditing] = useState<SetEditing | undefined>(undefined);
  const [buffer, send] = useReducer(numberPadReducer, { allowDecimal: false, step: 1 }, openNumberPad);

  const storedState = stored && stateFor(stored.exerciseIndex);
  const editedState =
    storedState && liveExerciseKey(stored.exerciseIndex, storedState.exercise) === stored.exerciseKey
      ? storedState
      : undefined;
  const editedRow = stored && editedState ? setRowAt(editedState, stored.position) : undefined;
  const editing = editedRow && pageIndices.includes(stored!.exerciseIndex) ? stored : undefined;

  const equipmentOf = (exercise: RecordedWeightedExercise) =>
    equipmentClassOf(catalog[exercise.blueprint.exerciseId]?.equipment ?? null);

  /** What the buffer holds, typed into the field being edited. */
  const typedInto =
    (edit: SetEditing | undefined): SetEntryChange =>
    (state) => {
      const value = edit && buffer.typed !== null ? numberPadValue(buffer) : undefined;
      return edit && value
        ? withTypedValue(state, edit.position, edit.field, value, weightUnitOf(state.exercise, preferredUnit))
        : state;
    };

  /** Applies `change` after whatever is being typed, in one step when it is the same exercise. */
  const applyAfterTyping = (exerciseIndex: number, change: SetEntryChange) => {
    if (editing && editing.exerciseIndex !== exerciseIndex) {
      apply(editing.exerciseIndex, typedInto(editing));
    }
    const edit = editing?.exerciseIndex === exerciseIndex ? editing : undefined;
    return apply(exerciseIndex, (state) => change(typedInto(edit)(state)));
  };

  const close = () => {
    if (editing) {
      apply(editing.exerciseIndex, typedInto(editing));
    }
    setEditing(undefined);
  };

  // A tile in the strip moves the page on without going through the table, so what was typed is kept here.
  const leftPage = !!stored && !editing;
  const keepTypingAndClose = useEffectEvent(() => {
    if (stored && editedRow) {
      apply(stored.exerciseIndex, typedInto(stored));
    }
    setEditing(undefined);
  });
  useEffect(() => {
    if (leftPage) {
      keepTypingAndClose();
    }
  }, [leftPage]);

  const open = (exerciseIndex: number, position: SetPosition, field: SetField) => {
    const state = applyAfterTyping(exerciseIndex, (s) => s);
    const row = state && setRowAt(state, position);
    if (!state || !row) {
      return;
    }
    setEditing({ exerciseIndex, exerciseKey: liveExerciseKey(exerciseIndex, state.exercise), position, field });
    send({ type: 'reset', field: padFieldFor(state.exercise, row, field) });
  };

  const padFieldFor = (exercise: RecordedWeightedExercise, row: SetRow, field: SetField): NumberPadField =>
    field === 'weight'
      ? {
          placeholder: row.weight.value.value,
          allowDecimal: true,
          step: weightStepFor(
            equipmentOf(exercise),
            weightUnitOf(exercise, preferredUnit),
            exercise.blueprint.weightIncrement,
          ),
        }
      : { placeholder: row.reps.value, allowDecimal: false, step: 1 };

  const toggle = (exerciseIndex: number, position: SetPosition) => {
    const now = OffsetDateTime.now();
    applyAfterTyping(exerciseIndex, (state) => withSetToggled(state, position, now));
    setEditing(undefined);
  };

  const addSet = (exerciseIndex: number) => {
    applyAfterTyping(exerciseIndex, (state) => withAddedSet(state, weightUnitOf(state.exercise, preferredUnit)));
    setEditing(undefined);
  };

  const openSetType = (exerciseIndex: number, position: SetPosition) => {
    close();
    push({
      pathname: '/session/set-type',
      params: { exerciseIndex: String(exerciseIndex), list: position.list, index: String(position.index) },
    });
  };

  const setRpe = (rpe: Rpe | undefined) => {
    if (editing) {
      apply(editing.exerciseIndex, (state) => withSetRpe(state, editing.position, rpe));
    }
  };

  const primary = () => {
    if (!editing) {
      return;
    }
    if (editing.field === 'weight') {
      open(editing.exerciseIndex, editing.position, 'reps');
      return;
    }
    const now = OffsetDateTime.now();
    applyAfterTyping(editing.exerciseIndex, (state) => withSetLogged(state, editing.position, now));
    setEditing(undefined);
  };

  const pad = ((): NumberPadProps => {
    const exercise = editedState?.exercise;
    const unit = exercise ? weightUnitOf(exercise, preferredUnit) : preferredUnit;
    const isWeight = editing?.field === 'weight';
    const accessory: NumberPadAccessory | undefined = !editing
      ? undefined
      : isWeight
        ? exercise?.blueprint.resistance === 'external'
          ? weightAccessoryFor(exercise && equipmentOf(exercise), unit, {
              bar: barWeight[unit],
              plates: availablePlates[unit],
            })
          : undefined
        : logRpe && editing.position.list === 'working'
          ? { kind: 'rpe', value: editedRow?.slot.rpe, onChange: setRpe }
          : undefined;
    return {
      visible: !!editing,
      buffer,
      onAction: send,
      unit: isWeight ? unit : undefined,
      accessory,
      primary: isWeight ? 'next' : 'log',
      onPrimary: primary,
      onHide: close,
    };
  })();

  return { editing, buffer, stateFor, open, toggle, addSet, openSetType, close, pad };
}

export type LiveSetEntry = ReturnType<typeof useLiveSetEntry>;

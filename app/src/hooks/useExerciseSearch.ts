import { RootState, useAppSelector } from '@/store';
import { clearExerciseSearchResult, PickedExercise } from '@/store/app';
import { uuid } from '@/utils/uuid';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Keyboard } from 'react-native';
import { useDispatch, useStore } from 'react-redux';

/** `add` picks any number in tap order; `swap` picks one and closes on the tap. */
export type ExercisePickerMode = 'add' | 'swap';

export interface ExercisePick {
  /** In tap order. */
  exercises: PickedExercise[];
  asSuperset: boolean;
}

/** Where the pick lands, so rows can say "already in Push". */
export interface ExercisePickerContext {
  /** The routine's or workout's name. Empty for one without a name yet. */
  name: string;
  exerciseIds: string[];
}

export interface OpenExercisePicker {
  mode: ExercisePickerMode;
  /** The exercise being swapped out: the search opens on its name when it names one. */
  exerciseName?: string;
  context?: ExercisePickerContext;
}

/** The route params the picker reads back. Kept here so both ends agree on them. */
export type ExercisePickerParams = {
  requestId: string;
  mode?: ExercisePickerMode;
  exerciseName?: string;
  contextName?: string;
  /** JSON array of exercise ids. */
  contextIds?: string;
};

/**
 * Opens the exercise picker route and hands what was picked to `onPick`. The picker is its own route, so its
 * result comes back through the store, tagged with this caller's request id.
 *
 * Pass a fixed `requestId` when the caller that opens the picker may be gone by the time it closes, and
 * another mounted caller with the same id should take the result instead.
 */
export function useExercisePicker(onPick: (pick: ExercisePick) => void, options?: { requestId?: string }) {
  const { push } = useRouter();
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const ownRequestId = useRef(uuid()).current;
  const requestId = options?.requestId ?? ownRequestId;
  const searchResult = useAppSelector((x) => x.app.exerciseSearchResult);

  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (searchResult?.requestId !== requestId) {
      return;
    }
    // Callers sharing a request id all see this render's result; the first clears it, so the rest find it gone.
    if (store.getState().app.exerciseSearchResult !== searchResult) {
      return;
    }
    dispatch(clearExerciseSearchResult());
    onPickRef.current({ exercises: searchResult.exercises, asSuperset: searchResult.asSuperset });
  }, [searchResult, requestId, dispatch, store]);

  return ({ mode, exerciseName, context }: OpenExercisePicker) => {
    Keyboard.dismiss();
    const params: ExercisePickerParams = { requestId, mode, exerciseName: exerciseName ?? '' };
    if (context) {
      params.contextName = context.name;
      params.contextIds = JSON.stringify(context.exerciseIds);
    }
    push({ pathname: '/exercise-search', params });
  };
}

/** Opens the picker to swap one exercise and hands the one picked to `onSelect`. */
export function useExerciseSearch(onSelect: (exercise: PickedExercise) => void, context?: ExercisePickerContext) {
  const open = useExercisePicker((pick) => {
    const [exercise] = pick.exercises;
    if (exercise) {
      onSelect(exercise);
    }
  });
  return (exerciseName: string) => open({ mode: 'swap', exerciseName, context });
}

import { ExerciseDescriptor } from '@/models/exercise-models';
import type { SetDrafts } from '@/models/session-models/set-entry';
import { createAction, createSlice, PayloadAction, UnknownAction } from '@reduxjs/toolkit';

const initialState: AppState = {
  isHydrated: false,
  currentSnackbar: undefined,
  exerciseSearchResult: undefined,
  liveWorkoutFocus: undefined,
  liveWorkoutDrafts: undefined,
};

type AppState = {
  isHydrated: boolean;
  currentSnackbar: SnackbarDescriptor | undefined;
  exerciseSearchResult: ExerciseSearchResult | undefined;
  liveWorkoutFocus: LiveWorkoutFocus | undefined;
  liveWorkoutDrafts: LiveWorkoutDrafts | undefined;
};

// The exercise the live workout shows. Kept here rather than in the screen so it survives minimising the
// workout, and so the "All exercises" sheet, a route of its own, can jump the screen to an exercise.
export type LiveWorkoutFocus = {
  sessionId: string;
  exerciseIndex: number;
};

// What was typed into the live workout's sets that the session doesn't hold (see SetDraft). Kept in memory
// only: it survives minimising and the set-type sheet, and a restart loses nothing but reps never logged.
export type LiveWorkoutDrafts = {
  sessionId: string;
  /** Keyed by the exercise's index and name, so a reordered or swapped exercise never takes another's. */
  exercises: Record<string, SetDrafts>;
};

// The exercise picker is its own route, so it hands its result back through the store rather than a
// callback. The requestId ties a result to the picker's caller, so a result is never applied to a caller
// that did not ask for it.
export type ExerciseSearchResult = {
  requestId: string;
  /** In the order they were tapped. One exercise when the picker was opened to swap. */
  exercises: PickedExercise[];
  asSuperset: boolean;
};

/** An exercise picked from the list, with its id so the blueprint links to it rather than copying the name. */
export interface PickedExercise {
  id: string;
  descriptor: ExerciseDescriptor;
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setIsHydrated(state, action: PayloadAction<boolean>) {
      state.isHydrated = action.payload;
    },

    setCurrentSnackbar(state, action: PayloadAction<SnackbarDescriptor | undefined>) {
      state.currentSnackbar = action.payload;
    },

    setExerciseSearchResult(state, action: PayloadAction<ExerciseSearchResult>) {
      state.exerciseSearchResult = action.payload;
    },

    clearExerciseSearchResult(state) {
      state.exerciseSearchResult = undefined;
    },

    setLiveWorkoutFocus(state, action: PayloadAction<LiveWorkoutFocus>) {
      state.liveWorkoutFocus = action.payload;
    },

    setLiveWorkoutDrafts(state, action: PayloadAction<{ sessionId: string; exerciseKey: string; drafts: SetDrafts }>) {
      const { sessionId, exerciseKey, drafts } = action.payload;
      const exercises = state.liveWorkoutDrafts?.sessionId === sessionId ? state.liveWorkoutDrafts.exercises : {};
      state.liveWorkoutDrafts = { sessionId, exercises: { ...exercises, [exerciseKey]: drafts } };
    },
  },
});

export const initializeAppStateSlice = createAction('initializeAppStateSlice');

export const shareString = createAction<{ title: string; value: string }>('shareString');
export const copyLogs = createAction('copyLogs');

export type SnackbarDescriptor =
  | {
      text: string;
      action?: undefined;
      dispatchAction?: undefined;
      onAction?: undefined;
    }
  | {
      text: string;
      action: string;
      dispatchAction: UnknownAction | UnknownAction[];
      onAction?: undefined;
    }
  | {
      text: string;
      action: string;
      onAction: () => void;
      dispatchAction?: undefined;
    };
export const showSnackbar = createAction<SnackbarDescriptor & { duration?: number }>('snackBarWithAction');

export const {
  setIsHydrated,
  setCurrentSnackbar,
  setExerciseSearchResult,
  clearExerciseSearchResult,
  setLiveWorkoutFocus,
  setLiveWorkoutDrafts,
} = appSlice.actions;

export default appSlice.reducer;

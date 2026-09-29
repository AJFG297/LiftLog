import { ExerciseDescriptor } from '@/models/exercise-models';
import { createAction, createSlice, PayloadAction, UnknownAction } from '@reduxjs/toolkit';

const initialState: AppState = {
  isHydrated: false,
  currentSnackbar: undefined,
  exerciseSearchResult: undefined,
  liveWorkoutFocus: undefined,
};

type AppState = {
  isHydrated: boolean;
  currentSnackbar: SnackbarDescriptor | undefined;
  exerciseSearchResult: ExerciseSearchResult | undefined;
  liveWorkoutFocus: LiveWorkoutFocus | undefined;
};

// The exercise the live workout shows. Kept here rather than in the screen so it survives minimising the
// workout, and so the "All exercises" sheet, a route of its own, can jump the screen to an exercise.
export type LiveWorkoutFocus = {
  sessionId: string;
  exerciseIndex: number;
};

// The exercise search is its own route, so it hands its result back through the store rather than a
// callback. The requestId ties a result to the searcher that opened it, so a result is never applied
// to a searcher that did not ask for it.
export type ExerciseSearchResult = {
  requestId: string;
  exercise: PickedExercise;
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
} = appSlice.actions;

export default appSlice.reducer;

import {
  copyLogs,
  initializeAppStateSlice,
  setCurrentSnackbar,
  setIsHydrated,
  setLiveWorkoutFocus,
  shareString,
  showSnackbar,
} from '@/store/app';
import {
  decodeLiveWorkoutFocus,
  encodeLiveWorkoutFocus,
  LIVE_WORKOUT_FOCUS_KEY,
} from '@/store/app/live-workout-focus-storage';
import { selectActiveSession, setIsHydrated as setStoredSessionsIsHydrated } from '@/store/stored-sessions';
import { AddEffectFn } from '@/store/store';
import { sleep } from '@/utils/sleep';
import { initializeSettingsStateSlice } from '../settings';
import { initializeProgramStateSlice } from '../program';
import { setStringAsync } from 'expo-clipboard';
import { initializeBackendsStateSlice } from '@/store/backends';

export function applyAppEffects(addEffect: AddEffectFn) {
  addEffect(
    initializeAppStateSlice,
    async (_, { cancelActiveListeners, dispatch, extra: { databaseMigrationService } }) => {
      cancelActiveListeners();
      await databaseMigrationService.migrate();
      dispatch(initializeSettingsStateSlice());
      dispatch(initializeProgramStateSlice());
      dispatch(initializeBackendsStateSlice());
      dispatch(setIsHydrated(true));
    },
  );

  // Mirrored to disk so a relaunch reopens the workout, and the in-progress bar, on the page left open.
  addEffect(setLiveWorkoutFocus, async (action, { extra: { keyValueStore } }) => {
    await keyValueStore.setItem(LIVE_WORKOUT_FOCUS_KEY, encodeLiveWorkoutFocus(action.payload));
  });

  addEffect(setStoredSessionsIsHydrated, async (action, { getState, dispatch, extra: { keyValueStore } }) => {
    const session = selectActiveSession(getState());
    if (!action.payload || !session || getState().app.liveWorkoutFocus) {
      return;
    }
    const focus = decodeLiveWorkoutFocus(await keyValueStore.getItem(LIVE_WORKOUT_FOCUS_KEY), session.id);
    // A page picked while the key was being read wins over the stored one.
    if (focus && !getState().app.liveWorkoutFocus) {
      dispatch(setLiveWorkoutFocus(focus));
    }
  });

  addEffect(showSnackbar, async (action, { dispatch, getState }) => {
    dispatch(setCurrentSnackbar(action.payload));
    await sleep(action.payload.duration ?? 5000);
    if (getState().app.currentSnackbar === action.payload) {
      dispatch(setCurrentSnackbar(undefined));
    }
  });

  addEffect(shareString, async (action, { extra: { stringSharer } }) => {
    await stringSharer.share(action.payload.value, action.payload.title);
  });

  addEffect(copyLogs, async (_, { extra: { logger } }) => {
    const logs = await logger.getLogsAsString();
    await setStringAsync(logs);
  });
}

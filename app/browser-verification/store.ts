import { configureStore } from '@reduxjs/toolkit';
// oxlint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { settingsReducer } from '@/store/settings';
import { storedSessionsReducer } from '@/store/stored-sessions';

export const browserStore = configureStore({
  reducer: { settings: settingsReducer, storedSessions: storedSessionsReducer },
  middleware: (defaults) => defaults({ serializableCheck: false, immutableCheck: false }),
});
export type BrowserState = ReturnType<typeof browserStore.getState>;
export const useAppSelector = useSelector.withTypes<BrowserState>();

import { combineReducers, configureStore, createListenerMiddleware, UnknownAction } from '@reduxjs/toolkit';
import type { AddEffectFn, RootState } from '@/store/store';
import type { Services } from '@/services';
import { settingsReducer } from '@/store/settings';
import feedReducer from '@/store/feed';
import programReducer from '@/store/program';
import { statsReducer } from '@/store/stats';
import { storedSessionsReducer } from '@/store/stored-sessions';

/**
 * A real store with the listener middleware, for tests where effects must trigger each other the way they
 * do in the app. `createAddEffectTestBed` doesn't run effects for actions dispatched from inside an effect,
 * so it can't show an ordering bug between two effects. The app's own `createStore` can't be used because
 * it builds every service, and some of those don't load under Vitest.
 *
 * Carries the slices the history, stats and import code reads. Add one if a test needs it.
 */
export function createEffectStore(services: Partial<Services>) {
  const inFlight = new Set<Promise<void>>();
  const listenerMiddleware = createListenerMiddleware({ extra: services as Services });
  const store = configureStore({
    reducer: combineReducers({
      settings: settingsReducer,
      feed: feedReducer,
      program: programReducer,
      stats: statsReducer,
      storedSessions: storedSessionsReducer,
    }),
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }).prepend(listenerMiddleware.middleware),
  });

  // Mirrors `addEffect` in store/store.ts, plus tracking so a test can wait for effects to finish.
  const addEffect = ((
    actionPredicate: { type: string } | { type: string }[] | undefined,
    effect: (action: UnknownAction, api: unknown) => Promise<void> | void,
  ) => {
    listenerMiddleware.startListening({
      predicate: (action) => !actionPredicate || [actionPredicate].flat().some((x) => x.type === action.type),
      effect: (action, listenerApi) => {
        const run = (async () => {
          try {
            await effect(action, {
              ...listenerApi,
              getState: listenerApi.getState as () => RootState,
              onFail: () => {},
              stateBeforeReduce: listenerApi.getOriginalState() as RootState,
              stateAfterReduce: listenerApi.getState() as RootState,
              extra: services,
            });
          } catch (e) {
            services.logger?.error(`Error during effect [${action.type}]:`, e);
          }
        })();
        inFlight.add(run);
        return run.finally(() => inFlight.delete(run));
      },
    });
  }) as AddEffectFn;

  return {
    store,
    addEffect,
    getState: () => store.getState() as unknown as RootState,
    /** Resolves once every effect, including ones started by other effects, has finished. */
    async settle() {
      while (inFlight.size) {
        await Promise.all(inFlight);
      }
    },
  };
}

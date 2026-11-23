import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { type PropsWithChildren, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/en.json';
import { AndroidPreviewRelease, AndroidPreviewRuntime } from '@/models/android-preview-update';
import { setIsHydrated, setLastSeenWhatsNewId, settingsReducer } from '@/store/settings';
import { themeTokens, VERMILION } from '@/utils/theme-tokens';

const mocks = vi.hoisted(() => ({
  appStateListeners: [] as ((state: string) => void)[],
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Linking: { canOpenURL: vi.fn(async () => true), openURL: vi.fn(async () => undefined) },
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.appStateListeners.push(listener);
      return {
        remove: () => {
          const index = mocks.appStateListeners.indexOf(listener);
          if (index >= 0) {
            mocks.appStateListeners.splice(index, 1);
          }
        },
      };
    },
  },
  View: ({ children, testID }: PropsWithChildren<{ testID?: string }>) => <div data-testid={testID}>{children}</div>,
  Pressable: ({
    children,
    testID,
    accessibilityRole,
    accessibilityLabel,
    onPress,
  }: PropsWithChildren<{
    testID?: string;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    onPress?: () => void;
  }>) => (
    <button
      type="button"
      data-testid={testID}
      role={accessibilityRole}
      aria-label={accessibilityLabel}
      onClick={onPress}
    >
      {typeof children === 'function'
        ? (children as (state: { pressed: boolean }) => ReactNode)({ pressed: false })
        : children}
    </button>
  ),
}));

vi.mock('expo-updates', () => ({
  isEnabled: false,
  channel: null,
  runtimeVersion: null,
}));

vi.mock('@/store', async () => ({ useAppSelector: (await import('react-redux')).useSelector }));

vi.mock('@tolgee/react', () => ({
  useTranslate: () => ({
    t: (key: string) => (en as Record<string, string>)[key] ?? key,
  }),
}));

vi.mock('@/hooks/useAppTheme', () => ({
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16 },
  useAppTheme: () => ({
    tokens: themeTokens(VERMILION, 'light'),
  }),
}));

vi.mock('@/components/presentation/foundation/surface-text', () => ({
  SurfaceText: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));

vi.mock('@/components/presentation/foundation/ms-icon-source', () => ({
  MsIconSrc: ({ name }: { name: string }) => <span data-icon={name} />,
}));

import { AndroidPreviewUpdateBanner } from '@/components/smart/android-preview-update-banner';

const OLD_RUNTIME = '018d2892babff82f6f860a7ad49f3c0c497ac12a';
const CURRENT_RUNTIME = 'e19c4e7168192918239da4742146625c20ea01a8';
const UNKNOWN_RUNTIME = '9999999999999999999999999999999999999999';

const RELEASE_V1: AndroidPreviewRelease = {
  schemaVersion: 1,
  releaseId: '2026-11-23-430c8168',
  targetRuntimeVersion: CURRENT_RUNTIME,
  eligibleRuntimeVersions: [OLD_RUNTIME],
  installUrl: 'https://github.com/AJFG297/LiftLog/releases/download/android-preview/liftlog-preview-430c8168.apk',
};

const RELEASE_V2: AndroidPreviewRelease = {
  ...RELEASE_V1,
  releaseId: '2026-12-01-nextbuild',
  installUrl: 'https://github.com/AJFG297/LiftLog/releases/download/android-preview/liftlog-preview-nextbuild.apk',
};

function makeRuntime(
  runtimeVersion: string | null,
  overrides: Partial<AndroidPreviewRuntime> = {},
): AndroidPreviewRuntime {
  return {
    platform: 'android',
    updatesEnabled: true,
    channel: 'preview',
    runtimeVersion,
    ...overrides,
  };
}

function makeStore(options: { isHydrated?: boolean; dismissedReleaseId?: string } = {}) {
  const store = configureStore({
    reducer: { settings: settingsReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  if (options.isHydrated !== false) {
    store.dispatch(setIsHydrated(true));
  }
  if (options.dismissedReleaseId) {
    store.dispatch({
      type: 'settings/setDismissedAndroidPreviewReleaseId',
      payload: options.dismissedReleaseId,
      meta: { prefKey: 'dismissedAndroidPreviewReleaseId' },
    });
  }
  return store;
}

afterEach(() => {
  cleanup();
  mocks.appStateListeners.length = 0;
});

describe('AndroidPreviewUpdateBanner', () => {
  it('shows for an explicitly eligible old Android preview runtime and opens the validated install URL', async () => {
    const store = makeStore();
    const onOpenUrl = vi.fn();
    const fetchRelease = vi.fn(async () => RELEASE_V1);

    const screen = render(
      <Provider store={store}>
        <AndroidPreviewUpdateBanner
          runtime={makeRuntime(OLD_RUNTIME)}
          fetchRelease={fetchRelease}
          onOpenUrl={onOpenUrl}
        />
      </Provider>,
    );

    await screen.findByTestId('android-preview-update-banner');
    expect(screen.getByText('New LiftLog version')).toBeTruthy();
    expect(screen.getByText(/Install it over LiftLog to keep your workouts\./)).toBeTruthy();

    fireEvent.click(screen.getByTestId('android-preview-update-download'));
    expect(onOpenUrl).toHaveBeenCalledWith(RELEASE_V1.installUrl);
  });

  it('persists dismissal independently of What’s New and shows again for a later release', async () => {
    const store = makeStore();
    store.dispatch(setLastSeenWhatsNewId(3));

    const firstRender = render(
      <Provider store={store}>
        <AndroidPreviewUpdateBanner runtime={makeRuntime(OLD_RUNTIME)} fetchRelease={async () => RELEASE_V1} />
      </Provider>,
    );

    await firstRender.findByTestId('android-preview-update-banner');
    fireEvent.click(firstRender.getByTestId('android-preview-update-dismiss'));

    await waitFor(() => {
      expect(firstRender.queryByTestId('android-preview-update-banner')).toBeNull();
    });
    expect(store.getState().settings.dismissedAndroidPreviewReleaseId).toBe(RELEASE_V1.releaseId);
    expect(store.getState().settings.lastSeenWhatsNewId).toBe(3);

    firstRender.unmount();

    // Still hidden for the dismissed release after remounting.
    const sameRelease = render(
      <Provider store={store}>
        <AndroidPreviewUpdateBanner runtime={makeRuntime(OLD_RUNTIME)} fetchRelease={async () => RELEASE_V1} />
      </Provider>,
    );
    await waitFor(() => {
      expect(sameRelease.queryByTestId('android-preview-update-banner')).toBeNull();
    });
    sameRelease.unmount();

    // Shows again when a newer release id is published.
    const laterRelease = render(
      <Provider store={store}>
        <AndroidPreviewUpdateBanner runtime={makeRuntime(OLD_RUNTIME)} fetchRelease={async () => RELEASE_V2} />
      </Provider>,
    );
    await laterRelease.findByTestId('android-preview-update-banner');
  });

  it('does not show for the current runtime, an unknown runtime, or non-preview builds', async () => {
    const store = makeStore();
    const fetchOnCurrent = vi.fn(async () => RELEASE_V1);

    const current = render(
      <Provider store={store}>
        <AndroidPreviewUpdateBanner runtime={makeRuntime(CURRENT_RUNTIME)} fetchRelease={fetchOnCurrent} />
      </Provider>,
    );
    await waitFor(() => expect(fetchOnCurrent).toHaveBeenCalledTimes(1));
    expect(current.queryByTestId('android-preview-update-banner')).toBeNull();
    current.unmount();

    const fetchOnUnknown = vi.fn(async () => RELEASE_V1);
    const unknown = render(
      <Provider store={store}>
        <AndroidPreviewUpdateBanner runtime={makeRuntime(UNKNOWN_RUNTIME)} fetchRelease={fetchOnUnknown} />
      </Provider>,
    );
    await waitFor(() => expect(fetchOnUnknown).toHaveBeenCalledTimes(1));
    expect(unknown.queryByTestId('android-preview-update-banner')).toBeNull();
    unknown.unmount();

    // Dev or non-Android builds skip the network fetch completely.
    const fetchOnDev = vi.fn(async () => RELEASE_V1);
    render(
      <Provider store={store}>
        <AndroidPreviewUpdateBanner
          runtime={makeRuntime(OLD_RUNTIME, { updatesEnabled: false, channel: null })}
          fetchRelease={fetchOnDev}
        />
      </Provider>,
    );
    expect(fetchOnDev).not.toHaveBeenCalled();
  });

  it('stays hidden when offline or malformed, and retries when returning to the foreground', async () => {
    const store = makeStore();
    const fetchRelease = vi
      .fn<(signal: AbortSignal) => Promise<AndroidPreviewRelease | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(RELEASE_V1);

    const screen = render(
      <Provider store={store}>
        <AndroidPreviewUpdateBanner runtime={makeRuntime(OLD_RUNTIME)} fetchRelease={fetchRelease} />
      </Provider>,
    );

    await waitFor(() => expect(fetchRelease).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('android-preview-update-banner')).toBeNull();

    for (const listener of mocks.appStateListeners) {
      listener('active');
    }

    await screen.findByTestId('android-preview-update-banner');
    expect(fetchRelease).toHaveBeenCalledTimes(2);
  });

  it('does not flash before settings hydration completes', async () => {
    const store = makeStore({ isHydrated: false, dismissedReleaseId: RELEASE_V1.releaseId });
    const fetchRelease = vi.fn(async () => RELEASE_V1);

    const screen = render(
      <Provider store={store}>
        <AndroidPreviewUpdateBanner runtime={makeRuntime(OLD_RUNTIME)} fetchRelease={fetchRelease} />
      </Provider>,
    );

    await waitFor(() => expect(fetchRelease).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('android-preview-update-banner')).toBeNull();

    store.dispatch(setIsHydrated(true));
    await waitFor(() => {
      expect(screen.queryByTestId('android-preview-update-banner')).toBeNull();
    });
  });
});

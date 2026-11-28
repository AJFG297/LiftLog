import {
  ANDROID_PREVIEW_RELEASE_URL,
  AndroidPreviewRelease,
  AndroidPreviewRuntime,
  parseAndroidPreviewRelease,
} from '@/models/android-preview-update';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

const FETCH_TIMEOUT_MS = 8000;

export function currentAndroidPreviewRuntime(): AndroidPreviewRuntime {
  if (__DEV__) {
    const simulatedRuntime = process.env.EXPO_PUBLIC_PREVIEW_UPDATE_SIMULATE_RUNTIME?.trim();
    if (simulatedRuntime) {
      return {
        platform: 'android',
        updatesEnabled: true,
        channel: 'preview',
        runtimeVersion: simulatedRuntime,
      };
    }
  }

  return {
    platform: Platform.OS,
    updatesEnabled: Updates.isEnabled,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
  };
}

export interface FetchAndroidPreviewReleaseOptions {
  url?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Fetches and validates the Android preview release manifest. Never throws: network, timeout,
 * HTTP, JSON, or schema failures all resolve to `undefined` so startup stays responsive.
 */
export async function fetchAndroidPreviewRelease(
  options: FetchAndroidPreviewReleaseOptions = {},
): Promise<AndroidPreviewRelease | undefined> {
  const defaultUrl =
    __DEV__ && process.env.EXPO_PUBLIC_PREVIEW_UPDATE_URL?.trim()
      ? process.env.EXPO_PUBLIC_PREVIEW_UPDATE_URL.trim()
      : ANDROID_PREVIEW_RELEASE_URL;
  const url = options.url ?? defaultUrl;
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;

  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      return undefined;
    }
    options.signal.addEventListener('abort', onParentAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      cache: 'no-cache',
      signal: controller.signal,
    });
    if (!response.ok) {
      return undefined;
    }
    const json: unknown = await response.json();
    return parseAndroidPreviewRelease(json);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onParentAbort);
  }
}

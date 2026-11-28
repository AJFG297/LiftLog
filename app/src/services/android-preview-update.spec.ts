import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-updates', () => ({
  isEnabled: false,
  channel: null,
  runtimeVersion: null,
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

import { fetchAndroidPreviewRelease } from '@/services/android-preview-update';

const VALID_PAYLOAD = {
  schemaVersion: 1,
  releaseId: '2026-11-23-430c8168',
  targetRuntimeVersion: 'e19c4e7168192918239da4742146625c20ea01a8',
  eligibleRuntimeVersions: ['018d2892babff82f6f860a7ad49f3c0c497ac12a'],
  installUrl: 'https://github.com/AJFG297/LiftLog/releases/download/android-preview/liftlog-preview-430c8168.apk',
};

describe('fetchAndroidPreviewRelease', () => {
  it('returns the validated release on a 200 JSON response', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify(VALID_PAYLOAD), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch;

    const release = await fetchAndroidPreviewRelease({
      url: 'https://example.com/release.json',
      fetchFn,
    });

    expect(release).toEqual(VALID_PAYLOAD);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://example.com/release.json',
      expect.objectContaining({ method: 'GET', cache: 'no-cache' }),
    );
  });

  it('treats non-200 HTTP responses, network errors, malformed JSON, and invalid schemas as no offer', async () => {
    const notFound = vi.fn(async () => new Response('missing', { status: 404 })) as unknown as typeof fetch;
    expect(await fetchAndroidPreviewRelease({ fetchFn: notFound })).toBeUndefined();

    const offline = vi.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    expect(await fetchAndroidPreviewRelease({ fetchFn: offline })).toBeUndefined();

    const badJson = vi.fn(async () => new Response('{not json', { status: 200 })) as unknown as typeof fetch;
    expect(await fetchAndroidPreviewRelease({ fetchFn: badJson })).toBeUndefined();

    const invalidSchema = vi.fn(
      async () => new Response(JSON.stringify({ ...VALID_PAYLOAD, installUrl: 'http://insecure.example/a.apk' })),
    ) as unknown as typeof fetch;
    expect(await fetchAndroidPreviewRelease({ fetchFn: invalidSchema })).toBeUndefined();
  });

  it('aborts cleanly when timed out or cancelled by the caller', async () => {
    const stalled = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    ) as unknown as typeof fetch;

    expect(await fetchAndroidPreviewRelease({ fetchFn: stalled, timeoutMs: 10 })).toBeUndefined();

    const controller = new AbortController();
    controller.abort();
    expect(await fetchAndroidPreviewRelease({ fetchFn: stalled, signal: controller.signal })).toBeUndefined();
  });
});

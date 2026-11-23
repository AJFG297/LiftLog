import { describe, expect, it } from 'vitest';
import {
  ANDROID_PREVIEW_RELEASE_SCHEMA_VERSION,
  AndroidPreviewRuntime,
  isAndroidPreviewRuntime,
  parseAndroidPreviewRelease,
  parseHttpsInstallUrl,
  resolveAndroidPreviewUpdateOffer,
} from '@/models/android-preview-update';

const OLD_RUNTIME = '018d2892babff82f6f860a7ad49f3c0c497ac12a';
const CURRENT_RUNTIME = 'e19c4e7168192918239da4742146625c20ea01a8';
const UNKNOWN_RUNTIME = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const VALID_RAW_RELEASE = {
  schemaVersion: ANDROID_PREVIEW_RELEASE_SCHEMA_VERSION,
  releaseId: '2026-11-23-430c8168',
  targetRuntimeVersion: CURRENT_RUNTIME,
  eligibleRuntimeVersions: [OLD_RUNTIME],
  installUrl: 'https://github.com/AJFG297/LiftLog/releases/download/android-preview/liftlog-preview-430c8168.apk',
};

const previewRuntime = (runtimeVersion: string | null | undefined): AndroidPreviewRuntime => ({
  platform: 'android',
  updatesEnabled: true,
  channel: 'preview',
  runtimeVersion,
});

describe('parseHttpsInstallUrl', () => {
  it('accepts plain HTTPS URLs', () => {
    expect(parseHttpsInstallUrl(VALID_RAW_RELEASE.installUrl)).toBe(VALID_RAW_RELEASE.installUrl);
  });

  it('rejects non-HTTPS schemes, credentials, whitespace, and malformed values', () => {
    expect(parseHttpsInstallUrl('http://github.com/AJFG297/LiftLog/releases/download/a/b.apk')).toBeUndefined();
    expect(parseHttpsInstallUrl('javascript:alert(1)')).toBeUndefined();
    expect(parseHttpsInstallUrl('intent://scan/#Intent;end')).toBeUndefined();
    expect(parseHttpsInstallUrl('https://user:pass@example.com/app.apk')).toBeUndefined();
    expect(parseHttpsInstallUrl('https://@example.com/app.apk')).toBeUndefined();
    expect(parseHttpsInstallUrl('https://example.com/app with space.apk')).toBeUndefined();
    expect(parseHttpsInstallUrl(` ${VALID_RAW_RELEASE.installUrl} `)).toBeUndefined();
    expect(parseHttpsInstallUrl('not a url')).toBeUndefined();
    expect(parseHttpsInstallUrl('')).toBeUndefined();
    expect(parseHttpsInstallUrl(42)).toBeUndefined();
  });
});

describe('parseAndroidPreviewRelease', () => {
  it('parses a valid release manifest and deduplicates runtimes', () => {
    const parsed = parseAndroidPreviewRelease({
      ...VALID_RAW_RELEASE,
      eligibleRuntimeVersions: [OLD_RUNTIME, OLD_RUNTIME],
    });
    expect(parsed).toEqual({
      schemaVersion: 1,
      releaseId: '2026-11-23-430c8168',
      targetRuntimeVersion: CURRENT_RUNTIME,
      eligibleRuntimeVersions: [OLD_RUNTIME],
      installUrl: VALID_RAW_RELEASE.installUrl,
    });
  });

  it('accepts manifests without an optional targetRuntimeVersion', () => {
    const { targetRuntimeVersion: _, ...withoutTarget } = VALID_RAW_RELEASE;
    expect(parseAndroidPreviewRelease(withoutTarget)).toEqual({
      schemaVersion: 1,
      releaseId: '2026-11-23-430c8168',
      eligibleRuntimeVersions: [OLD_RUNTIME],
      installUrl: VALID_RAW_RELEASE.installUrl,
    });
  });

  it('rejects malformed manifests, unknown schema versions, empty lists, and non-HTTPS links', () => {
    expect(parseAndroidPreviewRelease(null)).toBeUndefined();
    expect(parseAndroidPreviewRelease([])).toBeUndefined();
    expect(parseAndroidPreviewRelease({ ...VALID_RAW_RELEASE, schemaVersion: 2 })).toBeUndefined();
    expect(parseAndroidPreviewRelease({ ...VALID_RAW_RELEASE, releaseId: '  ' })).toBeUndefined();
    expect(parseAndroidPreviewRelease({ ...VALID_RAW_RELEASE, targetRuntimeVersion: '' })).toBeUndefined();
    expect(parseAndroidPreviewRelease({ ...VALID_RAW_RELEASE, eligibleRuntimeVersions: [] })).toBeUndefined();
    expect(parseAndroidPreviewRelease({ ...VALID_RAW_RELEASE, eligibleRuntimeVersions: [''] })).toBeUndefined();
    expect(
      parseAndroidPreviewRelease({ ...VALID_RAW_RELEASE, installUrl: 'http://example.com/a.apk' }),
    ).toBeUndefined();
  });
});

describe('isAndroidPreviewRuntime', () => {
  it('accepts standalone Android preview builds with a runtime version', () => {
    expect(isAndroidPreviewRuntime(previewRuntime(OLD_RUNTIME))).toBe(true);
  });

  it('rejects iOS, disabled updates, non-preview channels, and missing runtime versions', () => {
    expect(isAndroidPreviewRuntime({ ...previewRuntime(OLD_RUNTIME), platform: 'ios' })).toBe(false);
    expect(isAndroidPreviewRuntime({ ...previewRuntime(OLD_RUNTIME), updatesEnabled: false })).toBe(false);
    expect(isAndroidPreviewRuntime({ ...previewRuntime(OLD_RUNTIME), channel: 'development' })).toBe(false);
    expect(isAndroidPreviewRuntime({ ...previewRuntime(OLD_RUNTIME), channel: null })).toBe(false);
    expect(isAndroidPreviewRuntime(previewRuntime(null))).toBe(false);
    expect(isAndroidPreviewRuntime(previewRuntime(''))).toBe(false);
  });
});

describe('resolveAndroidPreviewUpdateOffer', () => {
  const release = parseAndroidPreviewRelease(VALID_RAW_RELEASE)!;

  it('offers the update to an explicitly eligible older runtime', () => {
    expect(
      resolveAndroidPreviewUpdateOffer({
        runtime: previewRuntime(OLD_RUNTIME),
        release,
        dismissedReleaseId: undefined,
      }),
    ).toEqual({
      releaseId: release.releaseId,
      installUrl: release.installUrl,
    });
  });

  it('does not offer the update to the current runtime or an unknown runtime', () => {
    expect(
      resolveAndroidPreviewUpdateOffer({
        runtime: previewRuntime(CURRENT_RUNTIME),
        release,
        dismissedReleaseId: undefined,
      }),
    ).toBeUndefined();

    expect(
      resolveAndroidPreviewUpdateOffer({
        runtime: previewRuntime(UNKNOWN_RUNTIME),
        release,
        dismissedReleaseId: undefined,
      }),
    ).toBeUndefined();
  });

  it('never offers when the installed runtime matches targetRuntimeVersion even if mislisted', () => {
    const misconfigured = parseAndroidPreviewRelease({
      ...VALID_RAW_RELEASE,
      eligibleRuntimeVersions: [OLD_RUNTIME, CURRENT_RUNTIME],
    })!;
    expect(
      resolveAndroidPreviewUpdateOffer({
        runtime: previewRuntime(CURRENT_RUNTIME),
        release: misconfigured,
        dismissedReleaseId: undefined,
      }),
    ).toBeUndefined();
  });

  it('respects dismissal for the offered release and shows again for a later release', () => {
    expect(
      resolveAndroidPreviewUpdateOffer({
        runtime: previewRuntime(OLD_RUNTIME),
        release,
        dismissedReleaseId: release.releaseId,
      }),
    ).toBeUndefined();

    const laterRelease = parseAndroidPreviewRelease({
      ...VALID_RAW_RELEASE,
      releaseId: '2026-12-01-nextbuild',
    })!;
    expect(
      resolveAndroidPreviewUpdateOffer({
        runtime: previewRuntime(OLD_RUNTIME),
        release: laterRelease,
        dismissedReleaseId: release.releaseId,
      }),
    ).toEqual({
      releaseId: '2026-12-01-nextbuild',
      installUrl: laterRelease.installUrl,
    });
  });
});

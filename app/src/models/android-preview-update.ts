/**
 * Pure model and validation for in-app Android preview APK update offers.
 *
 * Fingerprint hashes have no ordering and EAS preview builds pin Android's versionCode to 1,
 * so the release manifest explicitly lists which older Android preview runtimes should be
 * prompted to install the newer signed APK.
 */

export const ANDROID_PREVIEW_RELEASE_URL =
  'https://github.com/AJFG297/LiftLog/releases/download/android-preview/android-preview-release.json';

export const ANDROID_PREVIEW_RELEASE_SCHEMA_VERSION = 1;

export interface AndroidPreviewRelease {
  schemaVersion: typeof ANDROID_PREVIEW_RELEASE_SCHEMA_VERSION;
  releaseId: string;
  targetRuntimeVersion?: string;
  eligibleRuntimeVersions: readonly string[];
  installUrl: string;
}

export interface AndroidPreviewRuntime {
  platform: string;
  updatesEnabled: boolean;
  channel: string | null | undefined;
  runtimeVersion: string | null | undefined;
}

export interface AndroidPreviewUpdateOffer {
  releaseId: string;
  installUrl: string;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const SAFE_HTTPS_URL_RE = /^https:\/\/[a-zA-Z0-9.-]+(?::\d{1,5})?(?:[/?#]\S*)?$/;

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/** Accepts only plain HTTPS URLs without whitespace, control characters, or embedded credentials. */
export function parseHttpsInstallUrl(value: unknown): string | undefined {
  const raw = asNonEmptyString(value);
  if (!raw || raw !== value || hasControlChar(raw) || !SAFE_HTTPS_URL_RE.test(raw)) {
    return undefined;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol.toLowerCase() !== 'https:' || parsed.hostname.length === 0) {
      return undefined;
    }
    if (parsed.username !== '' || parsed.password !== '') {
      return undefined;
    }
    return raw;
  } catch {
    return undefined;
  }
}

export function parseAndroidPreviewRelease(raw: unknown): AndroidPreviewRelease | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== ANDROID_PREVIEW_RELEASE_SCHEMA_VERSION) {
    return undefined;
  }

  const releaseId = asNonEmptyString(record.releaseId);
  if (!releaseId) {
    return undefined;
  }

  let targetRuntimeVersion: string | undefined;
  if (record.targetRuntimeVersion !== undefined) {
    targetRuntimeVersion = asNonEmptyString(record.targetRuntimeVersion);
    if (!targetRuntimeVersion) {
      return undefined;
    }
  }

  if (!Array.isArray(record.eligibleRuntimeVersions) || record.eligibleRuntimeVersions.length === 0) {
    return undefined;
  }

  const eligibleRuntimeVersions: string[] = [];
  for (const entry of record.eligibleRuntimeVersions) {
    const runtime = asNonEmptyString(entry);
    if (!runtime) {
      return undefined;
    }
    if (!eligibleRuntimeVersions.includes(runtime)) {
      eligibleRuntimeVersions.push(runtime);
    }
  }

  const installUrl = parseHttpsInstallUrl(record.installUrl);
  if (!installUrl) {
    return undefined;
  }

  return {
    schemaVersion: ANDROID_PREVIEW_RELEASE_SCHEMA_VERSION,
    releaseId,
    ...(targetRuntimeVersion ? { targetRuntimeVersion } : {}),
    eligibleRuntimeVersions,
    installUrl,
  };
}

export function isAndroidPreviewRuntime(
  runtime: AndroidPreviewRuntime,
): runtime is AndroidPreviewRuntime & { runtimeVersion: string } {
  return (
    runtime.platform === 'android' &&
    runtime.updatesEnabled === true &&
    runtime.channel === 'preview' &&
    asNonEmptyString(runtime.runtimeVersion) !== undefined
  );
}

export function resolveAndroidPreviewUpdateOffer(input: {
  runtime: AndroidPreviewRuntime;
  release: AndroidPreviewRelease | undefined;
  dismissedReleaseId: string | undefined;
}): AndroidPreviewUpdateOffer | undefined {
  if (!isAndroidPreviewRuntime(input.runtime) || !input.release) {
    return undefined;
  }

  const installedRuntime = input.runtime.runtimeVersion.trim();
  if (input.release.targetRuntimeVersion && input.release.targetRuntimeVersion === installedRuntime) {
    return undefined;
  }

  if (!input.release.eligibleRuntimeVersions.includes(installedRuntime)) {
    return undefined;
  }

  if (input.dismissedReleaseId === input.release.releaseId) {
    return undefined;
  }

  return {
    releaseId: input.release.releaseId,
    installUrl: input.release.installUrl,
  };
}

#!/usr/bin/env node
/**
 * Mirrors an EAS-signed Android preview APK to the durable `android-preview` GitHub prerelease
 * and updates `android-preview-release.json` so older Android preview installs show the in-app
 * update banner.
 *
 * Expo credentials remain in `eas-cli` (this script reads EAS build metadata via `eas-cli` and
 * publishes only the already-signed APK + public manifest via `gh`).
 *
 * Usage:
 *   node scripts/publish-android-preview-release.mjs \
 *     --build-id <eas-build-id> \
 *     --eligible <runtime1,runtime2> \
 *     [--release-id <id>] \
 *     [--repo AJFG297/LiftLog] \
 *     [--tag android-preview] \
 *     [--dry-run]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function parseArgs(argv) {
  const args = { repo: 'AJFG297/LiftLog', tag: 'android-preview', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--dry-run') {
      args.dryRun = true;
    } else if (flag === '--build-id') {
      args.buildId = argv[++i];
    } else if (flag === '--eligible') {
      args.eligible = argv[++i];
    } else if (flag === '--release-id') {
      args.releaseId = argv[++i];
    } else if (flag === '--repo') {
      args.repo = argv[++i];
    } else if (flag === '--tag') {
      args.tag = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!args.buildId) {
    throw new Error('Missing --build-id <eas-build-id>');
  }
  if (!args.eligible) {
    throw new Error('Missing --eligible <comma-separated-runtime-versions>');
  }
  return args;
}

function run(cmd, cmdArgs, options = {}) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const appDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../app');

  const rawBuild = run('npx', ['eas-cli', 'build:view', args.buildId, '--json'], { cwd: appDir });
  const build = JSON.parse(rawBuild);

  if (build.platform !== 'ANDROID' || build.status !== 'FINISHED') {
    throw new Error(`Expected a FINISHED ANDROID build, got platform=${build.platform} status=${build.status}`);
  }
  const apkUrl = build.artifacts?.buildUrl ?? build.artifacts?.applicationArchiveUrl;
  const targetRuntimeVersion = build.runtime?.version ?? build.fingerprint?.hash;
  if (!apkUrl || !targetRuntimeVersion) {
    throw new Error('EAS build metadata is missing the APK URL or runtime version');
  }

  const eligibleRuntimeVersions = args.eligible
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (eligibleRuntimeVersions.length === 0) {
    throw new Error('--eligible must contain at least one runtime version');
  }
  if (eligibleRuntimeVersions.includes(targetRuntimeVersion)) {
    throw new Error(`Target runtime ${targetRuntimeVersion} must not be listed in --eligible`);
  }

  const shortCommit = (build.gitCommitHash ?? args.buildId).slice(0, 8);
  const datePart = (build.createdAt ?? new Date().toISOString()).slice(0, 10);
  const releaseId = args.releaseId ?? `${datePart}-${shortCommit}`;
  const apkFileName = `liftlog-preview-${shortCommit}.apk`;
  const installUrl = `https://github.com/${args.repo}/releases/download/${args.tag}/${apkFileName}`;

  const manifest = {
    schemaVersion: 1,
    releaseId,
    targetRuntimeVersion,
    eligibleRuntimeVersions,
    installUrl,
    publishedAt: new Date().toISOString(),
    easBuildId: build.id,
  };

  console.log('Prepared Android preview release manifest:');
  console.log(JSON.stringify(manifest, null, 2));

  if (args.dryRun) {
    console.log('Dry run complete; nothing uploaded.');
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'liftlog-preview-release-'));
  try {
    const apkPath = path.join(tmpDir, apkFileName);
    const manifestPath = path.join(tmpDir, 'android-preview-release.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    console.log(`Downloading signed APK from EAS (${apkUrl})...`);
    run('curl', ['-fsSL', '-o', apkPath, apkUrl]);

    const releaseExists = (() => {
      try {
        run('gh', ['release', 'view', args.tag, '-R', args.repo]);
        return true;
      } catch {
        return false;
      }
    })();

    const notes = [
      'Durable hosting for the latest EAS-signed Android preview APK and in-app update manifest.',
      '',
      `- Release ID: \`${releaseId}\``,
      `- Target runtime: \`${targetRuntimeVersion}\``,
      `- EAS build: \`${build.id}\``,
      '',
      'Install the APK over the existing LiftLog app without uninstalling to keep your workouts.',
    ].join('\n');

    if (!releaseExists) {
      run('gh', [
        'release',
        'create',
        args.tag,
        apkPath,
        manifestPath,
        '-R',
        args.repo,
        '--prerelease',
        '--title',
        'Android preview',
        '--notes',
        notes,
      ]);
    } else {
      run('gh', ['release', 'upload', args.tag, apkPath, manifestPath, '-R', args.repo, '--clobber']);
      run('gh', ['release', 'edit', args.tag, '-R', args.repo, '--notes', notes]);
    }

    console.log(`Published ${installUrl}`);
    console.log(`Manifest: https://github.com/${args.repo}/releases/download/${args.tag}/android-preview-release.json`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();

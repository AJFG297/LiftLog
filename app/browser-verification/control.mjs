#!/usr/bin/env node
import { parsePendingState, parseActiveState, parseIdentity, hasCode } from './contracts.mjs';
import { build } from 'esbuild';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, open, rm, readdir, symlink, lstat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import registry from './viewports.json' with { type: 'json' };

const directory = dirname(fileURLToPath(import.meta.url));
const checkout = resolve(directory, '../..');
const app = resolve(directory, '..');
const evidenceRoot = resolve(checkout, '.verify-runs/browser');
const statePath = resolve(evidenceRoot, 'state.json');
async function sourceDigest() {
  const hash = createHash('sha256');
  hash.update(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout }));
  /** @param {string} path */
  async function visit(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else {
        hash.update(file.slice(checkout.length));
        hash.update(await readFile(file));
      }
    }
  }
  await visit(resolve(app, 'src'));
  await visit(directory);
  hash.update(await readFile(resolve(app, 'package-lock.json')));
  hash.update(await readFile(resolve(app, 'package.json')));
  return hash.digest('hex');
}
async function readState() {
  const state = parsePendingState(JSON.parse(await readFile(statePath, 'utf8')));
  if (
    state.checkout !== checkout ||
    /[/\\]/.test(state.runId) ||
    state.runDirectory !== resolve(evidenceRoot, state.runId)
  )
    throw new Error('Verification state belongs to a different directory');
  if ((await lstat(state.runDirectory)).isSymbolicLink())
    throw new Error('Verification run directory cannot be a symlink');
  return state;
}
/** @param {import('./contracts.mjs').ActiveState} state */
async function identityOf(state) {
  const response = await fetch(`${state.url}/api/identity`, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error('Identity endpoint failed');
  const identity = parseIdentity(await response.json());
  if (identity.pid !== state.pid || identity.runId !== state.runId || identity.checkout !== checkout)
    throw new Error('Verification instance ownership mismatch');
  return identity;
}
async function doctor() {
  const state = parseActiveState(await readState());
  const identity = await identityOf(parseActiveState(state));
  process.kill(state.pid, 0);
  if (identity.source !== (await sourceDigest())) throw new Error('Source changed since launch. Run down then up.');
  const workout = await fetch(`${state.url}/api/workout`);
  if (!workout.ok) throw new Error('Workout cannot be loaded');
  console.log(JSON.stringify({ healthy: true, ...identity }));
  return identity;
}
/** @param {import('./contracts.mjs').PendingState} state */
function ownsProcess(state) {
  if (!state.pid) return false;
  try {
    const command = execFileSync('ps', ['-p', String(state.pid), '-o', 'args='], {
      encoding: 'utf8',
    });
    return command.trim() === `${process.execPath} ${resolve(state.runDirectory, 'server.mjs')}`;
  } catch {
    return false;
  }
}
async function down() {
  let state;
  try {
    state = await readState();
  } catch (/** @type {unknown} */ error) {
    if (hasCode(error, 'ENOENT')) return;
    throw error;
  }
  if (state.pid && ownsProcess(state)) {
    process.kill(state.pid, 'SIGTERM');
    for (let attempt = 0; attempt < 50 && ownsProcess(state); attempt++) await delay(100);
    if (state.pid && ownsProcess(state)) {
      process.kill(state.pid, 'SIGKILL');
      await delay(100);
    }
  }
  await rm(resolve(state.runDirectory, 'node_modules'), { force: true });
  await rm(statePath, { force: true });
  console.log(JSON.stringify({ stopped: true, evidence: state.runDirectory }));
}
/** @param {import('./contracts.mjs').PendingState} [previous] @returns {Promise<import('./contracts.mjs').ActiveState>} */
async function up(previous) {
  await mkdir(evidenceRoot, { recursive: true });
  const claim = await open(statePath, 'wx').catch((/** @type {unknown} */ error) => {
    if (hasCode(error, 'EEXIST')) throw new Error('This checkout already has a browser instance. Use doctor or down.');
    throw error;
  });
  const runId = previous?.runId ?? `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const runDirectory = previous?.runDirectory ?? resolve(evidenceRoot, runId);
  /** @type {import('./contracts.mjs').PendingState} */
  const state = { runId, runDirectory, checkout };
  try {
    await mkdir(runDirectory, { recursive: true });
    await symlink(resolve(app, 'node_modules'), resolve(runDirectory, 'node_modules'), 'dir').catch((error) => {
      if (!hasCode(error, 'EEXIST')) throw error;
    });
    await claim.writeFile(JSON.stringify(state));
    await claim.close();
    await build({
      entryPoints: [resolve(directory, 'server.ts')],
      outfile: resolve(runDirectory, 'server.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      alias: {
        '@': resolve(app, 'src'),
        'expo-localization': resolve(directory, 'adapters/localization.ts'),
      },
    });
    const source = await sourceDigest();
    const log = await open(resolve(runDirectory, 'server.log'), 'a');
    const child = spawn(process.execPath, [resolve(runDirectory, 'server.mjs')], {
      cwd: app,
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
      env: {
        ...process.env,
        VERIFY_BROWSER_RUN_DIR: runDirectory,
        VERIFY_BROWSER_RUN_ID: runId,
        VERIFY_BROWSER_CHECKOUT: checkout,
        VERIFY_BROWSER_SOURCE: source,
      },
    });
    await log.close();
    if (!child.pid) throw new Error('Server did not start');
    state.pid = child.pid;
    await writeFile(statePath, JSON.stringify(state, null, 2));
    child.unref();
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        const identity = parseIdentity(JSON.parse(await readFile(resolve(runDirectory, 'identity.json'), 'utf8')));
        if (identity.pid === child.pid) {
          state.url = identity.url;
          await writeFile(statePath, JSON.stringify(state, null, 2));
          await identityOf(parseActiveState(state));
          console.log(JSON.stringify({ ready: true, ...state }));
          return parseActiveState(state);
        }
      } catch {}
      if (!ownsProcess(state)) throw new Error(`Server exited. Read ${resolve(runDirectory, 'server.log')}`);
      await delay(200);
    }
    throw new Error(`Server readiness timed out. Read ${resolve(runDirectory, 'server.log')}`);
  } catch (/** @type {unknown} */ error) {
    await claim.close().catch(() => {});
    await down();
    throw error;
  }
}
async function restart() {
  const state = await readState();
  await doctor();
  await down();
  return up(state);
}

const command = process.argv[2] ?? 'help';
try {
  if (command === 'up') await up();
  else if (command === 'doctor') await doctor();
  else if (command === 'down') await down();
  else if (command === 'restart') await restart();
  else if (command === 'test' || command === 'drive') {
    const presets = [registry.default, ...registry.additional];
    const presetId = process.argv[4];
    const selected = presetId === undefined ? undefined : presets.find((preset) => preset.id === presetId);
    if (presetId !== undefined && !selected) throw new Error(`Unknown viewport: ${presetId}`);
    const owned = command === 'test';
    const targets = selected ? [selected] : owned ? presets : [registry.default];
    const { drive } = await import('./drive.mjs');
    for (const preset of targets) {
      let state;
      try {
        state = owned ? await up() : parseActiveState(await readState());
        await doctor();
        await drive({ state, restart, scenario: process.argv[3] ?? 'all', preset });
      } finally {
        if (owned && state) await down();
      }
    }
  } else if (command === 'help')
    console.log(
      'control.mjs up | doctor | drive [workout|themes|sets|all] [regular|large] | restart | down | test [workout|themes|sets|all] [regular|large]',
    );
  else throw new Error(`Unknown command: ${command}`);
} catch (/** @type {unknown} */ error) {
  console.error(String(error));
  process.exitCode = 1;
}

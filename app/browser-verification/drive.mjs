#!/usr/bin/env node
import { parseEvidence, parseIdentity } from './contracts.mjs';
import { chromium, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import registry from './viewports.json' with { type: 'json' };

/** @param {{state: import('./contracts.mjs').ActiveState, restart: () => Promise<import('./contracts.mjs').ActiveState>, scenario: string, preset: typeof registry.default}} options */
export async function drive({ state, restart, scenario, preset }) {
  if (!['workout', 'themes', 'sets', 'all'].includes(scenario)) throw new Error(`Unknown scenario: ${scenario}`);
  const evidence = resolve(state.runDirectory, `drive-${preset.id}-${Date.now()}`);
  await mkdir(evidence);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: {
      width: 800,
      height: Math.max(registry.default.height, ...registry.additional.map((item) => item.height)) + 200,
    },
    locale: 'en-US',
    reducedMotion: 'reduce',
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  const app = page.frameLocator('iframe[title="Workout preview"]');
  const preview = page.locator('iframe[title="Workout preview"]');
  const presets = [registry.default, ...registry.additional];
  const url = () => `${state.url}/?viewport=${preset.id}`;
  let writes = 0;
  let frameNavigations = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/workout') writes++;
  });
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) frameNavigations++;
  });
  const actions = [];
  const errors = [];
  const manifest = {
    scenario,
    viewport: preset,
    checkout: state.checkout,
    source: parseIdentity(await (await fetch(`${state.url}/api/identity`)).json()).source,
    runId: state.runId,
    actions,
    errors,
    result: 'running',
  };
  page.on('pageerror', (error) => errors.push(String(error)));
  /** @param {string} name */
  const shot = async (name) => {
    await assertLayout(preset);
    await preview.screenshot({
      path: resolve(evidence, `${name}.png`),
      animations: 'disabled',
    });
    await writeFile(resolve(evidence, `${name}.aria.txt`), await app.locator('body').ariaSnapshot());
    actions.push({ screenshot: `${name}.png`, url: page.url() });
  };
  const saved = () => expect(app.getByText('Workout saved', { exact: true })).toBeVisible({ timeout: 30000 });
  /** @param {string} label */
  const sql = async (label) => {
    const response = await fetch(`${state.url}/api/evidence`);
    if (!response.ok) throw new Error(`SQL evidence request failed: ${await response.text()}`);
    const value = parseEvidence(await response.json());
    await writeFile(resolve(evidence, `${label}.db.json`), JSON.stringify(value, null, 2));
    return value;
  };
  /** @param {string|RegExp} name */
  async function press(name) {
    actions.push({ action: 'click', role: 'button', name: String(name) });
    await app.getByRole('button', { name, exact: typeof name === 'string' }).click();
  }
  /** @param {typeof registry.default} size @param {string|RegExp} [activeField] */
  async function assertLayout(size, activeField) {
    await expect
      .poll(() => app.locator('body').evaluate(() => ({ width: innerWidth, height: innerHeight })))
      .toEqual({
        width: size.width,
        height: size.height,
      });
    await expect(app.locator('.phone-shell')).toHaveCSS('height', `${size.height}px`);
    const geometry = await app.locator('.phone-shell').evaluate((shell) => {
      const content = document.querySelector('.workout-content');
      const pad = document.querySelector('.keypad-container');
      /** @param {Element} element */
      const bounds = (element) => {
        const rectangle = element.getBoundingClientRect();
        return {
          top: rectangle.top,
          bottom: rectangle.bottom,
          left: rectangle.left,
          right: rectangle.right,
          height: rectangle.height,
        };
      };
      return {
        shell: bounds(shell),
        content: content && bounds(content),
        pad: pad && bounds(pad),
        documentHeight: document.documentElement.scrollHeight,
      };
    });
    expect(geometry.shell).toMatchObject({ top: 0, bottom: size.height, left: 0, right: size.width });
    expect(geometry.documentHeight).toEqual(size.height);
    if (await app.getByRole('button', { name: 'Hide keypad', exact: true }).isVisible()) {
      expect(geometry.pad).toBeTruthy();
      expect(geometry.pad.height).toBeGreaterThan(0);
      expect(geometry.pad.top).toBeGreaterThanOrEqual(0);
      expect(geometry.pad.bottom).toBeLessThanOrEqual(size.height);
      const hide = await app.getByRole('button', { name: 'Hide keypad', exact: true }).evaluate((element) => {
        const rectangle = element.getBoundingClientRect();
        return { top: rectangle.top, bottom: rectangle.bottom };
      });
      expect(hide).toBeTruthy();
      expect(hide.top).toBeGreaterThanOrEqual(0);
      expect(hide.bottom).toBeLessThanOrEqual(size.height);
    }
    if (activeField) {
      await expect
        .poll(async () => {
          const box = await app.getByRole('button', { name: activeField }).evaluate((element) => {
            const rectangle = element.getBoundingClientRect();
            return { top: rectangle.top, bottom: rectangle.bottom };
          });
          return box.top >= geometry.content.top && box.bottom <= geometry.content.bottom;
        })
        .toBe(true);
    }
    actions.push({ action: 'layout', viewport: size, geometry });
  }
  /** @param {typeof registry.default} size @param {string|RegExp} activeField */
  async function switchViewport(size, activeField) {
    const name = `${size.label} ${size.width} × ${size.height}`;
    actions.push({ action: 'viewport', viewport: size });
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(preview).toHaveAttribute('src', '/workout.html');
    await assertLayout(size, activeField);
  }
  try {
    await page.goto(state.url);
    await saved();
    await expect(
      page.getByRole('button', {
        name: `${registry.default.label} ${registry.default.width} × ${registry.default.height}`,
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await assertLayout(registry.default);
    await page.getByRole('button', { name: `${preset.label} ${preset.width} × ${preset.height}`, exact: true }).click();
    await assertLayout(preset);
    await app.locator('body').evaluate(() => document.fonts.ready);
    await shot('initial');
    if (scenario === 'workout' || scenario === 'all') {
      const before = await sql('before');
      expect(before.weightedSets).toHaveLength(2);
      expect(before.weightedSets[0].completed_at).toBeNull();
      await press(/^Weight for Set 1:/);
      for (const key of ['8', '2', 'Decimal point', '5']) await press(key);
      await shot('weight-input');
      await press('Hide keypad');
      await press(/^Reps for Set 1:/);
      await press('7');
      await shot('reps-input');
      await press('Log set');
      await expect(app.getByRole('button', { name: 'Undo Set 1', exact: true })).toBeVisible();
      await saved();
      await shot('logged');
      const logged = await sql('logged');
      expect(logged.weightedSets[0]).toMatchObject({
        reps: 7,
        weight_value: '82.5',
        weight_unit: 'kilograms',
      });
      expect(logged.weightedSets[0].completed_at).toBeTruthy();
      await page.reload();
      await saved();
      await expect(app.getByRole('button', { name: /^Weight for Set 1: 82.5/ })).toBeVisible();
      await expect(app.getByRole('button', { name: /^Reps for Set 1: 7/ })).toBeVisible();
      await expect(app.getByRole('button', { name: 'Undo Set 1', exact: true })).toBeVisible();
      await shot('reloaded');
      await page.goto('about:blank');
      state = await restart();
      await page.goto(url());
      await saved();
      await expect(app.getByRole('button', { name: 'Undo Set 1', exact: true })).toBeVisible();
      const restarted = await sql('server-restarted');
      expect(restarted.weightedSets[0]).toMatchObject({ reps: 7, weight_value: '82.5' });
      await shot('server-restarted');
      await press('Undo Set 1');
      await saved();
      await page.reload();
      await saved();
      await expect(app.getByRole('button', { name: 'Log Set 1', exact: true })).toBeVisible();
      const undone = await sql('undone');
      expect(undone.weightedSets[0]).toMatchObject({
        reps: null,
        completed_at: null,
        weight_value: '82.5',
      });
      await shot('undone');
    }
    if (scenario === 'themes' || scenario === 'all') {
      const before = await sql('before-themes');
      await press(/^Weight for Set 1:/);
      await press('Light');
      await expect(app.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');
      const palette = async () => ({
        background: await app.locator('main').evaluate((element) => getComputedStyle(element).backgroundColor),
        accent: await app.locator('.eyebrow').evaluate((element) => getComputedStyle(element).color),
      });
      const light = await palette();
      await shot('light');
      await press('Dark');
      await expect(app.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(app.locator('main')).toHaveCSS('background-color', 'rgb(18, 17, 16)');
      const dark = await palette();
      expect(dark.background).not.toEqual(light.background);
      await shot('dark');
      await press('Blue accent');
      await expect(app.getByRole('button', { name: 'Blue accent', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect.poll(async () => (await palette()).accent).not.toEqual(dark.accent);
      const darkBlue = await palette();
      expect(darkBlue.accent).not.toEqual(dark.accent);
      await shot('dark-blue');
      await press('Light');
      await expect(app.locator('main')).toHaveCSS('background-color', light.background);
      await expect.poll(async () => (await palette()).accent).not.toEqual(light.accent);
      const lightBlue = await palette();
      expect(lightBlue.background).toEqual(light.background);
      expect(lightBlue.accent).not.toEqual(light.accent);
      await shot('light-blue');
      await writeFile(
        resolve(evidence, 'palettes.json'),
        JSON.stringify({ light, dark, darkBlue, lightBlue }, null, 2),
      );
      await press('Hide keypad');
      const after = await sql('after-themes');
      expect(after.weightedSets).toEqual(before.weightedSets);
    }
    if (scenario === 'sets' || scenario === 'all') {
      const before = await sql('before-add-set');
      await press('Add set');
      await saved();
      await page.reload();
      await saved();
      const after = await sql('after-add-set');
      expect(after.weightedSets).toHaveLength(before.weightedSets.length + 1);
      await expect(
        app.getByRole('button', { name: `Log Set ${after.weightedSets.length}`, exact: true }),
      ).toBeVisible();
      await shot('added-set');
    }
    await press(/^Reps for Set 2:/);
    await press('6');
    await press('Hide keypad');
    await saved();
    await press(/^Weight for Set 1:/);
    for (const key of ['8', '2', 'Decimal point']) await press(key);
    await press('Dark');
    await press('Blue accent');
    const weightField = app.getByRole('button', { name: /^Weight for Set 1:/ });
    await expect(weightField).toHaveText('82.');
    await expect(weightField).toHaveCSS('border-top-width', '2px');
    const beforeResize = await sql('before-resize');
    const writesBeforeResize = writes;
    const navigationsBeforeResize = frameNavigations;
    for (const other of presets.filter((item) => item.id !== preset.id)) {
      await switchViewport(other, /^Weight for Set 1:/);
      await expect(weightField).toHaveText('82.');
      await expect(weightField).toHaveCSS('border-top-width', '2px');
      await expect(app.getByRole('button', { name: /^Reps for Set 2: 6$/ })).toHaveText('6');
      await expect(app.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(app.getByRole('button', { name: 'Blue accent', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(app.locator('main')).toHaveCSS('background-color', 'rgb(18, 17, 16)');
      await preview.screenshot({ path: resolve(evidence, `resize-${other.id}.png`), animations: 'disabled' });
    }
    await switchViewport(preset, /^Weight for Set 1:/);
    await expect(weightField).toHaveText('82.');
    await expect(weightField).toHaveCSS('border-top-width', '2px');
    await expect(app.getByRole('button', { name: /^Reps for Set 2: 6$/ })).toHaveText('6');
    await expect(app.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(app.getByRole('button', { name: 'Blue accent', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const afterResize = await sql('after-resize');
    expect(afterResize.weightedSets).toEqual(beforeResize.weightedSets);
    expect(writes).toEqual(writesBeforeResize);
    expect(frameNavigations).toEqual(navigationsBeforeResize);
    await shot('resize-preserved');
    await press('5');
    await press('Hide keypad');
    await saved();
    await expect(app.getByRole('button', { name: /^Weight for Set 1: 82.5/ })).toBeVisible();
    await press(/^Reps for Set 2: 6$/);
    await press('7');
    await press('Log set');
    await saved();
    const afterResizeLog = await sql('after-resize-log');
    expect(afterResizeLog.weightedSets[1].reps).toEqual(7);
    expect(afterResizeLog.weightedSets[1].completed_at).toBeTruthy();
    await shot('resize-logged');

    let count = afterResizeLog.weightedSets.length;
    while (count < 16) {
      await press('Add set');
      await saved();
      count++;
    }
    const lastField = new RegExp(`^Weight for Set ${count}:`);
    await press(lastField);
    await assertLayout(preset, lastField);
    const overflow = await app.locator('.workout-content').evaluate((content) => ({
      scrollHeight: content.scrollHeight,
      clientHeight: content.clientHeight,
      scrollTop: content.scrollTop,
      overflowY: getComputedStyle(content).overflowY,
    }));
    expect(overflow.overflowY).toEqual('auto');
    expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);
    expect(overflow.scrollTop).toBeGreaterThan(0);
    actions.push({ action: 'overflow', viewport: preset, geometry: overflow });
    await shot('overflow-keypad');
    await press('Hide keypad');
    await saved();
    expect(errors).toEqual([]);
    manifest.result = 'pass';
  } catch (/** @type {unknown} */ error) {
    manifest.result = 'fail';
    manifest.failure = String(error);
    await preview.screenshot({ path: resolve(evidence, 'failure.png'), animations: 'disabled' }).catch(() => {});
    await writeFile(resolve(evidence, 'failure.aria.txt'), await app.locator('body').ariaSnapshot()).catch(() => {});
    throw error;
  } finally {
    await writeFile(resolve(evidence, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await context.tracing.stop({ path: resolve(evidence, 'trace.zip') });
    await browser.close();
    console.log(JSON.stringify({ result: manifest.result, scenario, viewport: preset, evidence }));
  }
}

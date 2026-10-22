import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEvidence, parseIdentity, parseWorkoutNames } from './contracts.mjs';

/** @param {{state: import('./contracts.mjs').ActiveState, restart: () => Promise<import('./contracts.mjs').ActiveState>, scenario: string, preset: {id: string, label: string, width: number, height: number}}} options */
export async function drive({ state, restart, scenario, preset }) {
  const evidence = resolve(state.runDirectory, `drive-reorder-${preset.id}-${Date.now()}`);
  await mkdir(evidence);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 800, height: 1132 },
    hasTouch: true,
    locale: 'en-US',
    reducedMotion: 'reduce',
    recordVideo: { dir: evidence, size: { width: 800, height: 1132 } },
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage().catch(async (error) => {
    await context.close();
    await browser.close();
    throw error;
  });
  const app = page.frameLocator('iframe[title="Workout preview"]');
  const preview = page.locator('iframe[title="Workout preview"]');
  const strip = app.getByTestId('exercise-strip');
  const actions = [];
  const errors = [];
  const geometry = [];
  const manifest = {
    scenario,
    viewport: preset,
    checkout: state.checkout,
    source: parseIdentity(await (await fetch(`${state.url}/api/identity`)).json()).source,
    runId: state.runId,
    actions,
    errors,
    geometry,
    result: 'running',
  };
  page.on('pageerror', (error) => errors.push(String(error)));
  const saved = () => expect(app.getByText('Workout saved', { exact: true })).toBeVisible({ timeout: 30000 });
  const names = async () => parseWorkoutNames(await (await fetch(`${state.url}/api/workout`)).json());
  const offset = () => strip.evaluate((element) => element.scrollLeft);
  const cdp = await context.newCDPSession(page);
  /** @param {'touchStart'|'touchMove'|'touchEnd'|'touchCancel'} type @param {number} [x] @param {number} [y] */
  async function touch(type, x = 0, y = 0) {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }],
    });
  }
  /** @param {string} label */
  async function shot(label) {
    await preview.screenshot({ path: resolve(evidence, `${label}.png`), animations: 'disabled' });
    await writeFile(resolve(evidence, `${label}.aria.txt`), await app.locator('body').ariaSnapshot());
    actions.push({ screenshot: label });
  }
  /** @param {string} label */
  async function sql(label) {
    const value = parseEvidence(await (await fetch(`${state.url}/api/evidence`)).json());
    await writeFile(resolve(evidence, `${label}.db.json`), JSON.stringify(value, null, 2));
    expect(value.exercises.map((exercise) => exercise.name)).toEqual(await names());
    return value;
  }
  /** @param {string|RegExp} name */
  async function press(name) {
    await app.getByRole('button', { name, exact: typeof name === 'string' }).click();
    actions.push({ action: 'click', name: String(name) });
  }
  /** @param {number} left */
  async function placeViewport(left) {
    let previous = -1;
    let stable = 0;
    await expect
      .poll(
        async () => {
          const current = await offset();
          stable = current === previous ? stable + 1 : 0;
          previous = current;
          return stable;
        },
        { intervals: [100], timeout: 5000 },
      )
      .toBeGreaterThanOrEqual(3);
    await strip.evaluate((element, x) => {
      element.scrollLeft = x;
    }, left);
    await page.waitForTimeout(250);
    actions.push({ setup: 'viewport placement', left: await offset(), featureProof: false });
  }
  /** @param {import('@playwright/test').Locator} tile @param {'touch'|'mouse'} [input] */
  async function hold(tile, input = 'touch') {
    const box = await tile.boundingBox();
    const view = await strip.boundingBox();
    const x = Math.max(view.x + 15, Math.min(view.x + view.width - 15, box.x + box.width / 2));
    const y = box.y + box.height / 2;
    const maxOffset = await strip.evaluate((element) => element.scrollWidth - element.clientWidth);
    if (input === 'touch') await touch('touchStart', x, y);
    else {
      await page.mouse.move(x, y);
      await page.mouse.down();
    }
    await page.waitForTimeout(450);
    const group = tile.locator('..');
    await expect.poll(() => group.evaluate((element) => element.style.zIndex)).toBe('1');
    actions.push({ action: 'long press', input, x, y });
    return { x, y, grab: x - box.x, tile, input, maxOffset };
  }
  /** @param {Awaited<ReturnType<typeof hold>>} held @param {number} x */
  async function move(held, x) {
    for (let step = 1; step <= 12; step++) {
      const next = held.x + ((x - held.x) * step) / 12;
      if (held.input === 'touch') await touch('touchMove', next, held.y);
      else await page.mouse.move(next, held.y);
      await page.waitForTimeout(16);
    }
    held.x = x;
  }
  /** @param {Awaited<ReturnType<typeof hold>>} held @param {'left'|'right'} edge */
  async function edgeScroll(held, edge) {
    const view = await strip.boundingBox();
    const x = edge === 'right' ? view.x + view.width - 12 : view.x + 12;
    await move(held, x);
    const frame = await preview.boundingBox();
    const samples = [];
    for (let index = 0; index < 3; index++) {
      const sample = await held.tile.evaluate(async (element) => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const rect = element.getBoundingClientRect();
        const viewport = element.closest('[data-testid="exercise-strip"]');
        if (!viewport) throw new Error('Held tile has no scroll viewport');
        return { left: rect.left, width: rect.width, offset: viewport.scrollLeft };
      });
      samples.push({ ...sample, left: sample.left + frame.x, pointerX: x, grabbedOffset: held.grab });
      if (index < 2) await page.waitForTimeout(180);
    }
    geometry.push({ edge, maxOffsetBeforeHold: held.maxOffset, samples });
    const [first, second, third] = samples.map((sample) => sample.offset);
    expect(edge === 'right' ? second > first && third > second : second < first && third < second).toBe(true);
    for (const sample of samples) {
      expect(x).toBeGreaterThan(sample.left);
      expect(x).toBeLessThan(sample.left + sample.width);
    }
    await shot(`${edge}-edge-held`);
    await expect
      .poll(
        async () => {
          const metrics = await strip.evaluate((element) => ({
            offset: element.scrollLeft,
            max: element.scrollWidth - element.clientWidth,
          }));
          return edge === 'right' ? Math.abs(metrics.offset - held.maxOffset) < 1 : metrics.offset < 1;
        },
        { timeout: 8000 },
      )
      .toBe(true);
    await expect
      .poll(async () => {
        const settled = await held.tile.boundingBox();
        return Math.abs(settled.x + held.grab - x);
      })
      .toBeLessThan(5);
    actions.push({ action: 'stationary edge scroll', edge, heldTileTracksPointer: true });
  }
  /** @param {Awaited<ReturnType<typeof hold>>} held @param {boolean} [cancel] */
  async function release(held, cancel = false) {
    if (held.input === 'touch') await touch(cancel ? 'touchCancel' : 'touchEnd');
    else await page.mouse.up();
    await page.waitForTimeout(180);
    await saved();
    actions.push({ action: cancel ? 'cancel drag' : 'drop', input: held.input });
  }
  try {
    const setup = await fetch(`${state.url}/api/fixture/reorder`, { method: 'POST' });
    if (!setup.ok) throw new Error('Reorder fixture setup failed');
    actions.push({ setup: 'reorder fixture', featureProof: false });
    await page.goto(`${state.url}/?viewport=${preset.id}`);
    await saved();
    await app.locator('body').evaluate(() => document.fonts.ready);
    await expect
      .poll(() => app.locator('body').evaluate(() => ({ width: innerWidth, height: innerHeight })))
      .toEqual({ width: preset.width, height: preset.height });
    const original = await names();
    expect(original).toHaveLength(10);
    await shot('initial-light');
    await press('Dark');
    await shot('initial-dark');
    await press('Blue accent');
    await shot('initial-dark-blue');
    await press('Light');
    await shot('initial-light-blue');
    await press(/^Back Squat,/);
    await expect(app.getByRole('heading', { name: 'Back Squat', exact: true })).toBeVisible();
    await press(/^Barbell Bench Press,/);
    await expect(app.getByRole('heading', { name: 'Barbell Bench Press', exact: true })).toBeVisible();
    await expect.poll(offset).toBe(0);
    await page.waitForTimeout(500);
    const view = await strip.boundingBox();
    const y = view.y + view.height / 2;
    await touch('touchStart', view.x + view.width - 30, y);
    for (let step = 1; step <= 8; step++) {
      await touch('touchMove', view.x + view.width - 30 - step * 25, y);
      await page.waitForTimeout(12);
    }
    await touch('touchEnd');
    await expect.poll(offset).toBeGreaterThan(50);
    expect(await names()).toEqual(original);
    actions.push({ action: 'ordinary touch swipe before hold', offset: await offset(), orderUnchanged: true });
    await placeViewport(0);
    await expect.poll(offset).toBe(0);
    await touch('touchStart', view.x + 60, y);
    await touch('touchMove', view.x + 62, y);
    await page.waitForTimeout(120);
    await expect(app.getByTestId('strip-group-0')).toHaveCSS('z-index', '0');
    await touch('touchEnd');
    expect(await names()).toEqual(original);
    actions.push({ action: 'tiny jitter then early release', orderUnchanged: true });
    await press(/^Reps for Set 1:/);
    await press('7');
    const bench = app.getByRole('button', { name: /^Barbell Bench Press,/ });
    const right = await hold(bench);
    await shot('activated-touch');
    await edgeScroll(right, 'right');
    await release(right);
    expect(await names()).toEqual([...original.slice(1), original[0]]);
    await expect(app.getByRole('heading', { name: 'Barbell Bench Press', exact: true })).toBeVisible();
    await expect(app.getByRole('button', { name: /^Reps for Set 1: 7/ })).toBeVisible();
    await shot('far-drop-focus-and-draft');
    await press('Log Set 1');
    await saved();
    const farSql = await sql('far-drop');
    expect(farSql.weightedSets.at(-2).reps).toBe(7);
    const left = await hold(bench);
    await edgeScroll(left, 'left');
    await release(left);
    expect(await names()).toEqual(original);
    await expect(app.getByRole('heading', { name: 'Barbell Bench Press', exact: true })).toBeVisible();
    const cancelled = await hold(bench);
    await move(cancelled, view.x + view.width - 30);
    await release(cancelled, true);
    expect(await names()).toEqual(original);
    await shot('cancelled');
    await placeViewport(0);
    await expect.poll(offset).toBe(0);
    const noop = await hold(bench);
    await release(noop);
    expect(await names()).toEqual(original);
    await placeViewport(600);
    const curl = app.getByRole('button', { name: /^Biceps Curl,/ });
    const superset = await hold(curl);
    await edgeScroll(superset, 'left');
    await release(superset);
    expect(await names()).toEqual(['Lateral Raise', 'Biceps Curl', ...original.slice(0, 5), ...original.slice(7)]);
    const superSql = await sql('superset-drop');
    expect(superSql.exercises[0].superset).toBe(1);
    expect(superSql.exercises[1].superset).toBe(0);
    await shot('superset-drop');
    const mouse = await hold(curl, 'mouse');
    await move(mouse, mouse.x + 100);
    await release(mouse);
    const finalOrder = [
      'Barbell Bench Press',
      'Lateral Raise',
      'Biceps Curl',
      ...original.slice(1, 5),
      ...original.slice(7),
    ];
    expect(await names()).toEqual(finalOrder);
    await shot('mouse-drop');
    await press('Dark');
    const darkHold = await hold(bench);
    await shot('activated-dark');
    await release(darkHold);
    expect(await names()).toEqual(finalOrder);
    await page.reload();
    await saved();
    expect(await names()).toEqual(finalOrder);
    await expect(app.getByRole('button', { name: 'Undo Set 1', exact: true })).toBeVisible();
    await sql('reloaded');
    await shot('reloaded');
    await page.goto('about:blank');
    state = await restart();
    await page.goto(`${state.url}/?viewport=${preset.id}`);
    await saved();
    expect(await names()).toEqual(finalOrder);
    const restarted = await sql('server-restarted');
    expect(restarted.weightedSets[0].reps).toBe(7);
    await shot('server-restarted');
    expect(errors).toEqual([]);
    manifest.result = 'pass';
    console.log(JSON.stringify({ result: 'pass', scenario, viewport: preset, evidence }));
  } catch (error) {
    manifest.result = 'fail';
    manifest.failure = String(error);
    await shot('failure').catch(() => {});
    throw error;
  } finally {
    await context.tracing.stop({ path: resolve(evidence, 'trace.zip') });
    await context.close();
    await browser.close();
    await writeFile(resolve(evidence, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }
}

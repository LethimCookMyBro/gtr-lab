/** Focused production-app material proof. No QA scene or mocked vehicle source. */
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'vehicle-material-results';
const baseUrl = process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:4176';
const expectedModelHash = 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
  commit: process.env.GITHUB_SHA,
  baseUrl,
  scope: 'Actual built configurator; existing unchanged licensed GLB; production camera and lamp controls. No cabin or six-model completion claim.',
  expectedModelHash,
  result: 'running',
  views: [],
  errors: [],
};
await mkdir(output, { recursive: true });
const save = () => writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
const server = process.env.PREVIEW_BASE_URL ? null : spawn(process.execPath, ['server.mjs'], {
  env: { ...process.env, PORT: '4176' }, stdio: 'inherit',
});
let browser;
try {
  let started = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await fetch(baseUrl).then(response => response.ok).catch(() => false)) { started = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(started, 'Production app responds');
  browser = await chromium.launch({ args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
    '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
  ] });
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({
      viewport, deviceScaleFactor: 1, reducedMotion: 'reduce',
      ...(name === 'mobile' ? { isMobile: true, hasTouch: true } : {}),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const view = { name, viewport, frames: [], errors: [], warnings: [] };
    report.views.push(view);
    page.on('pageerror', error => view.errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') view.errors.push(message.text());
      if (message.type() === 'warning') view.warnings.push(message.text());
    });
    try {
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/models/ciasny-r35.glb', { timeout: 90_000 });
      await page.goto(`${baseUrl}/configurator/premium`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const response = await responsePromise;
      assert.equal(response.status(), 200, 'Published model responds successfully');
      const modelBytes = await response.body();
      view.model = { bytes: modelBytes.length, sha256: hash(modelBytes) };
      assert.equal(view.model.sha256, expectedModelHash, 'Runtime uses the unchanged licensed GLB');
      await expect(page.getByRole('button', { name: 'Ultimate Silver', exact: true })).toBeEnabled({ timeout: 90_000 });
      await expect(page.locator('.scene-loading, .scene-notice, .render-error')).toHaveCount(0);
      const canvas = page.locator('.scene-stage canvas');
      view.webgl = await canvas.evaluate(element => {
        const gl = element.getContext('webgl2') || element.getContext('webgl');
        if (!gl || gl.isContextLost()) return null;
        return { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER) };
      });
      assert.ok(view.webgl, 'An actual live WebGL context exists');
      const lights = page.getByRole('button', { name: 'Lights', exact: true });
      await expect(lights).toHaveAttribute('aria-pressed', 'false');
      const selectCamera = async preset => {
        await page.getByRole('button', { name: 'Camera', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: preset, exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
      };
      const capture = async (label, lamps) => {
        // Locator screenshots include overlapping controls. Normalize pointer state
        // so an OFF comparison cannot measure a hovered Lights button instead.
        await page.mouse.move(0, 0);
        await expect(lights).toHaveAttribute('aria-pressed', String(lamps));
        await page.waitForFunction(() => {
          const element = document.querySelector('.scene-stage canvas');
          return element && Math.abs(element.width / element.clientWidth - Math.min(devicePixelRatio, 1.75)) < .02;
        }, {}, { timeout: 30_000 });
        await page.evaluate(() => new Promise(resolve => {
          let count = 8;
          const frame = () => --count ? requestAnimationFrame(frame) : resolve();
          requestAnimationFrame(frame);
        }));
        const png = await canvas.screenshot({ path: `${output}/${name}-${label}-canvas.png`, animations: 'disabled', timeout: 60_000 });
        await page.screenshot({ path: `${output}/${name}-${label}-page.png`, animations: 'disabled', scale: 'css', timeout: 60_000 });
        const frame = { label, lamps, canvasSha256: hash(png), canvas: await canvas.evaluate(element => ({ width: element.width, height: element.height, cssWidth: element.clientWidth, cssHeight: element.clientHeight })) };
        view.frames.push(frame); await save();
        return frame;
      };
      await selectCamera('Rear');
      const off = await capture('rear-off', false);
      await lights.click();
      const on = await capture('rear-on', true);
      await lights.click();
      const restored = await capture('rear-off-restored', false);
      assert.notEqual(on.canvasSha256, off.canvasSha256, 'Lamp toggle changes the actual rear pixels');
      assert.equal(restored.canvasSha256, off.canvasSha256, 'OFF/ON/OFF restores exact rear pixels');
      view.offOnOff = 'passed';
      if (name === 'desktop') {
        await selectCamera('Wheel detail');
        await capture('wheel', false);
        await selectCamera('Front ¾');
        await capture('front-quarter', false);
        await selectCamera('Rear ¾');
        await capture('rear-quarter', false);
      }
      assert.deepEqual(view.errors, [], 'No console or page errors');
      view.result = 'passed';
    } catch (error) { view.result = 'failed'; view.errors.push(String(error)); }
    await save();
    console.log(`[materials] ${name}: ${view.result}; ${view.frames.length} frames`);
    await context.close();
  }
  assert.ok(report.views.every(view => view.result === 'passed'), 'Every viewport passes');
  report.result = 'passed';
} catch (error) { report.result = 'failed'; report.errors.push(String(error)); process.exitCode = 1; }
finally { await save(); await browser?.close(); server?.kill('SIGTERM'); }
console.log(JSON.stringify(report, null, 2));

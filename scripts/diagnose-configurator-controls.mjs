/** Real, production-bundle control audit. Uses only the already-published licensed asset. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = process.env.CONTROLS_OUTPUT || 'configurator-controls-results';
const baseURL = process.env.CONTROLS_URL || 'http://127.0.0.1:4178';
await mkdir(directory, { recursive: true });
const server = process.env.CONTROLS_URL ? null : spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: '4178' }, stdio: 'inherit' });
const report = { commit: process.env.GITHUB_SHA, baseURL, captureMode: 'Reduced motion for deterministic rendered-state audit. Rotation is explicitly exercised with normal motion.', browsers: [], failures: [] };
const save = () => writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
let browser;
try {
  for (let n = 0; n < 100; n++) { if (await fetch(baseURL).then(r => r.ok).catch(() => false)) break; await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', ...(name === 'mobile' ? { isMobile: true, hasTouch: true } : {}) });
    await context.addInitScript(() => {
      window.__audioStarts = 0;
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (...args) { window.__audioStarts++; return start.apply(this, args); };
    });
    const page = await context.newPage(); page.setDefaultTimeout(45000);
    const result = { name, viewport, controls: [], errors: [], warnings: [] }; report.browsers.push(result);
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); if (message.type() === 'warning') result.warnings.push(message.text()); });
    const canvas = page.locator('.scene-stage canvas');
    const shot = async label => {
      // Match the established vehicle suite: deterministic static pixel readback.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => {
        const canvas = document.querySelector('.scene-stage canvas');
        return canvas && Math.abs(canvas.width / canvas.clientWidth - Math.min(devicePixelRatio, 1.75)) < 0.02;
      }, {}, { timeout: 15000 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const bytes = await canvas.screenshot({ path: `${directory}/${name}-${label}.png`, timeout: 45000 });
      return createHash('sha256').update(bytes).digest('hex');
    };
    const pause = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const check = async (label, action) => {
      const row = { control: label };
      result.controls.push(row);
      try { Object.assign(row, await action()); row.passed = true; }
      catch (error) { row.passed = false; row.error = String(error); report.failures.push(`${name}: ${label}: ${error.message}`); await page.screenshot({ path: `${directory}/${name}-failure-${result.controls.length}.png`, timeout: 45000 }).catch(() => {}); }
      console.log(JSON.stringify(row)); await save();
    };
    const open = async label => { await page.getByRole('button', { name: label, exact: true }).click(); await page.getByRole('dialog').waitFor(); };
    const close = async () => { await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' }); };
    const chooseCamera = async label => { await open('Camera'); await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await pause(); };
    try {
      await page.goto(baseURL + '/configurator/premium', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => { const button = document.querySelector('button[aria-label="Ultimate Silver"]'); return !!button && !button.disabled; }, {}, { timeout: 90000 });
      assert.equal(await canvas.count(), 1); await pause();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.screenshot({ path: `${directory}/${name}-initial-page.png`, timeout: 45000 });
      for (const label of ['Camera', 'Environment', 'Model detail', 'Switch model', 'Model provenance & limitations', 'Asset information']) {
        await check(`${label} opens and closes`, async () => {
          if (label === 'Asset information' && !await page.getByRole('button', { name: label, exact: true }).isVisible()) return { responsive: 'hidden redundant footer shortcut', equivalent: 'Model provenance & limitations opens the same disclosure' };
          await open(label); const text = await page.getByRole('dialog').innerText();
          await page.getByRole('dialog').getByRole('button', { name: 'Close panel', exact: true }).click();
          await page.getByRole('dialog').waitFor({ state: 'hidden' });
          assert.equal(await page.getByRole('button', { name: label, exact: true }).evaluate(el => document.activeElement === el), true);
          return { dialogText: text.slice(0, 600), focusReturned: true };
        });
      }
      let cameraPixels = await shot('camera-start');
      for (const label of ['Front', 'Side', 'Rear ¾', 'Rear', 'Wheel detail', 'Top detail', 'Front ¾']) {
        await check(`Camera ${label}`, async () => { const before = cameraPixels; await chooseCamera(label); const after = await shot('camera-after-' + result.controls.length); assert.notEqual(after, before); cameraPixels = after; return { before, after, pixelsChanged: true }; });
      }
      await check('Reselect the same camera after manual exploration', async () => {
        await chooseCamera('Front ¾'); const canonical = await shot('camera-canonical');
        await canvas.focus(); await canvas.press('ArrowLeft'); await pause(); const manual = await shot('camera-manual'); assert.notEqual(manual, canonical);
        await chooseCamera('Front ¾'); const restored = await shot('camera-reselected');
        assert.equal(restored, canonical, 'Reselecting a camera must restore its exact canonical perspective after manual orbit');
        return { canonical, manual, restored, pixelsChanged: true };
      });
      await check('Unavailable interior explains the asset limitation', async () => { await open('Camera'); const interior = page.getByRole('dialog').getByRole('button', { name: /Interior/ }); assert.equal(await interior.isDisabled(), true); const text = await interior.innerText(); assert.match(text, /cabin required|unavailable/i); await page.screenshot({ path: `${directory}/${name}-interior-unavailable.png` }); await close(); return { disabled: true, explanation: text }; });
      let paintPixels = await shot('paint-start');
      for (const label of ['Gun Metallic', 'Pearl White', 'Jet Black', 'Vibrant Red', 'Deep Blue', 'Stealth Gray', 'Midnight Violet', 'Dark Metal Gray', 'Ultimate Silver']) {
        await check(`Paint ${label}`, async () => { const before = paintPixels; const button = page.getByRole('button', { name: label, exact: true }); await button.scrollIntoViewIfNeeded(); await button.click(); await pause(); assert.equal(await button.getAttribute('aria-pressed'), 'true'); const after = await shot('paint-after-' + result.controls.length); assert.notEqual(after, before); paintPixels = after; return { pressed: true, pixelsChanged: true, before, after }; });
      }
      await chooseCamera('Front');
      await check('Lights on and off', async () => { const button = page.getByRole('button', { name: 'Lights', exact: true }); const off = await shot('lights-off'); await button.click(); await pause(); const on = await shot('lights-on'); assert.equal(await button.getAttribute('aria-pressed'), 'true'); assert.notEqual(on, off); await button.click(); await pause(); assert.equal(await button.getAttribute('aria-pressed'), 'false'); return { off, on, pixelsChanged: true }; });
      await chooseCamera('Rear');
      await check('Rear lamp rings on and off', async () => { const button = page.getByRole('button', { name: 'Lights', exact: true }); const off = await shot('rear-lights-off'); await button.click(); await pause(); const on = await shot('rear-lights-on'); assert.notEqual(on, off); await button.click(); return { off, on, pixelsChanged: true }; });
      await chooseCamera('Front ¾');
      let environmentPixels = await shot('environment-start');
      for (const [label, id] of [['Gallery', 'gallery'], ['After hours', 'night'], ['Test paddock', 'forest'], ['Coastal road', 'coast'], ['Pit garage', 'studio']]) {
        await check(`Environment ${label}`, async () => { const before = environmentPixels; const hdrName = id === 'forest' ? 'tief_etz' : id === 'coast' ? 'victoria_curve_01' : null; const loaded = hdrName ? page.waitForResponse(response => response.url().includes('/environments/' + hdrName) && response.url().includes('.hdr')) : null; await open('Environment'); await page.getByRole('dialog').getByRole('button', { name: new RegExp('^' + label) }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); if (loaded) { const response = await loaded; assert.equal(response.ok(), true); assert.equal(await response.finished(), null); await page.evaluate(() => new Promise(resolve => { let n=24; const frame=()=> --n <= 0 ? resolve() : requestAnimationFrame(frame); requestAnimationFrame(frame); })); } await pause(); assert.match(await page.locator('main.configurator').getAttribute('class'), new RegExp('environment-' + id)); assert.equal(await page.locator('.scene-notice').count(), 0); const after = await shot('environment-' + id); assert.notEqual(after, before); environmentPixels = after; return { environment: id, before, after, pixelsChanged: true }; });
      }
      await check('Rotate on, visible movement, and stop', async () => { const before = await shot('rotate-before'); await page.emulateMedia({ reducedMotion: 'no-preference' }); const button = page.getByRole('button', { name: 'Rotate', exact: true }); await button.click(); assert.equal(await button.getAttribute('aria-pressed'), 'true'); await page.evaluate(() => new Promise(resolve => { let n=24; const frame=()=> --n <= 0 ? resolve() : requestAnimationFrame(frame); requestAnimationFrame(frame); })); await button.click({ timeout: 60000 }); assert.equal(await button.getAttribute('aria-pressed'), 'false'); await pause(); const after = await shot('rotate-after'); assert.notEqual(after, before); return { before, after, pixelsChanged: true }; });
      await check('Sound is an opt-in interface cue', async () => { const button = page.locator('.config-toolbar .sound-button'); const count = await page.evaluate(() => window.__audioStarts); await button.click(); await page.waitForTimeout(300); const starts = await page.evaluate(() => window.__audioStarts); assert.ok(starts > count); const enabledText = await button.innerText(); await button.click(); assert.equal(await button.getAttribute('aria-pressed'), 'false'); return { enabledText, actualOscillatorStarts: starts - count, soundType: 'interface cue, not engine audio' }; });
      for (const [id, label] of [['nismo', 'NISMO'], ['tspec', 'T-spec'], ['gtr50', 'GT-R50'], ['gt3', 'GT3'], ['gt500', 'GT500']]) {
        await check(`${label} remains an honest photo fallback`, async () => { await page.goto(baseURL + '/configurator/' + id, { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Photo reference · 3D asset pending', exact: true }).waitFor(); assert.equal(await canvas.count(), 0); assert.equal(await page.getByRole('button', { name: 'Photo reference · 3D asset pending', exact: true }).isVisible(), true); assert.equal(await page.getByRole('button', { name: 'Ultimate Silver', exact: true }).isDisabled(), true); await open('Camera'); assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Front', exact: true }).isDisabled(), true); await close(); await open('Environment'); assert.equal(await page.getByRole('dialog').getByRole('button', { name: /^Pit garage/ }).isDisabled(), true); await close(); return { canvas: false, photoFallback: true, cameraDisabled: true, environmentDisabled: true }; });
      }
    } catch (error) { result.errors.push(String(error)); report.failures.push(`${name}: ${error.message}`); }
    if (result.errors.length) report.failures.push(`${name}: unexpected browser errors`);
    await save(); await context.close();
  }
} finally { await save(); await browser?.close(); server?.kill('SIGTERM'); }
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;

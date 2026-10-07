/** CI-only timing probe of the unchanged production configurator. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { chromium, expect } from '@playwright/test';
import { createAppServer } from '../server.mjs';
import { installCabinTeardownProbe, summarizeCabinTeardown } from './cabin-teardown-probe.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cabinPath = '/models/r35-cabin-sealed-spatial.glb';
const expectedCabin = '3302157a1d5986aca0d263eb991f1f6dd08ffc9dcfa9f7680a3b0de29f2a7dfd';
const expectedExterior = 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d';
export function validateDiagnosticEnvironment(env) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'This diagnostic is CI-only');
  assert.equal(env.R35_ALLOW_CABIN_TEARDOWN_DIAGNOSTIC, '1', 'Explicit diagnostic opt-in required');
  assert.match(env.R35_EXPECTED_APP_TREE ?? '', /^[a-f0-9]{64}$/, 'Exact reviewed application tree digest required');
}
export async function applicationIdentity(directory = '.') {
  const paths = [];
  const walk = async name => {
    for (const entry of (await readdir(resolve(directory, name), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${name}/${entry.name}`;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) paths.push(path);
    }
  };
  await walk('src');
  paths.push('package.json', 'package-lock.json', 'vite.config.ts', 'server.mjs');
  const files = [];
  for (const path of paths.sort()) files.push({ path, sha256: hash(await readFile(resolve(directory, path))) });
  return { sha256: hash(JSON.stringify(files)), files };
}
export async function within(promise, milliseconds, description) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${description} exceeded its ${milliseconds}ms collection budget`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
async function saveTrace(cdp, directory, report) {
  const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  const result = await within(complete, 30_000, 'CDP trace flush');
  report.cdpTrace = { dataLossOccurred: result.dataLossOccurred, format: result.traceFormat, compression: result.streamCompression };
  if (!result.stream) throw new Error('CDP did not provide the diagnostic trace stream');
  const chunks = []; let total = 0;
  try {
    while (true) {
      const item = await cdp.send('IO.read', { handle: result.stream, size: 1_048_576 });
      const bytes = Buffer.from(item.data, item.base64Encoded ? 'base64' : 'utf8');
      total += bytes.length;
      assert.ok(total <= 64 * 1024 * 1024, 'Compressed CDP trace exceeds 64 MiB output limit');
      chunks.push(bytes);
      if (item.eof) break;
    }
    await writeFile(`${directory}/performance-trace.json.gz`, Buffer.concat(chunks));
    report.cdpTrace.bytes = total;
  } finally { await cdp.send('IO.close', { handle: result.stream }); }
}
async function runCase({ screenshots, baseURL, directory, identity, save }) {
  const report = {
    screenshots, result: 'running', phase: 'setup', steps: [], errors: [], pageErrors: [], console: [], requests: [],
    sourceCommit: process.env.GITHUB_SHA, applicationTree: identity.sha256,
    bounds: { clickMs: 15_000, drawerMs: 5_000, canvasMs: 5_000 },
    observation: 'A failed strict bound remains failed. Final-release observation has a separate 45s budget; browser evidence and trace exports have their own bounded collection budgets.',
    instrumentation: 'External init script + bounded CDP trace/CPU profile. No screenshots requested by the driver and no extra frame-settle wait after cabin activation.',
  };
  await mkdir(directory, { recursive: true });
  const write = async () => { await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2)); await save(report); };
  const step = async (name, action) => {
    report.phase = name;
    const started = performance.now();
    try {
      await action(); report.steps.push({ name, result: 'passed', elapsedMs: performance.now() - started });
    } catch (error) {
      report.steps.push({ name, result: 'failed', elapsedMs: performance.now() - started, error: String(error) });
      throw error;
    } finally { if (!armed) await write(); }
  };
  let browser, context, page, cdp, tracing = false, profiling = false, armed = false;
  try {
    browser = await chromium.launch({ timeout: 30_000, args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
    ] });
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript(installCabinTeardownProbe, { maxEvents: 6000, slowCallMs: 8 });
    await context.tracing.start({ screenshots, snapshots: true, sources: true });
    page = await context.newPage();
    page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(45_000);
    cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    page.on('pageerror', error => report.pageErrors.push({ phase: report.phase, message: error.message }));
    page.on('console', message => { if (['error', 'warning'].includes(message.type()) && report.console.length < 100) report.console.push({ phase: report.phase, type: message.type(), text: message.text() }); });
    page.on('request', request => { const path = new URL(request.url()).pathname; if (path.endsWith('.glb')) report.requests.push({ path, phase: report.phase }); });
    const canvas = page.locator('.scene-stage canvas');
    const controls = page.locator('footer[aria-label="Cabin preview controls"]');
    const readyExterior = async () => {
      await expect(page.getByRole('button', { name: 'Ultimate Silver', exact: true })).toBeEnabled({ timeout: 90_000 });
      await expect(page.locator('.scene-loading, .scene-notice, .render-error')).toHaveCount(0, { timeout: 5_000 });
      await expect(canvas).toHaveCount(1, { timeout: 5_000 });
    };
    const switchModel = async name => {
      await page.getByRole('button', { name: 'Switch model', exact: true }).click({ timeout: 15_000 });
      await page.getByRole('dialog').getByRole('button', { name }).click({ timeout: 15_000 });
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
    };
    await step('first Premium exterior', async () => { await page.goto(`${baseURL}/configurator/premium`, { waitUntil: 'domcontentloaded' }); await readyExterior(); });
    await step('photo route and second Premium canvas', async () => {
      await switchModel(/^NISMO /); await expect(canvas).toHaveCount(0, { timeout: 5_000 });
      await switchModel(/^Premium /); await readyExterior();
      assert.equal(report.requests.filter(request => request.path === '/models/ciasny-r35.glb').length, 2);
    });
    report.renderer = await canvas.evaluate(element => {
      const gl = element.getContext('webgl2') || element.getContext('webgl');
      const extension = gl?.getExtension('WEBGL_debug_renderer_info');
      return { contextId: gl ? window.__r35TeardownProbe.contextId(gl) : null, version: gl?.getParameter(gl.VERSION), renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) };
    });
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    await cdp.send('Profiler.start'); profiling = true;
    await cdp.send('Tracing.start', {
      transferMode: 'ReturnAsStream', streamFormat: 'json', streamCompression: 'gzip',
      traceConfig: {
        recordMode: 'recordUntilFull', traceBufferSizeInKb: 32 * 1024,
        includedCategories: ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'blink.user_timing', 'gpu'],
      },
    }); tracing = true;
    await page.evaluate(() => window.__r35TeardownProbe.arm()); armed = true;
    await step('opt in and observe active UI without waiting for a rendered frame', async () => {
      await page.getByRole('button', { name: 'Camera', exact: true }).click({ timeout: 15_000 });
      await page.getByRole('dialog').getByRole('button', { name: 'Cabin preview · work in progress', exact: true }).click({ timeout: 15_000 });
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
      await expect(controls).toBeVisible({ timeout: 5_000 });
      await expect(controls.getByRole('button', { name: 'Driver', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 90_000 });
      await expect(canvas).toHaveAttribute('aria-label', /fixed seat/, { timeout: 5_000 });
      await expect(page.getByRole('button', { name: 'Rotate', exact: true })).toBeDisabled({ timeout: 5_000 });
    });
    await step('open model drawer', () => page.getByRole('button', { name: 'Switch model', exact: true }).click({ timeout: 15_000 }));
    await step('NISMO click including scheduled-navigation wait', () => page.getByRole('dialog').getByRole('button', { name: /^NISMO / }).click({ timeout: 15_000 }));
    await step('route, drawer and canvas teardown', async () => {
      await expect(page).toHaveURL(/\/configurator\/nismo$/, { timeout: 5_000 });
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
      await expect(canvas).toHaveCount(0, { timeout: 5_000 });
      await expect(controls).toHaveCount(0, { timeout: 5_000 });
      await expect(page.locator('.reference-view img')).toBeVisible({ timeout: 5_000 });
    });
    assert.deepEqual(report.pageErrors, []);
    report.result = 'passed';
  } catch (error) {
    report.result = 'failed'; report.errors.push({ phase: report.phase, message: String(error), stack: error.stack });
  } finally {
    report.strictResult = report.result;
    await write();
    if (armed && page && Number.isInteger(report.renderer?.contextId)) {
      const targetContext = report.renderer.contextId;
      const started = performance.now();
      report.cleanup = { result: 'observing', targetContext, budgetMs: 45_000 };
      await write();
      try {
        // Separate from the unchanged route budgets: observe this renderer's
        // final release, not a late release from the first Premium canvas.
        const released = await page.waitForFunction(
          id => window.__r35TeardownProbe.releaseStatus(id),
          targetContext,
          { timeout: 45_000, polling: 100 },
        );
        const call = await released.jsonValue();
        await released.dispose();
        report.cleanup = {
          result: 'completed', targetContext, budgetMs: 45_000,
          elapsedMs: performance.now() - started,
          forceContextLossCalls: call.count, forceContextLossMs: call.maxMs,
        };
      } catch (error) {
        report.cleanup = { result: 'not-observed', targetContext, budgetMs: 45_000, elapsedMs: performance.now() - started, error: String(error) };
        report.result = 'failed';
        report.errors.push({ phase: 'target renderer final release', message: String(error) });
      }
    } else report.cleanup = { result: 'not-started' };
    // This is diagnostic observation only. It cannot convert a strict failure
    // into a pass and does not issue screenshots, frame barriers or GPU fences.
    if (armed && page) {
      try {
        const snapshot = await within(page.evaluate(() => window.__r35TeardownProbe.snapshot()), 30_000, 'post-outcome browser evidence');
        await writeFile(`${directory}/browser-events.json`, JSON.stringify(snapshot, null, 2));
        report.summary = summarizeCabinTeardown(snapshot);
      } catch (error) { report.errors.push({ phase: 'evidence collection', message: String(error) }); }
    }
    if (profiling) {
      try { const result = await within(cdp.send('Profiler.stop'), 30_000, 'CPU profile stop'); await writeFile(`${directory}/main-thread.cpuprofile`, JSON.stringify(result.profile)); }
      catch (error) { report.errors.push({ phase: 'CPU profile', message: String(error) }); }
    }
    if (tracing) {
      try { await within(saveTrace(cdp, directory, report), 45_000, 'CDP trace export'); }
      catch (error) { report.errors.push({ phase: 'CDP trace', message: String(error) }); }
    }
    await context?.tracing.stop({ path: `${directory}/playwright-trace.zip` }).catch(error => report.errors.push({ phase: 'Playwright trace', message: String(error) }));
    await browser?.close();
    await write();
  }
  return report;
}
export async function main() {
  validateDiagnosticEnvironment(process.env);
  const output = 'cabin-teardown-results'; await mkdir(output, { recursive: true });
  const identity = await applicationIdentity();
  assert.equal(identity.sha256, process.env.R35_EXPECTED_APP_TREE, 'Production source differs from the reviewed candidate');
  assert.equal(hash(await readFile(`dist${cabinPath}`)), expectedCabin, 'Exact reviewed cabin required');
  assert.equal(hash(await readFile('dist/models/ciasny-r35.glb')), expectedExterior, 'Exact unchanged exterior required');
  const bundleFiles = [];
  for (const entry of (await readdir('dist/assets')).sort()) {
    if (/\.(js|css)$/.test(entry)) bundleFiles.push({ path: `dist/assets/${entry}`, sha256: hash(await readFile(`dist/assets/${entry}`)) });
  }
  await writeFile(`${output}/identity.json`, JSON.stringify({ commit: process.env.GITHUB_SHA, application: identity, bundles: bundleFiles, cabin: expectedCabin, exterior: expectedExterior }, null, 2));
  const server = createAppServer();
  const results = [];
  const save = async () => writeFile(`${output}/report.json`, JSON.stringify({ commit: process.env.GITHUB_SHA, applicationTree: identity.sha256, scope: 'Paired fresh browser processes, screenshots enabled/disabled, unchanged source and strict bounds', results }, null, 2));
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4178, '127.0.0.1', resolve); });
    for (const screenshots of [true, false]) {
      const index = results.length; results.push({ screenshots, result: 'starting' });
      await runCase({ screenshots, baseURL: 'http://127.0.0.1:4178', directory: `${output}/${screenshots ? 'screenshots-on' : 'screenshots-off'}`, identity,
        save: async report => { results[index] = report; await save(); },
      });
    }
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await save();
  }
  if (results.some(result => result.result !== 'passed')) process.exitCode = 1;
  console.log(JSON.stringify(results.map(({ screenshots, result, summary, errors }) => ({ screenshots, result, summary, errors })), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

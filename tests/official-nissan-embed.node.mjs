import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { contract, repository, baselineCommit, baselineTree, videoId, publisher, origin, sourcePaths, allowedPaths, viewports, budgets, capturePolicy, assertCaptureAllowed, expectedLaneStatus, qaCsp, token, sha256, validateRequest, validateRevision, providerFailure, remaining, assessPlaybackPair, assessPausePair, assessFramePair } from '../scripts/official-nissan-embed-policy.mjs';
import { pageHtml, pageJs, pageCss } from '../scripts/official-nissan-embed-page.mjs';
import { bounded } from '../scripts/official-nissan-embed.mjs';
const root = resolve(new URL('..', import.meta.url).pathname);
const environment = { CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', R35_ALLOW_OFFICIAL_NISSAN_EMBED: '1' };
const event = { repository: { full_name: repository, id: 1399246874 }, ref: 'refs/heads/main', before: baselineCommit, after: environment.GITHUB_SHA, head_commit: { id: environment.GITHUB_SHA, message: token }, deleted: false, forced: false };
const request = { version: 1, allow: true, contract, baselineCommit, baselineTree, videoId, publisher, origin, viewports, budgets, capturePolicy, sourceFiles: sourcePaths.map(path => ({ path, bytes: 1, sha256: 'b'.repeat(64) })) };
const revision = { head: environment.GITHUB_SHA, parents: [baselineCommit], parentTree: baselineTree, changed: allowedPaths.map(path => ({ status: 'A', path })), status: '' };
// All synthetic records below exercise CPU predicates only, never simulate a provider or produce browser evidence.
const observed = { ready: true, state: 1, currentTime: 3, ratio: 1, terminal: null };

test('exact source/event contract accepts only the fixed one-shot QA scope', () => {
  assert.equal(validateRequest(request, environment, event), true); validateRevision(revision, environment);
  for (const patch of [{ CI: 'false' }, { GITHUB_ACTIONS: 'false' }, { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_REF: 'refs/heads/qa' }, { GITHUB_RUN_ATTEMPT: '2' }, { R35_SOURCE_SHA: 'b'.repeat(40) }, { R35_VIDEO_ID: 'other' }, { HOME_QA_URL: origin }, { NODE_OPTIONS: '--require=other' }, { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/other' }]) assert.throws(() => validateRequest(request, { ...environment, ...patch }, event));
  for (const key of ['allow', 'contract', 'baselineCommit', 'baselineTree', 'videoId', 'publisher', 'origin', 'viewports', 'budgets', 'capturePolicy']) assert.throws(() => validateRequest({ ...request, [key]: 'drift' }, environment, event));
  assert.throws(() => validateRequest({ ...request, extra: true }, environment, event));
  assert.throws(() => validateRequest({ ...request, sourceFiles: [] }, environment, event));
  for (const patch of [{ before: 'c'.repeat(40) }, { after: 'c'.repeat(40) }, { forced: true }, { deleted: true }, { head_commit: { ...event.head_commit, message: token + ' [release-home-repair]' } }]) assert.throws(() => validateRequest(request, environment, { ...event, ...patch }));
  for (const patch of [{ parents: ['c'.repeat(40)] }, { parents: [baselineCommit, 'c'.repeat(40)] }, { status: ' M server.mjs' }, { changed: [...revision.changed, { status: 'M', path: 'src/main.tsx' }] }, { changed: revision.changed.map(file => ({ ...file, status: 'M' })) }]) assert.throws(() => validateRevision({ ...revision, ...patch }, environment));
});

test('frozen source request matches every source-only file exactly', async () => {
  const actual = JSON.parse(await readFile(resolve(root, 'qa/official-nissan-embed-request.json'), 'utf8'));
  validateRequest(actual, environment, event);
  for (const file of actual.sourceFiles) { const bytes = await readFile(resolve(root, file.path)); assert.equal(bytes.length, file.bytes, file.path); assert.equal(sha256(bytes), file.sha256, file.path); }
  assert.equal(allowedPaths.length, 7); assert.ok(allowedPaths.every(path => !path.startsWith('public/') && !path.startsWith('src/') && !/\.png$|results|release-/.test(path)));
});

test('actual ready, playing, advancing and visible observations are separate gates', () => {
  assert.equal(assessPlaybackPair(observed, { ...observed, currentTime: 5 }).passed, true);
  for (const patch of [{ ready: false }, { state: 2 }, { state: 3 }, { currentTime: 3 }, { currentTime: NaN }, { ratio: .5 }, { terminal: { kind: 'autoplay-blocked' } }]) assert.equal(assessPlaybackPair(observed, { ...observed, currentTime: 5, ...patch }).passed, false);
  const paused = { ...observed, ratio: 0, state: 2 };
  assert.equal(assessPausePair(paused, paused).passed, true);
  for (const patch of [{ ratio: .1 }, { state: 1 }, { currentTime: 3.2 }, { terminal: { kind: 'provider-error' } }]) assert.equal(assessPausePair(paused, { ...paused, ...patch }).passed, false);
  assert.deepEqual(providerFailure(101), { code: 101, kind: 'owner-disabled-embedding' });
  assert.equal(providerFailure(150).kind, 'owner-disabled-embedding'); assert.equal(providerFailure(153).kind, 'missing-client-identification');
  assert.equal(providerFailure(100).kind, 'video-unavailable'); assert.equal(providerFailure(5).kind, 'html5-playback-error');
});

function pixels(kind) {
  const width = 320, height = 240, data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const value = kind === 'blank' ? 0 : (x * 3 + y * 7 + (kind === 'different' ? 70 : 0)) % 256;
    data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
  }
  return { width, height, data };
}
test('CPU pixel assessment rejects frozen frames, blank output and only edge/control changes', () => {
  const rect = { x: 0, y: 0, width: 320, height: 240 }, first = pixels('texture'), second = pixels('different');
  assert.equal(assessFramePair(first, second, rect).passed, true);
  assert.equal(assessFramePair(first, first, rect).passed, false);
  assert.equal(assessFramePair(pixels('blank'), pixels('blank'), rect).passed, false);
  const edges = pixels('texture');
  for (let y = 180; y < 240; y++) for (let x = 0; x < 320; x++) edges.data[(y * 320 + x) * 4] = 255;
  assert.equal(assessFramePair(first, edges, rect).passed, false);
  const loader = pixels('texture');
  for (let y = 90; y < 150; y++) for (let x = 135; x < 185; x++) loader.data[(y * 320 + x) * 4] = 255;
  assert.equal(assessFramePair(first, loader, rect).passed, false);
  assert.throws(() => assessFramePair(first, second, { ...rect, width: 199 }));
});

test('intact single player has real local identity, minimum size and no covering UI', () => {
  assert.equal((pageHtml.match(/<iframe /g) ?? []).length, 1); assert.ok(pageHtml.includes(`/embed/${videoId}?`));
  for (const parameter of ['autoplay=0', 'controls=1', 'playsinline=1', `origin=${encodeURIComponent(origin)}`]) assert.ok(pageHtml.includes(parameter));
  assert.ok(pageHtml.includes('referrerpolicy="strict-origin-when-cross-origin"'));
  assert.ok(pageCss.includes('min-width:200px')); assert.ok(pageCss.includes('min-height:200px')); assert.ok(pageCss.includes('height:auto'));
  assert.ok(!/position:(?:absolute|fixed)|z-index|opacity:0|pointer-events:none|overflow:hidden/.test(pageCss));
  assert.ok(pageJs.includes('ratio > .5')); assert.ok(pageJs.includes('player.mute()')); assert.ok(pageJs.includes("terminal('mute-not-confirmed')")); assert.ok(pageJs.includes('onAutoplayBlocked')); assert.ok(pageJs.includes('onError'));
  assert.ok(pageJs.includes('attemptedEpoch !== evidence.epoch')); assert.ok(pageJs.includes('evidence.terminal')); assert.ok(pageJs.includes('player.pauseVideo()'));
  assert.ok(qaCsp.includes('frame-src https://www.youtube.com;')); assert.ok(qaCsp.includes("default-src 'none'")); assert.ok(!qaCsp.includes('unsafe-inline'));
  assert.ok(!/modestbranding|controls=0|noreferrer|seekTo|loadVideoBy|download|fetch\(/.test(pageHtml + pageJs));
});

test('absolute deadlines are capped and timeout remains failure after late completion', async () => {
  assert.equal(remaining(150, 100, 80), 50); assert.equal(remaining(150, 100, 20), 20);
  assert.throws(() => remaining(100, 100, 20)); assert.throws(() => remaining(90, 100, 20));
  await assert.rejects(bounded(() => new Promise(resolve => setTimeout(() => resolve('late'), 30)), Date.now() + 10, 10, 'test'), /deadline/);
  const startedAt = Date.now();
  await assert.rejects(bounded(() => { while (Date.now() - startedAt < 30) {} return 'late synchronous result'; }, startedAt + 10, 10, 'synchronous-test'), /deadline/);
  assert.equal(budgets.lane, 65000); assert.equal(budgets.batch, 240000);
});

test('source keeps browser/socket imports behind preflight and no forbidden provider manipulation', async () => {
  const runner = await readFile(resolve(root, 'scripts/official-nissan-embed.mjs'), 'utf8'), workflow = await readFile(resolve(root, '.github/workflows/official-nissan-embed-qa.yml'), 'utf8');
  assert.ok(runner.indexOf('const identity = await preflight()') < runner.indexOf("await import('node:http')"));
  assert.ok(runner.indexOf('const identity = await preflight()') < runner.indexOf("await import('@playwright/test')"));
  assert.ok(!/\.route\(|route\.fulfill|addInitScript|--autoplay-policy|ignoreDefaultArgs|executablePath:|\.click\(|force:\s*true|requestVideoFrameCallback|captureStream|\.videoWidth|\.response\.body|recordVideo|storageState:/.test(runner));
  assert.ok(runner.indexOf('const watchdog = setTimeout') < runner.indexOf("await bounded(save, batchDeadline, budgets.command, 'initial-report')"));
  assert.ok(runner.indexOf("await bounded(save, batchDeadline, budgets.command, 'final-report')") < runner.indexOf('clearTimeout(watchdog)'));
  assert.ok(runner.includes('page.mouse.wheel')); assert.ok(runner.includes("method: 'HEAD'")); assert.ok(runner.includes('productionCsp'));
  assert.ok(workflow.includes('github.run_attempt == 1')); assert.ok(workflow.includes('fetch-depth: 2')); assert.ok(workflow.includes('retention-days: 3'));
  assert.ok(!/workflow_dispatch|schedule:|pull_request|deploy|npm run build/.test(workflow));
  assert.ok(workflow.includes('report.json')); assert.ok(!workflow.includes('path: .'));
});


test('approved image scope is a global desktop-only two-capture allowance', async () => {
  assert.deepEqual(capturePolicy, { viewport: 'desktop', maximumImages: 2, labels: ['visible-frame-1', 'visible-frame-2'] });
  assertCaptureAllowed('desktop', 'visible-frame-1', 0); assertCaptureAllowed('desktop', 'visible-frame-2', 1);
  for (const [name, label, attempts] of [['mobile', 'visible-frame-1', 0], ['tablet', 'visible-frame-1', 0], ['desktop', 'visible-frame-2', 0], ['desktop', 'visible-frame-1', 1], ['desktop', 'visible-frame-3', 2], ['desktop', 'visible-frame-1', -1]]) assert.throws(() => assertCaptureAllowed(name, label, attempts));
  assert.equal(expectedLaneStatus('desktop'), 'passed-pending-human-frame-review');
  assert.equal(expectedLaneStatus('mobile'), 'passed-api-only-no-visual-proof'); assert.equal(expectedLaneStatus('tablet'), 'passed-api-only-no-visual-proof');
  const runner = await readFile(resolve(root, 'scripts/official-nissan-embed.mjs'), 'utf8'), workflow = await readFile(resolve(root, '.github/workflows/official-nissan-embed-qa.yml'), 'utf8');
  assert.equal((runner.match(/page\.screenshot\(/g) ?? []).length, 1);
  assert.ok(runner.indexOf('assertCaptureAllowed(name, label, report.screenshotAttempts)') < runner.indexOf('page.screenshot('));
  assert.ok(runner.indexOf('report.screenshotAttempts++') < runner.indexOf('page.screenshot('));
  assert.ok(runner.includes("if (name === capturePolicy.viewport)")); assert.ok(runner.includes("status: 'not-collected'"));
  assert.ok(workflow.includes('/desktop-visible-frame-1.png')); assert.ok(workflow.includes('/desktop-visible-frame-2.png'));
  assert.ok(!workflow.includes('*-visible-frame')); assert.equal((workflow.match(/\.png/g) ?? []).length, 2);
});

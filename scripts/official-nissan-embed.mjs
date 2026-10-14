/** One closed GitHub-CI-only compatibility batch. No provider interception or runtime edits. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, lstat, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { contract, repository, baselineCommit, baselineTree, videoId, publisher, origin, liveOrigin, requestPath, sourcePaths, viewports, budgets, capturePolicy, assertCaptureAllowed, expectedLaneStatus, qaCsp, integrationWarning, sha256, validateRequest, validateRevision, remaining, assessPlaybackPair, assessPausePair, assessFramePair } from './official-nissan-embed-policy.mjs';
import { pageHtml, pageJs, pageCss } from './official-nissan-embed-page.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: budgets.command }).trim();
export async function preflight(env = process.env) {
  const request = JSON.parse(await readFile(resolve(root, requestPath), 'utf8'));
  assert.ok(env.GITHUB_EVENT_PATH, 'Only a native GitHub event can authorize this probe');
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
  validateRequest(request, env, event);
  const changed = git('diff', '--name-status', '--no-renames', baselineCommit, 'HEAD').split('\n').filter(Boolean).map(line => { const [status, path] = line.split('\t'); return { status, path }; }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
  // ASCII order is used consistently, independent of the runner locale.
  changed.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  validateRevision({ head: git('rev-parse', 'HEAD'), parents: git('show', '-s', '--format=%P', 'HEAD').split(' '), parentTree: git('rev-parse', `${baselineCommit}^{tree}`), changed, status: git('status', '--porcelain', '--untracked-files=all') }, env);
  for (const file of request.sourceFiles) {
    const path = resolve(root, file.path); assert.equal((await lstat(path)).isSymbolicLink(), false);
    const bytes = await readFile(path); assert.equal(bytes.length, file.bytes, file.path); assert.equal(sha256(bytes), file.sha256, file.path);
  }
  const serverSource = await readFile(resolve(root, 'server.mjs'), 'utf8');
  const productionCsp = /const CSP\s*=\s*\n?\s*"([^"]+)"/.exec(serverSource)?.[1];
  assert.ok(productionCsp, 'Baseline production CSP must be inspectable');
  assert.ok(!productionCsp.includes('youtube.com')); assert.ok(productionCsp.includes('frame-src https://media.flixel.com'));
  return { request, sourceCommit: env.GITHUB_SHA, baselineCommit, baselineTree, productionCsp, productionServerSha256: sha256(serverSource) };
}

/** A hard deadline rejects once; late operations cannot turn failure into success. */
export async function bounded(task, deadline, cap, label) {
  const startedAt = Date.now(), effectiveDeadline = Math.min(deadline, startedAt + cap);
  const timeout = remaining(effectiveDeadline, startedAt, cap); let timer;
  try {
    const value = await Promise.race([Promise.resolve().then(task), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: absolute deadline exceeded`)), timeout); })]);
    // Synchronous work can delay the timer queue: a resolved value is still late.
    remaining(effectiveDeadline, Date.now(), cap);
    return value;
  }
  finally { clearTimeout(timer); }
}
const snapshot = page => page.evaluate(() => window.officialNissanProbe?.snapshot() ?? null);

async function waitObserved(page, predicate, { deadline, cap, label }) {
  // A single finite observation interval; this never retries playback or navigation.
  const limit = Math.min(deadline, Date.now() + cap);
  while (Date.now() < limit) {
    const value = await bounded(() => snapshot(page), limit, budgets.command, label);
    if (value?.terminal) throw new Error(`${label}: ${JSON.stringify(value.terminal)}`);
    if (value && predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(1, limit - Date.now()))));
  }
  throw new Error(`${label}: observation deadline exceeded`);
}

async function inspectLiveHeaders(deadline) {
  const response = await fetch(liveOrigin + '/', { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(remaining(deadline, Date.now(), budgets.liveHeaders)) });
  const csp = response.headers.get('content-security-policy');
  return { requestedOrigin: liveOrigin, status: response.status, csp, referrerPolicy: response.headers.get('referrer-policy'), youtubeFrameAllowed: /frame-src[^;]*https:\/\/(?:www\.)?youtube\.com(?:[\s;]|$)/.test(csp ?? ''), note: 'Read-only live response headers. This request does not inject or run a YouTube player on production.' };
}

async function runLane({ browser, name, viewport, output, report, PNG, batchDeadline, save }) {
  const deadline = Math.min(batchDeadline, Date.now() + budgets.lane);
  const row = { name, viewport, browserScope: 'Desktop Chromium at the stated responsive viewport. Not physical mobile, Safari, or iOS proof.', startedAt: new Date().toISOString(), status: 'running', integrationWarning, visualEvidence: name === capturePolicy.viewport ? 'desktop-pair-pending' : 'not-collected-no-visual-proof', screenshots: [], observations: {}, embedRequests: [], providerConsoleErrors: [], pageErrors: [] };
  report.lanes.push(row); await save();
  let context, page, finished = false;
  const checkpoint = () => remaining(deadline, Date.now(), budgets.command);
  const act = (task, cap, label) => bounded(task, deadline, cap, `${name}/${label}`);
  const observe = (predicate, cap, label) => waitObserved(page, predicate, { deadline, cap, label: `${name}/${label}` });
  const presentation = async label => {
    const geometry = await act(() => page.evaluate(() => {
      const frame = document.getElementById('player'), rect = frame.getBoundingClientRect();
      const points = [[.02, .02], [.98, .02], [.5, .5], [.02, .98], [.98, .98]];
      return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, unobscured: points.every(([x, y]) => document.elementFromPoint(rect.x + x * rect.width, rect.y + y * rect.height) === frame), iframeSrc: frame.src, referrerPolicy: frame.referrerPolicy, controls: new URL(frame.src).searchParams.get('controls'), pageOrigin: location.origin };
    }), budgets.command, `${label}-geometry`);
    assert.equal(geometry.unobscured, true, 'Nothing may overlay any part of the player'); assert.equal(geometry.controls, '1'); assert.equal(geometry.pageOrigin, origin); assert.equal(geometry.referrerPolicy, 'strict-origin-when-cross-origin');
    checkpoint(); return geometry;
  };
  const take = async label => {
    assert.equal(finished, false); checkpoint();
    const before = await act(() => snapshot(page), budgets.command, `${label}-before`);
    assert.equal(before.state, 1); assert.equal(before.muted, true); assert.ok(before.ratio >= .999); assert.equal(before.terminal, null);
    const geometry = await presentation(label);
    assertCaptureAllowed(name, label, report.screenshotAttempts);
    report.screenshotAttempts++;
    const bytes = await act(() => page.screenshot({ type: 'png', fullPage: false, timeout: remaining(deadline, Date.now(), budgets.screenshot) }), budgets.screenshot, label);
    const after = await act(() => snapshot(page), budgets.command, `${label}-after`);
    assert.equal(after.state, 1); assert.equal(after.muted, true); assert.ok(after.ratio >= .999); assert.equal(after.terminal, null);
    assert.deepEqual(after.rect, before.rect); assert.deepEqual(geometry.rect, before.rect);
    const png = PNG.sync.read(bytes); checkpoint();
    const entry = { file: `${name}-${label}.png`, sha256: sha256(bytes), bytes: bytes.length, before, after, geometry }; checkpoint();
    await act(() => writeFile(resolve(output, entry.file), bytes), budgets.command, `${label}-write`); checkpoint();
    row.screenshots.push(entry);
    await act(save, budgets.command, `${label}-save`); checkpoint();
    return { png, evidence: entry };
  };
  try {
    context = await act(() => browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference' }), budgets.command, 'context');
    page = await act(() => context.newPage(), budgets.command, 'page'); page.setDefaultTimeout(budgets.command);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin === 'https://www.youtube.com' && url.pathname === `/embed/${videoId}`) row.embedRequests.push({ origin: url.origin, path: url.pathname, referer: request.headers().referer ?? null, resourceType: request.resourceType(), at: Date.now() });
    });
    page.on('pageerror', error => { if (row.pageErrors.length < 10) row.pageErrors.push(String(error.message).slice(0, 400)); });
    page.on('console', message => { if (message.type() === 'error' && row.providerConsoleErrors.length < 10) row.providerConsoleErrors.push(message.text().slice(0, 400)); });
    await act(() => page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: remaining(deadline, Date.now(), budgets.navigation) }), budgets.navigation, 'navigate');
    row.observations.readyOffscreen = await observe(value => value.ready && value.muted, budgets.ready, 'onReady-and-muted-acknowledgement');
    const initial = row.observations.readyOffscreen;
    assert.equal(initial.ratio, 0); assert.equal(initial.attempts, 0); assert.notEqual(initial.state, 1); assert.equal(initial.playerCount, 1);
    assert.ok(row.embedRequests.some(request => request.resourceType === 'document' && request.referer === origin + '/'), 'Real browser-generated CI-local Referer is required');
    await save();
    const targetY = (viewport.height - initial.rect.height) / 2;
    await act(() => page.mouse.move(viewport.width - 4, 4), budgets.command, 'move-outside-player');
    await act(() => page.mouse.wheel(0, initial.rect.y - targetY), budgets.command, 'native-scroll-in');
    row.observations.playing = await observe(value => value.state === 1 && value.currentTime >= 3 && value.ratio >= .999, budgets.playing, 'playing-and-time');
    assert.equal(row.observations.playing.muted, true);
    row.observations.presentation = await presentation('playing-presentation');
    if (name === capturePolicy.viewport) {
      const first = await take('visible-frame-1');
      await observe(value => value.state === 1 && value.currentTime >= first.evidence.after.currentTime + 1.5, budgets.sample, 'time-advance');
      const second = await take('visible-frame-2');
      assert.deepEqual(second.evidence.geometry.rect, first.evidence.geometry.rect, 'Both screenshots must use the same player rectangle'); checkpoint();
      row.playback = assessPlaybackPair(first.evidence.before, second.evidence.after); checkpoint();
      row.visiblePixels = assessFramePair(first.png, second.png, first.evidence.geometry.rect); checkpoint();
      assert.equal(row.visiblePixels.passed, true, 'Desktop visible moving image region is unverified');
      row.visualEvidence = 'desktop-pair-pending-human-review';
    } else {
      // No screenshot call, file, pixel assessment or visual acceptance for these viewports.
      row.observations.playingLater = await observe(value => value.state === 1 && value.currentTime >= row.observations.playing.currentTime + 1.5 && value.ratio >= .999, budgets.sample, 'api-time-advance');
      assert.equal(row.observations.playingLater.muted, true);
      row.playback = assessPlaybackPair(row.observations.playing, row.observations.playingLater); checkpoint();
      assert.equal(row.screenshots.length, 0);
      row.visiblePixels = { passed: null, status: 'not-collected', scope: 'API/time evidence only; no screenshots or visual proof were collected for this viewport.' };
    }
    assert.equal(row.playback.passed, true, 'onReady alone is not playback evidence');
    await act(save, budgets.command, 'pair-save'); checkpoint();
    const onscreen = await act(() => snapshot(page), budgets.command, 'before-exit');
    await act(() => page.mouse.wheel(0, onscreen.rect.y + onscreen.rect.height + 80), budgets.command, 'native-scroll-out');
    row.observations.paused = await observe(value => value.ratio === 0 && value.state === 2, budgets.command, 'offscreen-pause');
    await act(() => new Promise(resolve => setTimeout(resolve, 1500)), budgets.sample, 'pause-observation-interval');
    row.observations.pausedLater = await act(() => snapshot(page), budgets.command, 'paused-time');
    row.pause = assessPausePair(row.observations.paused, row.observations.pausedLater); checkpoint();
    assert.equal(row.pause.passed, true, 'Offscreen player must pause with stable currentTime');
    const out = row.observations.pausedLater;
    await act(() => page.mouse.wheel(0, out.rect.y - targetY), budgets.command, 'native-scroll-reentry');
    row.observations.reentry = await observe(value => value.ratio >= .999 && value.state === 1 && value.currentTime >= out.currentTime + 1, budgets.playing, 'reentry-playback');
    assert.equal(row.observations.reentry.playerCount, 1); assert.equal(row.observations.reentry.attempts, 2);
    const attempts = row.observations.reentry.events.filter(event => event.kind === 'autoplay-request');
    assert.equal(attempts.length, 2); assert.ok(attempts.every(event => event.ratio > .5 && event.visible && event.muted));
    assert.equal(row.pageErrors.length, 0, 'Unexpected top-level/provider page errors require review');
    checkpoint(); row.status = expectedLaneStatus(name);
  } catch (error) {
    row.status = 'failed-terminal'; row.failure = String(error.message);
    if (page && Date.now() < deadline) { try { row.observations.terminal = await bounded(() => snapshot(page), deadline, budgets.command, 'terminal-snapshot-within-original-lane'); } catch (failure) { row.terminalSnapshotFailure = String(failure.message); } }
    else row.terminalSnapshotFailure = 'Original lane budget exhausted; no late evidence window was opened.';
  } finally {
    finished = true; row.finishedAt = new Date().toISOString(); await save();
    if (context) {
      try { await bounded(() => context.close(), Math.min(batchDeadline, Date.now() + budgets.cleanup), budgets.cleanup, 'close-context'); }
      catch (error) { row.status = 'failed-terminal'; row.cleanupFailure = String(error.message); await save(); throw error; }
    }
  }
  return row;
}

export async function main() {
  assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--preflight'), 'No runtime overrides accepted');
  const identity = await preflight();
  if (process.argv[2] === '--preflight') { console.log('Exact source-only CI preflight passed. No browser or socket started.'); return; }
  assert.ok(process.env.RUNNER_TEMP, 'Native CI temporary directory required');
  const output = resolve(process.env.RUNNER_TEMP, `official-nissan-embed-${process.env.GITHUB_RUN_ID}`);
  await mkdir(output, { recursive: false });
  const lock = await open(resolve(output, 'batch.lock'), 'wx'); await lock.close();
  const batchDeadline = Date.now() + budgets.batch;
  // Arm before any batch I/O and retain through final persistence and success checks.
  const watchdog = setTimeout(() => {
    // No I/O promise may hold the hard stop open; the last report may be incomplete.
    process.exit(1);
  }, remaining(batchDeadline, Date.now(), budgets.batch));
  const report = { contract, repository, videoId, publisher, origin, identity, integrationWarning, budgets, capturePolicy, screenshotAttempts: 0, generatedAt: new Date().toISOString(), lanes: [], status: 'running', evidenceScope: 'At most two original desktop viewport screenshots total; mobile/tablet have API/state/time/pause evidence only and no visual proof. Provider responses/media are not saved, replaced or extracted. No production browser or runtime changes.' };
  const save = () => writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  let browser, server;
  try {
    await bounded(save, batchDeadline, budgets.command, 'initial-report');
    try { report.liveHeaders = await inspectLiveHeaders(batchDeadline); }
    catch (error) { report.liveHeaders = { status: 'unverified', failure: String(error.message), note: 'Baseline source CSP remains recorded separately.' }; }
    await save();
    // Dynamic imports occur only after exact request/event/revision/file preflight.
    const { createServer } = await import('node:http');
    const { chromium } = await import('@playwright/test');
    const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
    const resources = new Map([['/', ['text/html; charset=utf-8', pageHtml]], ['/page.js', ['text/javascript; charset=utf-8', pageJs]], ['/page.css', ['text/css; charset=utf-8', pageCss]]]);
    server = createServer((request, response) => {
      const resource = resources.get(request.url);
      if (request.headers.host !== '127.0.0.1:4197' || request.method !== 'GET' || !resource) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': resource[0], 'Content-Security-Policy': qaCsp, 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'autoplay=(self "https://www.youtube.com")', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }); response.end(resource[1]);
    });
    await bounded(() => new Promise((resolve, reject) => { server.once('error', reject); server.listen(4197, '127.0.0.1', resolve); }), batchDeadline, budgets.command, 'CI-local listen');
    // No flags, custom browser binary, autoplay-policy changes, forced clicks, or storage state.
    browser = await bounded(() => chromium.launch({ headless: true, timeout: budgets.navigation }), batchDeadline, budgets.navigation, 'launch');
    for (const [name, viewport] of Object.entries(viewports)) await runLane({ browser, name, viewport, output, report, PNG, batchDeadline, save });
    assert.ok(report.screenshotAttempts <= capturePolicy.maximumImages);
    assert.ok(report.lanes.filter(lane => lane.name !== capturePolicy.viewport).every(lane => lane.screenshots.length === 0));
    report.status = report.lanes.every(lane => lane.status === expectedLaneStatus(lane.name)) ? 'passed-pending-desktop-frame-review-mobile-tablet-api-only' : 'failed-terminal';
  } catch (error) { report.status = 'failed-terminal'; report.failure = String(error.message); }
  finally {
    if (browser) { try { await bounded(() => browser.close(), Date.now() + budgets.cleanup, budgets.cleanup, 'close-browser'); } catch (error) { report.status = 'failed-terminal'; report.browserCleanupFailure = String(error.message); } }
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    report.finishedAt = new Date().toISOString();
    await bounded(save, batchDeadline, budgets.command, 'final-report');
    remaining(batchDeadline, Date.now(), budgets.command);
    clearTimeout(watchdog);
  }
  // Detailed evidence stays only in the explicitly selected CI artifact, never logs/fixtures/Library.
  remaining(batchDeadline, Date.now(), budgets.command);
  console.log(`Official Nissan compatibility batch: ${report.status}. ${integrationWarning}`);
  if (report.status !== 'passed-pending-desktop-frame-review-mobile-tablet-api-only') process.exitCode = 1;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();

/** CPU-only closed contract. Importing this module cannot start a browser or server. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const contract = 'official-nissan-embed-qa-20261014-v1';
export const repository = 'LethimCookMyBro/gtr-lab';
export const baselineCommit = '14668a99428bd995833317cf1fa66f4101922811';
export const baselineTree = '9ab4d5ba546a4da225be1f18f97fd6c1ae7cd538';
export const videoId = 'Ccklrg-mZyY';
export const publisher = 'https://global.nissannews.com/en/videos/video-0770352876ecd1a82c7d011f86007f37-nissan-gt-r-the-ultimate-high-speed-camera-car?channelsConstraint=channel-NNG244&firstResultIndex=16';
export const origin = 'http://127.0.0.1:4197';
export const liveOrigin = 'https://gtr-lab-production.up.railway.app';
export const token = '[stage-official-nissan-embed]';
export const requestPath = 'qa/official-nissan-embed-request.json';
export const sourcePaths = Object.freeze([
  '.github/workflows/official-nissan-embed-qa.yml',
  'qa/official-nissan-embed.md',
  'scripts/official-nissan-embed-page.mjs',
  'scripts/official-nissan-embed-policy.mjs',
  'scripts/official-nissan-embed.mjs',
  'tests/official-nissan-embed.node.mjs',
]);
export const allowedPaths = Object.freeze([...sourcePaths, requestPath].sort());
export const viewports = Object.freeze({
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
});
export const capturePolicy = Object.freeze({ viewport: 'desktop', maximumImages: 2, labels: Object.freeze(['visible-frame-1', 'visible-frame-2']) });
export function assertCaptureAllowed(name, label, attempts) {
  assert.equal(name, capturePolicy.viewport, 'Only desktop has approved visual evidence');
  assert.ok(Number.isInteger(attempts) && attempts >= 0 && attempts < capturePolicy.maximumImages, 'At most two capture attempts in the entire batch');
  assert.equal(label, capturePolicy.labels[attempts], 'Only the two fixed desktop frame labels are approved');
}
export function expectedLaneStatus(name) {
  assert.ok(Object.hasOwn(viewports, name));
  return name === capturePolicy.viewport ? 'passed-pending-human-frame-review' : 'passed-api-only-no-visual-proof';
}
export const budgets = Object.freeze({ batch: 240000, lane: 65000, navigation: 12000, ready: 15000, playing: 12000, sample: 4500, command: 4000, screenshot: 7000, cleanup: 5000, liveHeaders: 6000 });
export const qaCsp = "default-src 'none'; script-src 'self' https://www.youtube.com https://s.ytimg.com; style-src 'self'; frame-src https://www.youtube.com; connect-src 'none'; img-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export const integrationWarning = 'CI-local standalone compatibility only. Production currently disallows YouTube frame and API-script origins. A separate reviewed UI/CSP integration and production-origin verification are required; this probe is not live-film acceptance.';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function validateRequest(request, env, event) {
  assert.deepEqual(Object.keys(request).sort(), ['version', 'allow', 'contract', 'baselineCommit', 'baselineTree', 'videoId', 'publisher', 'origin', 'viewports', 'budgets', 'capturePolicy', 'sourceFiles'].sort());
  assert.equal(request.version, 1); assert.equal(request.allow, true);
  for (const [key, value] of Object.entries({ contract, baselineCommit, baselineTree, videoId, publisher, origin })) assert.equal(request[key], value, key);
  assert.deepEqual(request.viewports, viewports); assert.deepEqual(request.budgets, budgets); assert.deepEqual(request.capturePolicy, capturePolicy);
  assert.deepEqual(request.sourceFiles.map(file => file.path), sourcePaths);
  for (const file of request.sourceFiles) {
    assert.deepEqual(Object.keys(file).sort(), ['bytes', 'path', 'sha256']);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0);
    assert.match(file.sha256, /^[a-f0-9]{64}$/); assert.notEqual(file.sha256, '0'.repeat(64));
  }
  for (const [key, value] of Object.entries({ CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ATTEMPT: '1', R35_ALLOW_OFFICIAL_NISSAN_EMBED: '1' })) assert.equal(env[key], value, key);
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/); assert.notEqual(env.GITHUB_SHA, baselineCommit);
  assert.match(env.GITHUB_RUN_ID ?? '', /^\d+$/);
  for (const key of Object.keys(env).filter(key => key.startsWith('R35_'))) assert.ok(['R35_ALLOW_OFFICIAL_NISSAN_EMBED'].includes(key), `No source, target or deadline override: ${key}`);
  for (const key of ['HOME_QA_URL', 'PREVIEW_BASE_URL', 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH', 'NODE_OPTIONS']) assert.equal(env[key], undefined, `No runtime override: ${key}`);
  assert.equal(event.repository.full_name, repository); assert.equal(event.repository.id, 1399246874);
  assert.equal(event.ref, 'refs/heads/main'); assert.equal(event.before, baselineCommit); assert.equal(event.after, env.GITHUB_SHA);
  assert.equal(event.head_commit.id, env.GITHUB_SHA); assert.equal(event.deleted, false); assert.equal(event.forced, false);
  assert.ok(event.head_commit.message.includes(token)); assert.ok(!event.head_commit.message.includes('[release-'));
  return true;
}

export function validateRevision({ head, parents, parentTree, changed, status }, env) {
  assert.equal(head, env.GITHUB_SHA); assert.deepEqual(parents, [baselineCommit]); assert.equal(parentTree, baselineTree);
  assert.deepEqual(changed, allowedPaths.map(path => ({ status: 'A', path })));
  assert.equal(status, '', 'Source checkout must be clean');
}
export function providerFailure(code) {
  const labels = { 2: 'invalid-parameter', 5: 'html5-playback-error', 100: 'video-unavailable', 101: 'owner-disabled-embedding', 150: 'owner-disabled-embedding', 153: 'missing-client-identification' };
  return { code, kind: labels[code] ?? 'provider-error' };
}
export function remaining(deadline, now, cap) {
  const value = Math.min(cap, deadline - now);
  assert.ok(Number.isFinite(value) && value > 0, 'Absolute evidence deadline exhausted');
  return value;
}
export function assessPlaybackPair(first, second) {
  const observations = { ready: first.ready === true && second.ready === true, playing: first.state === 1 && second.state === 1, advancing: Number.isFinite(first.currentTime) && Number.isFinite(second.currentTime) && second.currentTime - first.currentTime >= 1, visible: first.ratio > .5 && second.ratio > .5, notTerminal: !first.terminal && !second.terminal };
  return { ...observations, passed: Object.values(observations).every(Boolean), deltaSeconds: second.currentTime - first.currentTime };
}
export function assessPausePair(first, second) {
  return { passed: first.state === 2 && second.state === 2 && first.ratio === 0 && second.ratio === 0 && Math.abs(second.currentTime - first.currentTime) <= .1 && !first.terminal && !second.terminal, deltaSeconds: second.currentTime - first.currentTime };
}
/** Compare pixels from two unmodified viewport screenshots. No provider DOM/media extraction. */
export function assessFramePair(first, second, rect) {
  assert.equal(first.width, second.width); assert.equal(first.height, second.height);
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width >= 200 && rect.height >= 200 && rect.x + rect.width <= first.width + 1 && rect.y + rect.height <= first.height + 1);
  let changed = 0, sum = 0, count = 0; const luminance = [[], []];
  // Excludes normal title/control edges and central loader, without altering the displayed player.
  for (let row = 0; row < 40; row++) for (let column = 0; column < 64; column++) {
    const u = .08 + (column + .5) / 64 * .84, v = .20 + (row + .5) / 40 * .52;
    if (u > .40 && u < .60 && v > .35 && v < .65) continue;
    const x = Math.floor(rect.x + rect.width * u), y = Math.floor(rect.y + rect.height * v), offset = (y * first.width + x) * 4;
    const delta = [0, 1, 2].reduce((n, component) => n + Math.abs(first.data[offset + component] - second.data[offset + component]), 0) / 3;
    if (delta >= 12) changed++; sum += delta; count++;
    for (const [index, frame] of [first, second].entries()) luminance[index].push(.2126 * frame.data[offset] + .7152 * frame.data[offset + 1] + .0722 * frame.data[offset + 2]);
  }
  const statistics = luminance.map(values => { const mean = values.reduce((a, b) => a + b, 0) / values.length; return { mean, stddev: Math.sqrt(values.reduce((n, v) => n + (v - mean) ** 2, 0) / values.length), range: Math.max(...values) - Math.min(...values) }; });
  const changedFraction = changed / count, meanAbsoluteDifference = sum / count;
  return { passed: changedFraction >= .08 && meanAbsoluteDifference >= 3 && statistics.every(row => row.stddev >= 3 && row.range >= 20), changedFraction, meanAbsoluteDifference, statistics, samples: count, scope: 'Actual visible PNG change outside normal controls and center loader; requires concurrent real PLAYING/currentTime evidence and human frame inspection. Not content recognition or proof of production compatibility.' };
}

/** Socket-free unit/adversarial checks. Actual browser evidence runs only in CI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const fixtureModule = await import('../scripts/render-backpressure-lifecycle-fixture.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
  throw error;
});

function setup(options = {}) {
  assert.ok(fixtureModule, 'The bounded native fence observation fixture must exist');
  let now = 0, mutation;
  const listeners = new Map(), canvases = [];
  let notice = false;
  class Canvas extends EventTarget {
    constructor(scene = true) { super(); this.isConnected = true; this.scene = scene; this.gl = new GL(this); canvases.push(this); }
    matches(selector) { return this.scene && this.isConnected && selector === '.scene-stage canvas'; }
    getContext(type) { assert(this instanceof Canvas); if (type === 'throw') throw new Error('native getContext'); return type === 'webgl2' ? this.gl : null; }
  }
  class GL {
    constructor(canvas) { this.canvas = canvas; this.ALREADY_SIGNALED = 0x911a; this.TIMEOUT_EXPIRED = 0x911b; this.CONDITION_SATISFIED = 0x911c; this.WAIT_FAILED = 0x911d; this.SYNC_GPU_COMMANDS_COMPLETE = 0x9117; this.nextResult = this.ALREADY_SIGNALED; this.calls = []; this.lost = false; }
    fenceSync(...args) { assert(this instanceof GL); this.calls.push(['fence', ...args]); if (this.fenceError) throw this.fenceError; return this.nullFence ? null : {}; }
    clientWaitSync(...args) { assert(this instanceof GL); this.calls.push(['wait', ...args]); if (this.waitError) throw this.waitError; return this.nextResult; }
    deleteSync(...args) { assert(this instanceof GL); this.calls.push(['delete', ...args]); if (this.deleteError) throw this.deleteError; return undefined; }
    isContextLost() { if (this.lossError) throw this.lossError; return this.lost; }
  }
  const noticeNode = { textContent: 'Rendering is taking longer than usual. You can keep waiting or retry the viewer.', getAttribute: () => 'status', querySelector: () => ({ textContent: 'Retry viewer' }) };
  const document = {
    documentElement: {},
    querySelectorAll(selector) { if (selector === '.scene-stage canvas') return canvases.filter(c => c.matches(selector)); if (selector === '.scene-notice') return notice ? [noticeNode] : []; throw new Error(`Unexpected query ${selector}`); },
    addEventListener(name, callback, capture) { listeners.set(name, { callback, capture }); },
  };
  const world = { HTMLCanvasElement: Canvas, WebGL2RenderingContext: GL, WeakRef, document, performance: { now: () => now },
    MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} },
    setTimeout() { throw new Error('Fixture must not schedule timers'); }, requestAnimationFrame() { throw new Error('Fixture must not force frames'); },
  };
  vm.runInNewContext(`(${fixtureModule.installRenderBackpressureLifecycleFixture.toString()})(${JSON.stringify(options)})`, world);
  const canvas = new Canvas(), gl = canvas.getContext('webgl2');
  return { world, canvas, gl, fixture: world.__r35RenderBackpressureLifecycle, canvases,
    tick(value) { now = value; }, newCanvas(scene = true) { const c = new Canvas(scene); c.getContext('webgl2'); return c; },
    notice(value) { notice = value; mutation(); },
    click({ trusted = true, name = 'Retry viewer', inNotice = true } = {}) {
      const button = { textContent: name, closest: selector => selector === '.scene-notice' && inNotice ? noticeNode : null };
      const listener = listeners.get('click'); assert.equal(listener.capture, true);
      listener.callback({ isTrusted: trusted, target: { closest: () => button } });
    },
  };
}
const copy = value => JSON.parse(JSON.stringify(value));

test('fixture preserves native results and never schedules rendering', () => {
  const h = setup(); assert.equal(h.canvas.getContext('webgl2'), h.gl); assert.equal(h.canvas.getContext('2d'), null);
  assert.throws(() => h.canvas.getContext('throw'), /native getContext/);
  const sync = h.gl.fenceSync(h.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  assert.equal(h.gl.clientWaitSync(sync, 0, 0), h.gl.ALREADY_SIGNALED);
  assert.equal(h.gl.deleteSync(sync), undefined);
  assert.deepEqual(copy(h.fixture.snapshot().issues), []);
  assert.equal(h.fixture.snapshot().fences[0].deleteCalls, 1);
});

test('fixture withholds only native positive results of one explicitly armed first scene owner', () => {
  const h = setup(); const other = h.newCanvas(false).gl;
  h.fixture.armCurrent('completion-clear'); const sync = h.gl.fenceSync(h.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  const otherSync = other.fenceSync(other.SYNC_GPU_COMMANDS_COMPLETE, 0);
  for (const native of [h.gl.ALREADY_SIGNALED, h.gl.CONDITION_SATISFIED, h.gl.TIMEOUT_EXPIRED, h.gl.WAIT_FAILED, null, undefined, 123]) {
    h.gl.nextResult = native;
    assert.equal(h.gl.clientWaitSync(sync, 0, 0), [h.gl.ALREADY_SIGNALED, h.gl.CONDITION_SATISFIED].includes(native) ? h.gl.TIMEOUT_EXPIRED : native);
  }
  assert.equal(other.clientWaitSync(otherSync, 0, 0), other.ALREADY_SIGNALED);
  assert.equal(h.gl.calls.filter(([kind]) => kind === 'wait').length, 7, 'Every native wait was called');
  const record = h.fixture.snapshot(); assert.equal(record.polls.filter(p => p.substituted).length, 2);
  assert.ok(record.polls.filter(p => p.substituted).every(p => p.contextId === record.firstSceneContextId));
  assert.throws(() => h.fixture.armCurrent('manual-retry'), /active|armed/);
  h.fixture.releaseCompletion(); h.gl.nextResult = h.gl.CONDITION_SATISFIED;
  assert.equal(h.gl.clientWaitSync(sync, 0, 0), h.gl.CONDITION_SATISFIED);
  const released = h.fixture.snapshot(); assert.equal(released.holds[0].releaseReason, 'completion-observed');
  assert.ok(released.polls.at(-1).sequence > released.holds[0].releasedSequence);
});

test('fixture never changes null fences, native exceptions, loss or deleted-sync polls into pending success', () => {
  const h = setup(); h.fixture.armCurrent('completion-clear');
  h.gl.nullFence = true; assert.equal(h.gl.fenceSync(1, 0), null); h.gl.nullFence = false;
  const sync = h.gl.fenceSync(1, 0); h.gl.lost = true;
  assert.equal(h.gl.clientWaitSync(sync, 0, 0), h.gl.ALREADY_SIGNALED); h.gl.lost = false;
  h.gl.waitError = new Error('native wait'); assert.throws(() => h.gl.clientWaitSync(sync, 0, 0), /native wait/); delete h.gl.waitError;
  h.gl.fenceError = new Error('native fence'); assert.throws(() => h.gl.fenceSync(1, 0), /native fence/); delete h.gl.fenceError;
  h.gl.deleteError = new Error('native delete'); assert.throws(() => h.gl.deleteSync(sync), /native delete/); delete h.gl.deleteError;
  h.gl.deleteSync(sync); h.gl.clientWaitSync(sync, 0, 0);
  assert.ok(h.fixture.snapshot().issues.some(issue => /deleted fence/.test(issue)));
  assert.equal(h.fixture.snapshot().polls.at(-1).substituted, false);
});

test('fixture disarms only on a trusted native Retry viewer capture-phase click, before later handlers', () => {
  const h = setup(); h.fixture.armCurrent('completion-clear'); const first = h.gl.fenceSync(1, 0); h.gl.clientWaitSync(first, 0, 0);
  h.fixture.releaseCompletion(); h.gl.clientWaitSync(first, 0, 0); h.gl.deleteSync(first);
  h.fixture.armCurrent('manual-retry'); const old = h.gl.fenceSync(1, 0); h.gl.clientWaitSync(old, 0, 0);
  for (const click of [{ trusted: false }, { name: 'Try again' }, { inNotice: false }]) { h.click(click); assert.equal(h.gl.clientWaitSync(old, 0, 0), h.gl.TIMEOUT_EXPIRED); }
  assert.throws(() => h.fixture.releaseCompletion(), /completion/);
  h.notice(true); h.click();
  assert.equal(h.gl.clientWaitSync(old, 0, 0), h.gl.ALREADY_SIGNALED, 'Native old disposal cannot inherit the hold after the capture listener');
  h.gl.deleteSync(old); h.canvas.isConnected = false;
  const replacement = h.newCanvas(); const fresh = replacement.gl.fenceSync(1, 0);
  assert.equal(replacement.gl.clientWaitSync(fresh, 0, 0), replacement.gl.ALREADY_SIGNALED);
  const s = h.fixture.snapshot(); assert.equal(s.holds[1].releaseReason, 'trusted-retry-capture'); assert.equal(s.retryClicks.length, 1);
  assert.equal(s.contexts[0].connected, false); assert.notEqual(s.contexts[0].id, s.contexts.at(-1).id);
  assert.throws(() => h.fixture.armCurrent('completion-clear'), /first|complete|two/);
});

test('fixture is bounded, weak-reference-only, cannot change the one-owner scope, and records notice chronology', () => {
  const h = setup({ maxRecords: 3 }); h.notice(true); h.notice(false);
  for (let i = 0; i < 8; i++) { const fence = h.gl.fenceSync(1, 0); h.gl.clientWaitSync(fence, 0, 0); h.gl.deleteSync(fence); }
  const s = h.fixture.snapshot(); assert.ok(s.issues.some(issue => /capacity/.test(issue))); assert.ok(s.polls.length <= 3);
  assert.deepEqual(copy(s.notices.map(n => n.pending)), [false, true, false]);
  const native = h.canvas.getContext('webgl2'); assert.equal(native, h.gl);
  assert.equal(JSON.stringify(s).includes('canvas'), false, 'Snapshots expose no retained canvas objects');
  assert.equal(Object.isFrozen(h.fixture), true);
});

const driverModule = await import('../scripts/diagnose-render-backpressure-lifecycle.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
  throw error;
});
const appRoot = new URL('..', import.meta.url).pathname;
async function reviewedEnvironment() {
  const request = JSON.parse(await readFile(new URL('../qa/dpr-motion-request.json', import.meta.url), 'utf8'));
  return { request, env: { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'LethimCookMyBro/gtr-lab', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GITHUB_SHA: 'a'.repeat(40),
    R35_SOURCE_SHA: 'a'.repeat(40), R35_EXPECTED_APP_TREE: request.sourceTree, R35_DPR_MODE: 'fixed', R35_QA_VIEWPORT: 'desktop', R35_ALLOW_DPR_MOTION_PROBE: '1',
    R35_DPR_COMMIT_MESSAGE: '[stage-dpr-motion] [stage-cabin-integration]', R35_DPR_GEOMETRY_CONTRACT: request.geometryContract, R35_DPR_APP_ROOT: appRoot } };
}
test('gate rejects local execution before file lookup or any runtime setup', async () => {
  assert.ok(driverModule, 'The strict CI-only actual-browser lifecycle driver must exist');
  await assert.rejects(driverModule.main({}), /CI-only/);
});
test('gate requires the exact render-backpressure request, source, both markers, and unchanged viewport contract', async () => {
  assert.ok(driverModule, 'The strict CI-only actual-browser lifecycle driver must exist');
  const { request, env } = await reviewedEnvironment();
  assert.equal(request.geometryContract, 'render-backpressure-2m-msaa-v1', 'Parent integration must pin the reviewed backpressure contract');
  const target = driverModule.validateBackpressureLifecycleEnvironment(env, request);
  assert.equal(target.geometry.sourceTree, request.sourceTree); assert.equal(target.geometry.maxBufferPixels, 2_000_000); assert.equal(target.geometry.maxDpr, 1.5);
  assert.deepEqual(target.geometry.contextCreation, { requestedAntialias: true, antialias: true, multisampled: true });
  for (const change of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_REF: 'refs/heads/dev' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' },
    { R35_DPR_COMMIT_MESSAGE: '[stage-dpr-motion]' }, { R35_DPR_COMMIT_MESSAGE: '[stage-cabin-integration]' }, { R35_DPR_COMMIT_MESSAGE: '' },
    { R35_DPR_GEOMETRY_CONTRACT: undefined }, { R35_DPR_GEOMETRY_CONTRACT: 'brake-index-lod-2m-msaa-v1' }, { R35_EXPECTED_APP_TREE: 'b'.repeat(64) },
    { R35_DPR_BASE_URL: 'https://example.com' }, { R35_DPR_MODE: 'baseline' }, { R35_QA_VIEWPORT: 'tablet' }, { R35_SOURCE_SHA: 'current' }, { R35_SOURCE_SHA: 'b'.repeat(40) }])
    assert.throws(() => driverModule.validateBackpressureLifecycleEnvironment({ ...env, ...change }, request));
  for (const change of [{ sourceTree: 'b'.repeat(64) }, { sourceSha: 'b'.repeat(40) }, { geometryContract: 'brake-index-lod-2m-msaa-v1' }, { mode: 'baseline' }, { version: 1 }, { allow: false }, { extra: true }])
    assert.throws(() => driverModule.validateBackpressureLifecycleEnvironment(env, { ...request, ...change }));
});
test('driver keeps dynamic browser/server imports behind identity, never adds app hooks, and preserves strict deadlines', async () => {
  assert.ok(driverModule, 'The strict CI-only actual-browser lifecycle driver must exist');
  const source = await readFile(new URL('../scripts/diagnose-render-backpressure-lifecycle.mjs', import.meta.url), 'utf8');
  const firstRuntimeImport = source.indexOf("await import('@playwright/test')");
  assert.ok(firstRuntimeImport > source.indexOf("'Built candidate source differs from reviewed identity'"));
  assert.ok(firstRuntimeImport > source.indexOf("'Candidate production source must be clean'"));
  assert.doesNotMatch(source, /import\s+.*from\s+['"](?:@playwright|.*server\.mjs)/);
  assert.match(source, /motionModelsForSource\(source.sha256\)/);
  assert.match(source, /captureWithTimeoutRetry/); assert.match(source, /timeout: 45_000, scale: 'css'/);
  assert.doesNotMatch(source, /readPixels|forceContextLoss\(|\.loseContext\(|requestAnimationFrame\(|\.invalidate\(|reducedMotion: 'reduce'|animations: 'disabled'|addScriptTag|__r3f|useConfigurator/);
  assert.match(source, /timeout: 90_000/); assert.match(source, /timeout: 15_000/); assert.match(source, /timeout: 5_000/);
  assert.match(source, /holds\.find\(h => h\.id === id\)\?\.substitutions > 0, hold\.id, \{ timeout: 30_000, polling: 50 \}/, 'First native completion uses the established bounded clean-key budget');
  assert.match(source, /after five seconds of pending native work/);
});

test('fixture tracks the uninterrupted pending prefix through native fence replacement', () => {
  const h = setup(); h.fixture.armCurrent('completion-clear');
  const first = h.gl.fenceSync(1, 0); h.gl.nextResult = h.gl.TIMEOUT_EXPIRED; h.gl.clientWaitSync(first, 0, 0);
  h.tick(4_000); const replacement = h.gl.fenceSync(1, 0); h.gl.deleteSync(first);
  h.gl.nextResult = h.gl.ALREADY_SIGNALED; h.gl.clientWaitSync(replacement, 0, 0); h.tick(5_000); h.notice(true);
  const s = h.fixture.snapshot(); assert.equal(s.fences[1].time, 4_000); assert.equal(s.fences[1].pendingPrefixTime, 0);
  assert.deepEqual(copy(s.fences[1].overlappedFenceIds), [s.fences[0].id]);
  assert.equal(s.notices.at(-1).time - s.fences[1].pendingPrefixTime, 5_000);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { resolveMotionRequest, validateMotionEnvironment, assessMotionEvidence } from '../scripts/dpr-motion-policy.mjs';
import { applicationIdentity, main } from '../scripts/diagnose-dpr-motion.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Reviewed brake-index derivative production identity: 88 files at original 2M+MSAA quality.
const tree = '6bdc7f056b9a0a58f37271423b020e4930b987ea43764620d95dd5bd2440795e';
const geometryContract = 'brake-index-lod-2m-msaa-v1';
const request = { version: 2, allow: true, mode: 'fixed', sourceSha: 'current', sourceTree: tree, geometryContract };
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'LethimCookMyBro/gtr-lab', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), GITHUB_EVENT_NAME: 'push', R35_DPR_COMMIT_MESSAGE: '[stage-dpr-motion] [stage-cabin-integration]', R35_QA_VIEWPORT: 'desktop' };
const rows = {
  desktop: [
    { viewportWidth: 1440, viewportHeight: 900, cssWidth: 1440, cssHeight: 744, nativeDpr: 2, width: 1967, height: 1016, attributeWidth: 1967, attributeHeight: 1016 },
    { viewportWidth: 1280, viewportHeight: 800, cssWidth: 1280, cssHeight: 644, nativeDpr: 2, width: 1920, height: 966, attributeWidth: 1920, attributeHeight: 966 },
  ],
  mobile: [
    { viewportWidth: 390, viewportHeight: 844, cssWidth: 390, cssHeight: 372, nativeDpr: 3, width: 585, height: 558, attributeWidth: 585, attributeHeight: 558 },
    { viewportWidth: 430, viewportHeight: 900, cssWidth: 430, cssHeight: 428, nativeDpr: 3, width: 645, height: 642, attributeWidth: 645, attributeHeight: 642 },
  ],
};
const phaseNames = ['exterior-idle-before', 'exterior-orbit', 'exterior-controls-rotating', 'exterior-idle-after', 'cabin-entry', 'cabin-look', 'cabin-seat-controls', 'cabin-idle', 'viewport-change', 'resized-cabin-look', 'resized-cabin-idle'];
const captureRows = [
  ['01-exterior-before', 'exterior-idle-before'], ['02-orbit-mid', 'exterior-orbit'], ['03-orbit-end', 'exterior-orbit'],
  ['04-controls-mid', 'exterior-controls-rotating'], ['05-controls-end', 'exterior-controls-rotating'], ['06-exterior-idle', 'exterior-idle-after'],
  ['07-cabin-driver', 'cabin-entry'], ['08-cabin-look-mid', 'cabin-look'], ['09-cabin-look-end', 'cabin-look'],
  ['10-cabin-seats', 'cabin-seat-controls'], ['11-cabin-idle', 'cabin-idle'], ['12-resized-look', 'resized-cabin-look'], ['13-resized-idle', 'resized-cabin-idle'],
];
const captures = () => captureRows.map(([label, phase], i) => ({ label, phase, blank: false, scene: { layout: 'same-mask', sha256: hash(String(i)) } }));
const fixture = viewport => {
  const dimensions = phaseNames.filter(name => name !== 'viewport-change').map(phase => ({ phase, contextId: 1, ...rows[viewport][phase.startsWith('resized-') ? 1 : 0] }));
  return { issues: [], events: [{ kind: 'canvas-write', phase: 'viewport-change', contextId: 1 }], contexts: [{ id: 1, sceneCanvas: true, connected: true, lostEvents: 0, restoredEvents: 0, creation: { phase: 'setup', contextType: 'webgl2', requestedAntialias: true, antialias: true, alpha: true, samples: 4, sampleBuffers: 1, defaultFramebufferBound: true, reads: 1, sequence: 1, time: 0 } }], dimensions,
    phases: phaseNames.map((name, i) => ({ name, stable: name !== 'viewport-change', sequence: 10 + i, time: 10 + i, contextId: 1, dimensions: dimensions.find(d => d.phase === name) })) };
};
const assess = (viewport = 'desktop', observation = fixture(viewport), pixels = captures()) => assessMotionEvidence({ mode: 'fixed', observation, pixels, geometryContract, sourceTree: tree, viewport });

test('brake index contract resolves only the exact reviewed tree, fixed mode, and literal commit', () => {
  const resolved = resolveMotionRequest(request, env);
  assert.equal(resolved.R35_SOURCE_SHA, env.GITHUB_SHA);
  const geometry = validateMotionEnvironment({ ...env, ...resolved }).geometry;
  assert.equal(geometry.name, geometryContract); assert.equal(geometry.sourceTree, tree);
  assert.equal(geometry.maxBufferPixels, 2_000_000); assert.equal(geometry.maxDpr, 1.5);
  assert.deepEqual(geometry.contextCreation, { requestedAntialias: true, antialias: true, multisampled: true });
  assert.equal(geometry.originalQualitySource.sourceTree, '0f78e2163e516652d976adb6ceccad0c8820016798a44b17d620e93d2701a0a8');
  for (const invalid of [null, {}, [], { ...request, extra: true }, ...[
    { version: 3 }, { version: '2' }, { version: 1 }, { allow: false }, { allow: 'true' },
    { sourceSha: 'HEAD' }, { sourceSha: 'current\n' }, { sourceTree: tree.toUpperCase() + ' ' }, { sourceTree: 'b'.repeat(64) },
    { mode: 'baseline', sourceSha: 'b'.repeat(40) }, { geometryContract: undefined }, { geometryContract: 'constructor' }, { geometryContract: '__proto__' },
    { geometryContract: 'pixel-budget-1m-v1' }, { geometryContract: 'msaa-off-2m-v1' }, { maxBufferPixels: 1_000_000 }, { antialias: false }, { captureTimeoutMs: 90_000 }, { baseUrl: 'https://example.com' },
  ].map(change => ({ ...request, ...change }))]) assert.throws(() => resolveMotionRequest(invalid, env));
  for (const key of Object.keys(request)) { const invalid = { ...request }; delete invalid[key]; assert.throws(() => resolveMotionRequest(invalid, env), key); }
  const legacy = { ...request, version: 1 }; delete legacy.geometryContract;
  assert.throws(() => resolveMotionRequest(legacy, env), /exact reviewed geometry/);
  const noContract = { ...resolved }; delete noContract.R35_DPR_GEOMETRY_CONTRACT;
  assert.throws(() => validateMotionEnvironment({ ...env, ...noContract }), /exact reviewed geometry/);
  assert.throws(() => assessMotionEvidence({ mode: 'fixed', sourceTree: tree, viewport: 'desktop', observation: fixture('desktop'), pixels: captures() }), /exact reviewed geometry/);
  for (const change of [{ R35_SOURCE_SHA: 'current' }, { R35_DPR_BASE_URL: 'http://127.0.0.1:4178' }, { R35_QA_VIEWPORT: 'tablet' }, { R35_DPR_MODE: 'baseline' }]) assert.throws(() => validateMotionEnvironment({ ...env, ...resolved, ...change }));
});

test('returned geometry cannot mutate the closed contract or historical contracts', () => {
  for (const [sourceTree, name] of [[tree, geometryContract], ['8c35f77f0d20e5679dade1e7dd8197ef493deef165b990672b510e9ea7e76145', 'msaa-off-2m-v1'], ['60c442f0d379d3c111393eda9337921b6df853ecf5b6e4024f7ce05d958ab930', 'pixel-budget-1m-v1']]) {
    const resolved = resolveMotionRequest({ ...request, sourceTree, geometryContract: name }, env);
    const geometry = validateMotionEnvironment({ ...env, ...resolved }).geometry;
    assert.throws(() => { geometry.initial.width = 1; }, TypeError);
    if (geometry.contextCreation) assert.throws(() => { geometry.contextCreation.antialias = false; }, TypeError);
    assert.notEqual(validateMotionEnvironment({ ...env, ...resolved }).geometry.initial.width, 1);
  }
});

for (const viewport of ['desktop', 'mobile']) {
  test(`${viewport}: accepts original 2M dimensions and all original captures`, () => {
    assert.deepEqual(assess(viewport).failures, []);
    const target = validateMotionEnvironment({ ...env, R35_QA_VIEWPORT: viewport, ...resolveMotionRequest(request, env) });
    assert.deepEqual(target.geometry.initial, rows[viewport][0]); assert.deepEqual(target.geometry.resized, rows[viewport][1]);
  });
  for (const phaseName of phaseNames) test(`${viewport}/${phaseName}: phase presence, order, stability, and geometry cannot be weakened`, () => {
    for (const mutate of [o => o.phases.splice(o.phases.findIndex(p => p.name === phaseName), 1), o => o.phases.push(o.phases.find(p => p.name === phaseName)), o => o.phases.reverse(), o => { const p = o.phases.find(p => p.name === phaseName); p.stable = !p.stable; }]) {
      const observation = fixture(viewport); mutate(observation); assert.ok(assess(viewport, observation).failures.length, phaseName);
    }
    if (phaseName === 'viewport-change') return;
    for (const field of Object.keys(rows[viewport][0])) for (const location of ['dimensions', 'phase']) for (const value of [undefined, null, NaN, 'wrong', rows[viewport][0][field] - 1]) {
      const observation = fixture(viewport);
      const sample = location === 'dimensions' ? observation.dimensions.find(d => d.phase === phaseName) : observation.phases.find(p => p.name === phaseName).dimensions = { ...observation.phases.find(p => p.name === phaseName).dimensions };
      sample[field] = value;
      assert.ok(assess(viewport, observation).failures.some(s => s.includes(`geometry contract ${field}`)), `${location}.${field}=${value}`);
    }
    const missing = fixture(viewport); missing.dimensions = missing.dimensions.filter(d => d.phase !== phaseName);
    assert.ok(assess(viewport, missing).failures.some(s => /dimension evidence missing/.test(s)));
    const writes = fixture(viewport); writes.events.push({ kind: 'canvas-write', phase: phaseName });
    assert.ok(assess(viewport, writes).failures.some(s => /write/.test(s)));
  });
}

test('native MSAA proof accepts different device sample counts without a fixed count assumption', () => {
  for (const samples of [2, 4, 8, 16, 32]) {
    const observation = fixture('desktop'); observation.contexts[0].creation.samples = samples;
    assert.deepEqual(assess('desktop', observation).failures, []);
  }
});

test('native MSAA proof rejects malformed, absent, zero, single-sample, late, or contradictory evidence', () => {
  const changes = [undefined, { antialias: false }, { requestedAntialias: false }, { antialias: 1 }, { requestedAntialias: 'true' }, { phase: 'exterior-orbit' }, { contextType: 'webgl' }, { defaultFramebufferBound: false }, { reads: 0 }, { reads: 2 }, { sequence: 0 }, { sequence: 10 }, { sequence: NaN }, { time: 11 }, { time: Infinity }];
  for (const field of ['samples', 'sampleBuffers']) for (const value of [null, undefined, false, '4', -1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) changes.push({ [field]: value });
  changes.push({ samples: 1 }, { samples: 0, sampleBuffers: 0 });
  for (const change of changes) {
    const observation = fixture('desktop'); if (change === undefined) delete observation.contexts[0].creation; else Object.assign(observation.contexts[0].creation, change);
    assert.ok(assess('desktop', observation).failures.some(s => /creation evidence/.test(s)), JSON.stringify(change));
  }
  for (const key of Object.keys(fixture('desktop').contexts[0].creation).filter(k => k !== 'alpha')) {
    const observation = fixture('desktop'); delete observation.contexts[0].creation[key];
    assert.ok(assess('desktop', observation).failures.some(s => /creation evidence/.test(s)), key);
  }
  for (const key of ['time', 'sequence']) for (const value of [undefined, NaN, -1]) {
    const observation = fixture('desktop'); observation.phases.at(-1)[key] = value;
    assert.ok(assess('desktop', observation).failures.some(s => /creation evidence/.test(s)));
  }
});

test('scene churn, observer errors and blank samples still fail the original acceptance', () => {
  for (const change of [{ lostEvents: 1 }, { restoredEvents: 1 }, { connected: false }, { sceneCanvas: false }]) {
    const observation = fixture('desktop'); Object.assign(observation.contexts[0], change); assert.ok(assess('desktop', observation).failures.length);
  }
  const duplicate = fixture('desktop'); duplicate.contexts.push({ ...duplicate.contexts[0], id: 2 }); assert.ok(assess('desktop', duplicate).failures.length);
  const issues = fixture('desktop'); issues.issues.push('observer overflow'); assert.ok(assess('desktop', issues).failures.includes('observer overflow'));
  for (const index of captureRows.keys()) {
    const blank = captures(); blank[index].blank = true; assert.ok(assess('desktop', fixture('desktop'), blank).failures.some(s => /blank/.test(s)));
  }
});

test('every exact capture label and phase is mandatory, ordered, and nonblank', () => {
  for (const index of captureRows.keys()) for (const mutate of [p => p.splice(index, 1), p => p.push(p[index]), p => { p[index].label = 'substitute'; }, p => { p[index].phase = 'other-phase'; }, p => { delete p[index].blank; }]) {
    const pixels = captures(); mutate(pixels); assert.ok(assess('desktop', fixture('desktop'), pixels).failures.some(s => /capture/i.test(s)), String(index));
  }
  assert.ok(assess('desktop', fixture('desktop'), captures().reverse()).failures.some(s => /capture/i.test(s)));
});

test('candidate request and complete production identity match the new closed contract', async () => {
  assert.deepEqual(JSON.parse(await readFile(new URL('../qa/dpr-motion-brake-index-request.json', import.meta.url), 'utf8')), request);
  const identity = JSON.parse(await readFile(new URL('../qa/fixtures/dpr-motion-brake-index-identity.json', import.meta.url), 'utf8'));
  assert.equal(identity.sha256, tree);
  assert.equal(hash(JSON.stringify(identity.files)), tree);
});

test('identity guard runs before any browser, server, or candidate runtime setup', async () => {
  await assert.rejects(main({}), /CI-only/);
  const resolved = resolveMotionRequest(request, env);
  await assert.rejects(main({ ...env, ...resolved, R35_DPR_APP_ROOT: new URL('..', import.meta.url).pathname, R35_EXPECTED_APP_TREE: 'b'.repeat(64), R35_DPR_GEOMETRY_CONTRACT: undefined }), /reviewed identity/);
  const root = await mkdtemp(join(tmpdir(), 'batching-identity-'));
  try {
    await mkdir(join(root, 'src'));
    for (const name of ['src/a.ts', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'server.mjs']) await writeFile(join(root, name), name);
    const original = await applicationIdentity(root);
    for (const file of original.files) {
      await writeFile(join(root, file.path), file.path + '-changed'); assert.notEqual((await applicationIdentity(root)).sha256, original.sha256); await writeFile(join(root, file.path), file.path);
    }
    await symlink(join(root, 'index.html'), join(root, 'src/link.ts'));
    await assert.rejects(applicationIdentity(root), /symlink/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('full original native inputs, captures, settles and screenshot deadlines remain byte-identical', async () => {
  const driver = await readFile(new URL('../scripts/diagnose-dpr-motion.mjs', import.meta.url), 'utf8');
  const block = driver.slice(driver.indexOf('    const mark = async'), driver.indexOf("    report.result = 'collected';"));
  assert.equal(hash(block), 'bebd31ecb55f48c538c69bc647733e7eda0a792be8777c846c75361cab51f03c');
  assert.match(block, /timeout: 45_000, scale: 'css'/); assert.match(block, /maxAttempts: 2, timeoutMs: 45_000/);
  assert.deepEqual([...block.matchAll(/await capture\('([^']+)'\)/g)].map(m => m[1]), captureRows.map(([label]) => label));
  assert.deepEqual([...block.matchAll(/await mark\('([^']+)', (true|false)\)/g)].map(m => [m[1], m[2] === 'true']), phaseNames.map(name => [name, name !== 'viewport-change']));
  assert.match(driver, /observeContextCreation:\$\{Boolean\(target\.geometry\?\.contextCreation\)\}/);
  assert.doesNotMatch(driver, /animations: 'disabled'|reducedMotion: 'reduce'|preserveDrawingBuffer|readPixels\(/);
});

test('screenshot recovery makes at most two unchanged 45-second attempts and never retries input failures', async () => {
  const source = await readFile(new URL('../scripts/diagnose-configurator-controls.mjs', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('export async function captureWithTimeoutRetry'), source.indexOf('export async function auditCabinPreviewAvailability'));
  const retry = vm.runInNewContext('(' + block.replace('export ', '').trim() + ')');
  const timeout = Object.assign(new Error('page.screenshot: Timeout 45000ms exceeded.'), { name: 'TimeoutError' });
  let attempts = 0, notifications = 0;
  assert.equal(await retry(async () => { attempts++; if (attempts === 1) throw timeout; return 'bytes'; }, () => { notifications++; }), 'bytes');
  assert.equal(attempts, 2); assert.equal(notifications, 1);
  attempts = 0; notifications = 0;
  await assert.rejects(retry(async () => { attempts++; throw timeout; }, () => { notifications++; }), /45000/);
  assert.equal(attempts, 2); assert.equal(notifications, 1);
  for (const error of [new Error('readback failed'), Object.assign(new Error('locator.click: Timeout 45000ms exceeded.'), { name: 'TimeoutError' }), Object.assign(new Error('page.screenshot: other failure'), { name: 'TimeoutError' })]) {
    attempts = 0; notifications = 0;
    await assert.rejects(retry(async () => { attempts++; throw error; }, () => { notifications++; }));
    assert.equal(attempts, 1); assert.equal(notifications, 0);
  }
});

test('every original performance, flicker, pointer, error and resource threshold remains byte-identical', async () => {
  const driver = await readFile(new URL('../scripts/diagnose-dpr-motion.mjs', import.meta.url), 'utf8');
  const acceptance = driver.slice(driver.indexOf("        for (const name of ['exterior-orbit'"), driver.indexOf('        if (report.assessment.failures.length)'));
  assert.equal(hash(acceptance), 'e0ec5464e5f58becb7accb9ccd7b9a0ff04b2e4debcbe3af643bbba7e4425d74');
  const setup = driver.slice(driver.indexOf('    browser = await chromium.launch'), driver.indexOf('    // One init script'));
  assert.equal(hash(setup), '476b30426f84903ab21bb590228786f86a8d0e47a766514bfdbe2ae796062b24');
  const policy = await readFile(new URL('../scripts/dpr-motion-policy.mjs', import.meta.url), 'utf8');
  const fixed = policy.slice(policy.indexOf('  const stable = new Map'), policy.indexOf('/** The scene hash'));
  assert.equal(hash(fixed), '92a846fb52455f0ccf74a2f2fa198a78be8d0d4cbd2c2230f4c0278454f017c2');
  assert.equal(hash(policy.slice(policy.indexOf('/** The scene hash'))), 'b1e18e4d7beb82179cb278eb9772efa715cac7ce2f09687f28ed1c8415d374c3');
  const helper = await readFile(new URL('../scripts/diagnose-configurator-controls.mjs', import.meta.url), 'utf8');
  const retry = helper.slice(helper.indexOf('export async function captureWithTimeoutRetry'), helper.indexOf('export async function auditCabinPreviewAvailability'));
  assert.equal(hash(retry), 'ffad5a0043c084139c48b53edae7671aff46b5825c981d3a9a92da8b3b98011f');
});

test('new full-motion evidence cannot substitute unbound contexts or reverse setup/phase chronology', () => {
  for (const change of [
    o => { o.contexts[0].id = 2; },
    o => { o.contexts[0].id = '1'; },
    o => { delete o.contexts[0].lostEvents; },
    o => { delete o.contexts[0].restoredEvents; },
    o => { o.contexts[0].connected = 1; },
    o => { o.contexts[0].creation.time = -1; },
    o => { o.phases.at(-1).sequence = o.phases.at(-2).sequence; },
    o => { o.phases.at(-1).time = o.phases.at(-2).time - 1; },
    o => { const phase = o.phases.find(p => p.name === 'cabin-look'); phase.contextId = 2; phase.dimensions.contextId = 2; },
  ]) {
    const observation = fixture('desktop'); change(observation);
    assert.ok(assess('desktop', observation).failures.length);
  }
});


test('the new candidate requires both staging markers before any setup', () => {
  for (const message of ['', '[stage-dpr-motion]', '[stage-cabin-integration]', '[stage-dpr-motion] [release-real-environments]'])
    assert.throws(() => resolveMotionRequest(request, { ...env, R35_DPR_COMMIT_MESSAGE: message }));
});

test('only the model URL and accurate modification disclosure change the production identity', async () => {
  const original = JSON.parse(await readFile(new URL('../qa/fixtures/dpr-motion-static-studio-identity.json', import.meta.url), 'utf8'));
  assert.equal(hash(JSON.stringify(original.files)), original.sha256);
  assert.equal(original.sha256, '6353f4929c3c9ef3387a0cedfa43d53e685d08592ca43a307304eac1e76a4261');
  const current = JSON.parse(await readFile(new URL('../qa/fixtures/dpr-motion-brake-index-identity.json', import.meta.url), 'utf8'));
  assert.equal(current.sha256, tree);
  assert.equal(hash(JSON.stringify(current.files)), tree);
  assert.deepEqual(current.files.map(row => row.path), original.files.map(row => row.path));
  assert.deepEqual(current.files.filter((row, i) => row.sha256 !== original.files[i].sha256).map(row => row.path), ['src/data/models.ts']);
});

test('historical source-pinned motion retains the original exterior while the candidate proves the derivative', async () => {
  const policy = await import('../scripts/dpr-motion-policy.mjs');
  assert.equal(typeof policy.motionModelsForSource, 'function');
  const original = policy.motionModelsForSource('6353f4929c3c9ef3387a0cedfa43d53e685d08592ca43a307304eac1e76a4261');
  const candidate = policy.motionModelsForSource(tree);
  assert.deepEqual(candidate[1], { path: '/models/ciasny-r35-brake-index-e9425289.glb', bytes: 8566388, sha256: 'e942528980753f9dea6218bdf50ab943b13974b288faf2fd2305984b600fb1c9' });
  assert.deepEqual(original[1], { path: '/models/ciasny-r35.glb', bytes: 8296356, sha256: 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d' });
  assert.deepEqual(candidate.filter((_, i) => i !== 1), original.filter((_, i) => i !== 1));
  assert.throws(() => { candidate[1].sha256 = 'b'.repeat(64); }, TypeError);
  const driver = await readFile(new URL('../scripts/diagnose-dpr-motion.mjs', import.meta.url), 'utf8');
  assert.match(driver, /motionModelsForSource\(source.sha256\)/);
  assert.doesNotMatch(driver, /cabin-integration-policy/);
});

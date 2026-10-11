/** Private diagnostic only. Pure policy: no browser, server, socket, or writes. */
import assert from 'node:assert/strict';
import { limits } from './drained-key-policy.mjs';
export { limits };
export const contractId = 'r35-same-runner-pixel-cost-abba-v1';
export const baseline = Object.freeze({ sha: 'f18e7b0ff04d2dc6f67b4f4184c65a1a9ae2fbe0', tree: 'd37a85b85db277453e836dddec2ff0472235aec791a54e1bbdb4124c9eb575b6' });
// Immutable one-line diagnostic source; the request remains disabled pending harness review.
export const candidate = Object.freeze({ sha: 'da9ca630b359a2733c41505c64d9f14a45faa013', tree: '4d062f978565df292bbed256c30211966304a3df48a65261b09402c3fd20e7fc' });
export const trialOrder = Object.freeze(['A', 'B', 'B', 'A']);
export const modelPins = Object.freeze([
  Object.freeze({ path: '/models/ciasny-r35.glb', bytes: 8_296_356, sha256: 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d' }),
  Object.freeze({ path: '/models/r35-exterior-cabin-proxy-49d7c2ab.glb', bytes: 956_368, sha256: '49d7c2ab44461e33ce6621287089eb4a9d54c50ebc339a2932f587ce3d355347' }),
]);
export function geometryForLane(lane) {
  assert(['A', 'B'].includes(lane));
  return { nativeDpr: 2, viewport: { width: 1440, height: 900 }, canvas: { x: 0, y: 0, width: 1440, height: 744 },
    buffer: lane === 'A' ? { width: 1967, height: 1016 } : { width: 1391, height: 718 } };
}
export function validateRasterEnvironment(env) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Raster-cost diagnostic is CI-only');
  assert.equal(env.GITHUB_REPOSITORY, 'LethimCookMyBro/gtr-lab');
  assert.equal(env.GITHUB_REF, 'refs/heads/main'); assert.equal(env.GITHUB_EVENT_NAME, 'push');
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/);
  assert((env.R35_RASTER_COMMIT_MESSAGE ?? '').includes('[stage-raster-cost]'));
  assert.equal(env.R35_ALLOW_RASTER_COST, '1');
  assert.match(candidate.sha ?? '', /^[a-f0-9]{40}$/, 'Candidate source publication is not reviewed/bound');
  for (const name of ['R35_DRAINED_KEY_BASE_URL', 'R35_RASTER_BASE_URL', 'DEBUG', 'DEBUG_FILE', 'PLAYWRIGHT_LEGACY_SCREENSHOT']) assert.equal(env[name], undefined);
  assert(/^[1-4]$/.test(env.R35_RASTER_TRIAL ?? ''), 'Only four fixed interleaved trials allowed');
  const trial = Number(env.R35_RASTER_TRIAL), lane = trialOrder[trial - 1];
  assert.equal(env.R35_RASTER_LANE, lane); const source = lane === 'A' ? baseline : candidate;
  assert.equal(env.R35_DRAINED_KEY_SOURCE_SHA, source.sha); assert.equal(env.R35_DRAINED_KEY_SOURCE_TREE, source.tree);
  assert.equal(env.R35_DRAINED_KEY_APP_ROOT, lane === 'A' ? 'baseline' : 'candidate');
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) assert(/^\d+$/.test(env[key] ?? ''), `Exact ${key} required`);
  assert.equal(env.GITHUB_JOB, 'measure'); assert(env.RUNNER_NAME && env.RUNNER_OS === 'Linux' && env.RUNNER_ARCH === 'X64');
  return { baseUrl: 'http://127.0.0.1:4178', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
    trial, lane, contract: { id: contractId, source, models: modelPins }, expectedGeometry: geometryForLane(lane),
    output: `raster-cost-results/trial-${trial}-${lane}` };
}
export function resolveRasterRequest(request) {
  assert.deepEqual(Object.keys(request).sort(), ['allow', 'baseline', 'candidate', 'contract', 'version']);
  assert.equal(request.version, 1); assert.equal(request.allow, true);
  assert.equal(request.contract, contractId); assert.deepEqual(request.baseline, baseline); assert.deepEqual(request.candidate, candidate);
  assert.match(candidate.sha ?? '', /^[a-f0-9]{40}$/, 'Candidate source publication is not reviewed/bound');
  return { R35_ALLOW_RASTER_COST: '1', R35_RASTER_BASELINE_SHA: baseline.sha, R35_RASTER_CANDIDATE_SHA: candidate.sha };
}
/** Same original health assessment, except the reviewed per-lane geometry is explicit. */
export function assessRasterObservation(o, lane) {
  const failures = [...(o?.issues ?? ['Missing observer'])], expected = geometryForLane(lane).buffer;
  if (o?.version !== 2 || !o.stopped || o.stopReason !== 'scenario-ended') failures.push('Final observer not cleanly stopped');
  const contexts = o?.contexts ?? [];
  if (contexts.filter(c => c.sceneCanvas).length !== 1 || contexts.some(c => c.nativeContextLost || c.lostEvents || c.restoredEvents)) failures.push('Healthy single scene context required');
  if (o?.keys?.length !== 3) failures.push('Three native-key epochs required');
  for (const k of o?.keys ?? []) {
    if (k.keydowns.length !== 1 || !k.keydowns[0].isTrusted || k.keydowns[0].repeat || !k.keydowns[0].focused) failures.push(`Key ${k.index} lacks one trusted focused native event`);
    if (!(o?.frames ?? []).some(f => f.keyIndex === k.index)) failures.push(`Key ${k.index} lacks an actual draw RAF`);
  }
  for (const f of o?.frames ?? []) if (f.status !== 'signaled' || !f.callbackReturned || !f.deleted) failures.push(`Draw RAF ${f.id} incomplete`);
  for (const cp of o?.checkpoints ?? []) if (cp.status !== 'signaled' || !cp.deleted) failures.push(`Checkpoint ${cp.id} incomplete`);
  if ((o?.frames ?? []).some(f => f.phase !== 'loading' && (f.bufferWidth !== expected.width || f.bufferHeight !== expected.height))) failures.push('Stable native geometry differs from the exact lane');
  return { status: failures.length ? 'incomplete' : 'collected', originalAcceptanceChanged: false, failures,
    actualDrawRafs: o?.frames?.length ?? 0, checkpoints: o?.checkpoints?.length ?? 0 };
}
export function sceneStateOnly(snapshot) {
  assert(snapshot?.live === true); assert(snapshot.pose && snapshot.camera && snapshot.vehicle, 'Complete production state required');
  assert.equal(snapshot.camera.settled, true);
  const { dimensions, ...state } = snapshot;
  assert(dimensions); const { width, height, pixelRatio, ...cssAndRenderSize } = dimensions;
  return { ...state, dimensions: cssAndRenderSize }; // Only the treatment's backing dimensions/DPR may differ.
}
export function msaaProof(creation) {
  assert.equal(creation?.phase, 'setup'); assert.equal(creation?.contextType, 'webgl2');
  assert.equal(creation?.requestedAntialias, true); assert.equal(creation?.antialias, true);
  assert.equal(creation?.defaultFramebufferBound, true); assert.equal(creation?.reads, 1);
  assert(Number.isSafeInteger(creation.samples) && creation.samples >= 2);
  assert(Number.isSafeInteger(creation.sampleBuffers) && creation.sampleBuffers >= 1);
  const { time, sequence, ...proof } = creation; return proof;
}
const median = values => { const a = [...values].sort((a, b) => a - b); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
const cleanKey = key => {
  assert(['one-scene-raf-clean-entry-prefix', 'one-scene-raf-with-outside-work'].includes(key?.classification), 'Exactly one clean-entry draw RAF with accounted bookkeeping required');
  assert.equal(key.actualDrawRafs, 1); assert.equal(key.frames.length, 1);
  const f = key.frames[0]; assert.equal(f.status, 'signaled');
  for (const name of ['calls', 'triangles', 'callbackStartedAt', 'callbackEndedAt', 'fenceCallStartedAt', 'observedSignaledAt', 'observableLatencyLowerMs', 'observableLatencyUpperMs']) assert(Number.isFinite(f[name]), `Missing ${name}`);
  assert(f.calls > 0 && f.triangles > 0 && f.observableLatencyUpperMs >= f.observableLatencyLowerMs);
  assert(f.observedSignaledAt >= key.keydown.at);
  return f;
};
/** Separate attribution, never rewrites the historical observer/classifier's raw result. */
export function classifyRasterPrefix(report, keyOffset) {
  const key = report.keyPrefixes[keyOffset], frame = cleanKey(key);
  const before = report.stateSnapshots[keyOffset], after = report.stateSnapshots[keyOffset + 1];
  assert.equal(key.keydown.cleanCheckpoint, true); assert.equal(key.workBeforeKeydown, 0);
  assert.equal(key.firstPostKeyWork?.cleanCheckpoint, true); assert.equal(key.firstPostKeyWork?.inRaf, true);
  const entry = report.frameEntryEvidence.find(e => e.id === frame.id);
  assert.equal(entry?.entryCleanCheckpoint, true); assert.equal(entry?.entryCheckpointId, key.checkpointId);
  const delta = {};
  for (const method of new Set([...Object.keys(before.outsideRafMethods), ...Object.keys(after.outsideRafMethods)])) {
    const count = (after.outsideRafMethods[method] ?? 0) - (before.outsideRafMethods[method] ?? 0);
    assert(Number.isSafeInteger(count) && count >= 0); if (count) delta[method] = count;
  }
  assert.equal(after.outsideRafDrawCalls - before.outsideRafDrawCalls, 0);
  assert.equal(Object.values(delta).reduce((a, b) => a + b, 0), key.outsideWorkAfterKeydown);
  const gate = report.gates[keyOffset + 1], checkpoint = gate.attempts.find(c => c.id === gate.checkpointId);
  assert(checkpoint?.status === 'signaled' && !checkpoint.stale);
  const fences = report.stateEvidence.nativeFences.filter(f => f.draws.includes(after.main.id));
  assert.equal(fences.length, 1, 'One production completion fence for the actual main required');
  const fence = fences[0]; assert.deepEqual(fence.draws, [after.main.id]); assert.equal(fence.previous, null);
  assert(fence.createdAt >= after.main.at && fence.createdAt <= frame.callbackEndedAt);
  assert([0x911a, 0x911c].includes(fence.positive?.status)); assert(fence.positive.at >= fence.createdAt);
  assert.equal(fence.retirement?.reason, 'signaled'); assert(fence.retirement.at >= fence.positive.at);
  assert(fence.retirement.at <= checkpoint.fenceCallStartedAt, 'Production retirement must precede the new checkpoint');
  // Source-pinned retireFence emits the event then synchronously deleteSyncs its owned sync.
  // Count equality plus this immutable call order accounts for bookkeeping, not new rendering.
  if (key.classification === 'one-scene-raf-with-outside-work') {
    assert.deepEqual(delta, { deleteSync: 1 }, 'Only one exactly matched signaled-sync retirement may explain outside work');
    assert(fence.retirement.at >= frame.callbackEndedAt);
  } else assert.deepEqual(delta, {});
  return { rawClassification: key.classification, attribution: key.classification === 'one-scene-raf-with-outside-work'
    ? 'one-draw-raf-plus-matched-signaled-sync-retirement' : 'one-draw-raf-clean-entry-prefix',
    outsideRafMethodsDelta: delta, productionFenceId: fence.id, positiveWait: fence.positive, signaledRetirement: fence.retirement,
    interpretation: 'Observable app-command prefix with explicit scheduler bookkeeping; not isolated raster or GPU time.' };
}
/** Describe paired observations only. This never emits a release/FPS/performance pass. */
export function compareRasterTrials(reports) {
  const failures = [], pairs = [];
  try {
    assert.match(candidate.sha ?? '', /^[a-f0-9]{40}$/, 'Candidate source publication is not reviewed/bound');
    assert.equal(reports.length, 4); const first = reports[0];
    for (let i = 0; i < reports.length; i++) {
      const r = reports[i], lane = trialOrder[i], source = lane === 'A' ? baseline : candidate;
      assert.equal(r.trial, i + 1); assert.equal(r.lane, lane); assert.equal(r.sourceContract, contractId); assert.equal(r.cleanupConfirmed, true);
      assert.equal(r.sourceCommit, source.sha); assert.equal(r.sourceTree, source.tree); assert.equal(r.result, 'observed');
      assert.equal(r.assessment?.status, 'collected'); assert.deepEqual(r.assessment.failures, []);
      assert.equal(r.harnessCommit, first.harnessCommit); assert.match(r.harnessCommit ?? '', /^[a-f0-9]{40}$/);
      assert(r.runnerIdentity?.hostname && r.runnerIdentity?.runId && r.runnerIdentity?.runAttempt && r.runnerIdentity?.job === 'measure');
      assert.deepEqual(r.runnerIdentity, first.runnerIdentity, 'All trials must share one actual runner/job');
      assert.equal(r.browserVersion, '153.0.8010.12'); assert.equal(r.browserVersion, first.browserVersion);
      assert.deepEqual(r.normalizedBrowserArguments, first.normalizedBrowserArguments); assert(r.normalizedBrowserArguments?.length > 0);
      assert.deepEqual(r.backend, first.backend); assert.match(JSON.stringify(r.backend), /SwiftShader/i);
      assert.deepEqual(msaaProof(r.contextCreation), msaaProof(first.contextCreation));
      assert.equal(r.requestedContextAttributes?.antialias, true);
      assert.deepEqual(r.requestedContextAttributes, first.requestedContextAttributes);
      assert(r.geometry.length >= 6);
      for (const row of r.geometry) { const { phase, reducedMotion, ...g } = row; assert.equal(reducedMotion, false); assert.deepEqual(g, geometryForLane(lane)); }
      assert.equal(r.gates?.length, 4); assert(r.gates.every(g => g.status === 'clean'));
      assert.equal(r.captures?.length, 1); assert.equal(r.captures[0].result, 'captured'); assert.equal(r.captures[0].prefixUnchangedDuringCapture, true);
      assert.match(r.captures[0].sha256 ?? '', /^[a-f0-9]{64}$/); assert.equal(r.captures[0].pixels?.blank, false);
      assert.equal(r.stateSnapshots?.length, 4); assert.equal(r.stateEvidence?.issues?.length, 0);
      assert.equal(r.keyPrefixes?.length, 3); r.keyPrefixes.forEach(cleanKey);
      for (let k = 0; k < 3; k++) classifyRasterPrefix(r, k);
      for (let k = 0; k < 3; k++) {
        const current = cleanKey(r.keyPrefixes[k]), original = cleanKey(first.keyPrefixes[k]);
        assert.equal(current.calls, original.calls, 'Draw workload differs across the four trials');
        assert.equal(current.triangles, original.triangles, 'Triangle workload differs across the four trials');
      }
      assert(r.sharedRuntimeAssets?.length >= 2); assert.deepEqual(r.sharedRuntimeAssets, first.sharedRuntimeAssets, 'Loaded model/environment/texture/font bodies must match');
      assert.deepEqual(r.pageErrors, []); assert.deepEqual(r.requestFailures, []);
      assert(r.console.every(row => row.type !== 'error'));
      for (let s = 0; s < 4; s++) {
        const state = r.stateSnapshots[s];
        assert.equal(state.main?.stable, true); assert.equal(state.pending, false);
        assert(Number.isSafeInteger(state.main.id) && state.main.id > 0);
        assert.deepEqual(sceneStateOnly(state.snapshot), sceneStateOnly(first.stateSnapshots[s].snapshot), 'Same camera, projection, vehicle and scene state at every checkpoint required');
        if (s > 0) {
          const key = r.keyPrefixes[s - 1], f = key.frames[0];
          assert(state.main.id > r.stateSnapshots[s - 1].main.id);
          assert(state.main.at > key.keydown.at && state.main.at >= f.callbackStartedAt && state.main.at <= f.callbackEndedAt, 'Checkpoint state must be the actual new main draw inside the measured RAF');
          assert(state.main.at <= f.observedSignaledAt);
        }
      }
    }
    for (const [aIndex, bIndex] of [[0, 1], [3, 2]]) {
      const a = reports[aIndex], b = reports[bIndex];
      for (let k = 0; k < 3; k++) {
        assert.equal(a.keyPrefixes[k].index, k + 1); assert.equal(b.keyPrefixes[k].index, k + 1);
        const x = cleanKey(a.keyPrefixes[k]), y = cleanKey(b.keyPrefixes[k]);
        assert.equal(x.calls, y.calls, 'Draw workload mismatch'); assert.equal(x.triangles, y.triangles, 'Triangle workload mismatch');
        const record = (r, f) => ({ trial: r.trial, calls: f.calls, triangles: f.triangles,
          inputToObservedCompletionMs: f.observedSignaledAt - r.keyPrefixes[k].keydown.at,
          callbackWallMs: f.callbackEndedAt - f.callbackStartedAt,
          fenceCompletionBracketMs: [f.observableLatencyLowerMs, f.observableLatencyUpperMs],
          keyGateWallMs: r.gates[k + 1].elapsedMs });
        const A = record(a, x), B = record(b, y);
        assert(A.inputToObservedCompletionMs > 0);
        pairs.push({ key: k + 1, A, B, attributionA: classifyRasterPrefix(a, k), attributionB: classifyRasterPrefix(b, k), inputCompletionRatioBoverA: B.inputToObservedCompletionMs / A.inputToObservedCompletionMs });
      }
    }
  } catch (error) { failures.push(error.message); }
  const complete = failures.length === 0 && pairs.length === 6;
  const trialSummaries = complete ? reports.map(r => ({ trial: r.trial, lane: r.lane,
    keyInputToCompletionMs: r.keyPrefixes.map(k => k.frames[0].observedSignaledAt - k.keydown.at),
    medianInputToCompletionMs: median(r.keyPrefixes.map(k => k.frames[0].observedSignaledAt - k.keydown.at)),
    screenshotElapsedMs: r.captures[0].screenshotElapsedMs })) : [];
  const orderDrift = complete ? [[0, 3], [1, 2]].map(([a, b]) => ({ lane: reports[a].lane, firstTrial: a + 1, laterTrial: b + 1,
    laterOverFirstByKey: trialSummaries[a].keyInputToCompletionMs.map((v, k) => trialSummaries[b].keyInputToCompletionMs[k] / v) })) : [];
  return { contract: contractId, status: complete ? 'paired-observation' : 'incomplete', originalAcceptanceChanged: false,
    actualPixels: { A: 1967 * 1016, B: 1391 * 718, ratioBoverA: (1391 * 718) / (1967 * 1016) },
    descriptiveMedianInputCompletionRatioBoverA: complete ? median(pairs.map(p => p.inputCompletionRatioBoverA)) : null,
    trialSummaries, orderDrift, pairs, failures, interpretation: 'Four trials with three within-trial native-key samples each, six descriptive matched pairs on one SwiftShader runner. ABBA balances linear drift only; inspect same-lane order drift. Command-prefix wall-clock completion includes browser scheduling, explicit production/internal submission, fence scope and observation delay. MSAA is queried at context creation, not after every framebuffer resize. No pure raster/GPU time, hardware FPS, general statistical significance, visual-quality acceptance, or release acceptance is inferred. Review all four actual PNGs.' };
}

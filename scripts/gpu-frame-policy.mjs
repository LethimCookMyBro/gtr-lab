import assert from 'node:assert/strict';
export const sourcePin = Object.freeze({ sha: 'b3f72d6de048941ce7b21c94b13f2896849b01db', tree: '0f78e2163e516652d976adb6ceccad0c8820016798a44b17d620e93d2701a0a8' });
export const gpuModels = Object.freeze([
  { path: '/models/ciasny-r35.glb', bytes: 8_296_356, sha256: 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d' },
  { path: '/models/r35-exterior-cabin-proxy-49d7c2ab.glb', bytes: 956_368, sha256: '49d7c2ab44461e33ce6621287089eb4a9d54c50ebc339a2932f587ce3d355347' },
]);
export const limits = Object.freeze({ readinessMs: 90_000, initialDrainMs: 45_000, isolatedDrainMs: 30_000, orbitInputMs: 30_000, orbitDrainMs: 60_000, commandMs: 5_000, cleanupMs: 5_000, quietMs: 750, observerMs: 300_000 });
export function validateGpuFrameEnvironment(env) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'GPU frame probe is CI-only');
  assert.equal(env.GITHUB_REPOSITORY, 'LethimCookMyBro/gtr-lab'); assert.equal(env.GITHUB_REF, 'refs/heads/main'); assert.equal(env.GITHUB_EVENT_NAME, 'push'); assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/);
  assert.ok((env.R35_GPU_FRAME_COMMIT_MESSAGE ?? '').includes('[stage-gpu-frames]'), 'Explicit GPU frame marker required');
  assert.equal(env.R35_ALLOW_GPU_FRAMES, '1'); assert.equal(env.R35_GPU_FRAME_SOURCE_SHA, sourcePin.sha); assert.equal(env.R35_GPU_FRAME_SOURCE_TREE, sourcePin.tree);
  assert.equal(env.R35_GPU_FRAME_BASE_URL, undefined, 'Public/arbitrary target forbidden');
  for (const key of ['DEBUG', 'DEBUG_FILE', 'PLAYWRIGHT_LEGACY_SCREENSHOT']) assert.equal(env[key], undefined, `Ambient ${key} forbidden`);
  return { baseUrl: 'http://127.0.0.1:4178', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
}
export function resolveGpuFrameRequest(request, env) {
  assert.deepEqual(Object.keys(request).sort(), ['allow', 'sourceSha', 'sourceTree', 'version']); assert.equal(request.version, 1); assert.equal(request.allow, true);
  const values = { R35_ALLOW_GPU_FRAMES: '1', R35_GPU_FRAME_SOURCE_SHA: request.sourceSha, R35_GPU_FRAME_SOURCE_TREE: request.sourceTree };
  validateGpuFrameEnvironment({ ...env, ...values }); return values;
}
const distribution = values => { const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b); return sorted.length ? { samples: sorted.length, min: sorted[0], median: sorted[Math.floor((sorted.length-1)/2)], p95: sorted[Math.ceil(sorted.length*.95)-1], max: sorted.at(-1) } : { samples: 0 }; };
export function isQuietAndDrained(observation, time) {
  const scenes = observation?.contexts?.filter(c => c.sceneCanvas && c.connected);
  if (observation?.stopped || observation?.issues?.length || scenes?.length !== 1 || observation.pendingObservedFrames !== 0) return false;
  const c = scenes[0], last = observation.frames.findLast(f => f.contextId === c.id);
  return Boolean(last?.status === 'signaled' && c.lastFenceId === c.previousCompletedFrameId && c.workRevision === c.lastFenceWorkRevision && time - last.fenceCallEndedAt >= limits.quietMs);
}
export function assessGpuFrames(observation) {
  const failures = [...(observation?.issues ?? ['Missing observer evidence'])], frames = observation?.frames ?? [], contexts = observation?.contexts ?? [];
  if (observation?.version !== 1 || !observation?.stopped) failures.push('Missing final stopped observer');
  if (observation?.stopReason !== 'scenario-ended') failures.push('Observer ended before scenario completion');
  if (contexts.filter(c => c.sceneCanvas).length !== 1 || contexts.some(c => c.lostEvents || c.restoredEvents || c.nativeContextLost)) failures.push('Expected one healthy scene context');
  if (!frames.length) failures.push('No observed scene frames');
  if (frames.some(f => !f.callbackReturned || !f.deleted)) failures.push('Callback boundary or sync cleanup incomplete');
  const stable = frames.filter(f => f.phase !== 'loading');
  if (stable.some(f => f.bufferWidth !== 1967 || f.bufferHeight !== 1016)) failures.push('Stable native buffer dimensions differ from source-pinned baseline');
  // Initial render allocation may converge; only settled phases must be exact.
  const completed = frames.filter(f => f.status === 'signaled' && Number.isFinite(f.observedSignaledAt) && Number.isFinite(f.observableLatencyUpperMs));
  const unresolved = frames.filter(f => f.status !== 'signaled');
  if (unresolved.length) failures.push('Some frame completion observations remained censored');
  const isolated = completed.filter(f => f.phase !== 'loading' && f.entryPriorAppWorkComplete && f.entryPendingEarlierFrames === 0 && f.callbackReturned);
  return { status: failures.length ? 'incomplete' : 'collected', originalAcceptanceChanged: false, failures,
    completedFrames: completed.length, unresolvedFrames: unresolved.length, priorAppWorkDrainedFrames: isolated.length,
    isolatedFrameQuestion: isolated.length ? 'prior-app-work-complete samples available; inspect completion bounds and shared-backend caveats' : 'inconclusive',
    pendingObservedFramesPeak: Math.max(0, ...frames.map(f => f.pendingEarlierAtFence + 1)),
    completionLowerMs: distribution(completed.map(f=>f.observableLatencyLowerMs)), completionUpperMs: distribution(completed.map(f=>f.observableLatencyUpperMs)),
    drainedEntryCompletionLowerMs: distribution(isolated.map(f=>f.observableLatencyLowerMs)), drainedEntryCompletionUpperMs: distribution(isolated.map(f=>f.observableLatencyUpperMs)),
    callbackToCompletionUpperMs: distribution(completed.map(f=>f.observedSignaledAt-f.callbackStartedAt)),
    timerSchedulingDelayMs: distribution((observation?.polls??[]).map(p=>p.schedulingDelayMs)), pollOverheadMs: distribution((observation?.polls??[]).map(p=>p.elapsedMs)),
    phases: [...new Set(frames.map(f=>f.phase))].map(phase=>{const all=frames.filter(f=>f.phase===phase),done=completed.filter(f=>f.phase===phase);return {phase,submittedFrames:all.length,completedFrames:done.length,drawCalls:distribution(all.map(f=>f.calls)),triangles:distribution(all.map(f=>f.triangles)),completionUpperMs:distribution(done.map(f=>f.observableLatencyUpperMs)),drainedEntryFrames:isolated.filter(f=>f.phase===phase).length};}),
    interpretation: 'Pending is unobserved app-frame completion count, not true GPU queue depth. Completion proves the earlier same-context prefix finished, but may include global ANGLE fence scope. Sync cache, internal flush/submission, shared GPU/compositor work and timer scheduling affect timings. Lower/upper values bracket observable signal detection, not hardware execution time or FPS.',
  };
}

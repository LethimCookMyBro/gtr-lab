/**
 * Private, fail-closed endpoint proof. This is NOT the historical motion gate,
 * a full-motion replacement, a perceptual-smoothness gate, or a hardware FPS test.
 * No browser, app, server, network, renderer, timer, or GL calls are made here.
 */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const contract = Object.freeze({
  name: 'r35-demand-final-request-v1',
  status: 'private-proposed-endpoint-subproof',
  originalCaptureAttemptMs: 45_000,
  originalCaptureAttempts: 2,
  originalLocatorCommandMs: 15_000,
});
export const originalFileHashes = Object.freeze({
  'scripts/diagnose-dpr-motion.mjs': 'b56d962004c4d0a65e0080eec5f9138c76f18e5b22602ea455bc5f64ecf97110',
  'scripts/dpr-motion-observer.mjs': 'ba4364c76024cd543435fd578b3fdc2def691f935ec30fbf7e3e20f669169aa8',
  'scripts/dpr-motion-policy.mjs': 'e98e1690b27f194c16b0fd892cbcfa66c442914c17de7329aad05f4c26a9f4dc',
  'scripts/cabin-resource-observer.mjs': 'c35d627df9e75868925c4c6cce53eb2071ac00ef1030d73b2e97513a10e22caf',
  '.github/workflows/dpr-motion-diagnostic.yml': '0b562c97149c1281afb18ccc4a44f43a90f31b3466d539cb2bfc1844e28bfeea',
});
const phaseByLabel = Object.freeze({
  '02-orbit-mid': 'exterior-orbit', '03-orbit-end': 'exterior-orbit',
  '07-cabin-driver': 'cabin-entry', '08-cabin-look-mid': 'cabin-look',
  '09-cabin-look-end': 'cabin-look', '10-cabin-seats': 'cabin-seat-controls',
  '12-resized-look': 'resized-cabin-look',
});
export const endpointLabels = Object.freeze(Object.keys(phaseByLabel));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const time = value => finite(value) && value >= 0;
const id = value => Number.isSafeInteger(value) && value > 0;
const tuple = (value, n) => Array.isArray(value) && value.length === n && value.every(finite);
const ordered = (...values) => values.every(time) && values.every((value, i) => i === 0 || value >= values[i - 1]);
const equal = isDeepStrictEqual; // Object insertion order is not semantic state.
const positiveStatus = value => value === 0x911a || value === 0x911c;
const stateValid = state => state?.live === true && state.camera?.settled === true && state.camera.autoRotate === false &&
  id(state.camera.appliedInputEpoch) && Number.isSafeInteger(state.camera.requestId) && state.camera.requestId >= 0 && typeof state.camera.preset === 'string' && finite(state.camera.fov) && state.camera.fov > 0 &&
  tuple(state.pose?.position, 3) && tuple(state.pose?.quaternion, 4) && tuple(state.pose?.projection, 16) &&
  Math.abs(state.pose.quaternion.reduce((sum, n) => sum + n * n, 0) - 1) <= 1e-10 &&
  typeof state.controls?.lights === 'boolean' && [null, 'driver', 'passenger', 'rear'].includes(state.controls.seat) &&
  state.controls.exterior === true && typeof state.controls.full === 'boolean' && typeof state.controls.proxy === 'boolean' &&
  Array.isArray(state.controls.lamps) && state.controls.lamps.length > 0 && state.controls.lamps.every(lamp =>
    typeof lamp.role === 'string' && tuple(lamp.emissive, 3) && finite(lamp.intensity) && lamp.intensity >= 0) &&
  ['width', 'height', 'cssWidth', 'cssHeight', 'renderWidth', 'renderHeight', 'pixelRatio', 'nativeDpr'].every(key => finite(state.dimensions?.[key]) && state.dimensions[key] > 0);
function geometryValid(state) {
  if (!stateValid(state)) return false;
  const d = state.dimensions;
  const density = Math.min(d.nativeDpr, 1.5, Math.sqrt(2_000_000 / (d.renderWidth * d.renderHeight)));
  return d.pixelRatio === density && d.width === Math.floor(d.renderWidth * density) &&
    d.height === Math.floor(d.renderHeight * density) && d.width * d.height <= 2_000_000 &&
    Math.abs(d.renderWidth - d.cssWidth) <= 1 && Math.abs(d.renderHeight - d.cssHeight) <= 1;
}

/**
 * expected is a separate, reviewed harness plan, NEVER report-derived current state.
 * Its target pose must come from the captured input coordinates/keys plus a pinned
 * independent controller model. The model and expected hashes are review inputs.
 * Its command sequence is the unchanged original driver segment, including waits.
 * These are testable inputs, not proof that the unimplemented collector exists.
 */
export function assessFinalRequest(evidence, expected, reviewed) {
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  try {
    check(hex(reviewed?.sourceTree) && typeof reviewed?.sourceCommit === 'string' && /^[a-f0-9]{40}$/.test(reviewed.sourceCommit) && hex(reviewed?.controllerModelSha256) && hex(reviewed?.expectationSha256) && hex(reviewed?.actionPlanSha256) && hex(reviewed?.observerSha256) && typeof reviewed?.harnessCommit === 'string' && /^[a-f0-9]{40}$/.test(reviewed.harnessCommit), 'Explicit independent reviewed source/model/expectation pins are required');
    check(reviewed?.expectationSha256 === sha(JSON.stringify(expected)), 'Expectation differs from the independently reviewed action/target plan');
    check(Array.isArray(expected?.actions) && expected.actions.length > 0 && reviewed?.actionPlanSha256 === sha(JSON.stringify(expected?.actions)), 'Independently pinned complete original action plan is required');
    check(expected?.contract === contract.name, 'Missing reviewed endpoint expectation');
    check(endpointLabels.includes(expected?.label), 'Unsupported endpoint: continuous-motion and idle captures are not certified');
    check(expected?.phase === phaseByLabel[expected?.label], 'Original endpoint phase mismatch');
    check(hex(expected?.controllerModelSha256) && hex(expected?.originalDriverSha256) &&
      expected.originalDriverSha256 === originalFileHashes['scripts/diagnose-dpr-motion.mjs'], 'Unpinned independent controller model or original input driver');
    check(Array.isArray(expected?.acceptedRequests) && expected.acceptedRequests.length > 0, 'Exact reviewed accepted-request segment is required');
    const requestedGeometry = expected?.viewport === 'mobile' ? (expected?.label === '12-resized-look' ? [430, 428, 645, 642, 3] : [390, 372, 585, 558, 3]) : (expected?.label === '12-resized-look' ? [1280, 644, 1920, 966, 2] : [1440, 744, 1967, 1016, 2]);
    const dimensions = expected?.state?.dimensions;
    check(equal(dimensions && [dimensions.cssWidth, dimensions.cssHeight, dimensions.width, dimensions.height, dimensions.nativeDpr], requestedGeometry), 'Expected target changed original viewport geometry or quality');
    check(geometryValid(expected?.state), 'Expected target must be an independently derived settled pose, actual controls and original-quality dimensions');
    check(evidence?.contract === contract.name && evidence?.label === expected?.label && evidence?.phase === expected?.phase, 'Endpoint identity mismatch or missing causal evidence');
    check(evidence?.sourceTree === reviewed?.sourceTree && evidence?.sourceCommit === reviewed?.sourceCommit, 'Endpoint source differs from the reviewed source');
    check(evidence?.controllerModelSha256 === expected?.controllerModelSha256 && evidence?.controllerModelSha256 === reviewed?.controllerModelSha256, 'Controller model identity mismatch');
    check(evidence?.observerSha256 === reviewed?.observerSha256 && evidence?.harnessCommit === reviewed?.harnessCommit, 'Evidence collector or harness identity differs from independent review');
    check(evidence?.normalMotion === true, 'Normal motion was not preserved');
    check(evidence?.clock === 'single-page-performance-time-origin' && time(evidence?.timeOrigin) && evidence.timeOrigin > 0, 'All causal timestamps must share the actual page monotonic clock origin');
    check(hex(evidence?.runId) && hex(evidence?.sessionId) && ['desktop', 'mobile'].includes(evidence?.viewport) && evidence.viewport === expected?.viewport, 'Single source-bound run/session/viewport identity is required');
    check(id(evidence?.owner) && id(evidence?.context) && id(evidence?.bufferGeneration), 'Native owner/context/buffer identity missing');
    check(time(evidence?.armedAt) && Number.isSafeInteger(evidence?.beforeMain) && evidence.beforeMain >= 0, 'Pre-action arm baseline missing');
    check(evidence?.audit?.addedRenderRequests === 0 && evidence?.audit?.finishCalls === 0 && evidence?.audit?.readPixelsCalls === 0 &&
      evidence?.audit?.synchronousWaitCalls === 0 && evidence?.audit?.extraNativeFences === 0, 'Observation changed production rendering or synchronised native work');
    check(Array.isArray(evidence?.invalidations) && evidence.invalidations.length === 0, 'Owner/context loss, buffer replacement, observer overflow or invalidation occurred');
    const actions = evidence?.actions;
    check(Array.isArray(actions) && actions.length === expected?.actions?.length, 'Complete original transport/action ledger is missing');
    let actionEnd = evidence?.armedAt;
    if (Array.isArray(actions)) actions.forEach((action, i) => {
      const planned = expected?.actions?.[i];
      check(equal(action?.spec, planned) && typeof action?.spec?.id === 'string', `Action ${i}: original transport plan differs`);
      check(ordered(actionEnd, action?.startedAt, action?.endedAt, action?.nextActionAt) && action?.nextActionAt >= action?.endedAt + planned?.waitAfterMs, `Action ${i}: original transport order/wait changed`);
      check(action?.outcome === 'completed', `Action ${i}: ignored/rejected/failed input cannot disappear`);
      const requestIds = evidence?.acceptedRequests?.filter(r => r.actionId === planned?.id) ?? [];
      check(planned?.sceneRequest === true ? requestIds.length === 1 : requestIds.length === 0, `Action ${i}: accepted-request mapping differs from reviewed scene-affecting actions`);
      actionEnd = action?.nextActionAt;
    });
    check(new Set(actions?.map?.(a => a?.spec?.id) ?? []).size === actions?.length, 'Original action identities must be unique');
    const commands = evidence?.acceptedRequests;
    check(Array.isArray(commands) && commands.length === expected?.acceptedRequests?.length, 'All reviewed scene-affecting requests and cadence records are required');
    let previousGeneration = evidence?.baselineInputEpoch;
    check(Number.isSafeInteger(previousGeneration) && previousGeneration >= 0, 'Pre-action request generation missing');
    let previousEnd = evidence?.armedAt;
    if (Array.isArray(commands)) commands.forEach((command, i) => {
      const wanted = expected?.acceptedRequests?.[i];
      check(command?.actionId === wanted?.actionId && actions?.some(action => action?.spec?.id === command?.actionId && action.spec.sceneRequest === true && equal(action.spec.input, command.input)), `Command ${i}: request is not bound to its original scene action`);
      const action = actions?.find(row => row?.spec?.id === command?.actionId);
      check(command?.startedAt === action?.startedAt && command?.endedAt === action?.endedAt && command?.nextActionAt === action?.nextActionAt, `Command ${i}: accepted request timing differs from original transport action`);
      check(equal(command?.input, wanted?.input), `Command ${i}: original input differs`);
      check(command?.waitAfterMs === wanted?.waitAfterMs && finite(command?.waitAfterMs) && command.waitAfterMs >= 0, `Command ${i}: original input cadence changed`);
      check(command?.isTrusted === true && id(command?.inputEpoch) && command.inputEpoch === previousGeneration + 1, `Command ${i}: trusted ordered request generation missing`);
      check(ordered(previousEnd, command?.startedAt, command?.receivedAt, command?.handledAt, command?.endedAt), `Command ${i}: input receipt/handler completion order invalid`);
      check(['locator', 'mouse'].includes(command?.input?.transport), `Command ${i}: input transport is missing`);
      const timeout = command?.input?.transport === 'locator' ? contract.originalLocatorCommandMs : null;
      check(command?.originalTimeoutMs === timeout, `Command ${i}: original command timeout declaration differs`);
      if (timeout !== null) check(command?.endedAt - command?.startedAt <= timeout, `Command ${i}: original locator command budget exceeded`);
      check(command?.nextActionAt >= command?.endedAt + command?.waitAfterMs, `Command ${i}: original delay was shortened`);
      check(command?.accepted === true, `Command ${i}: native input was not accepted`);
      previousGeneration = command?.inputEpoch;
      previousEnd = command?.nextActionAt;
    });
    const last = commands?.at(-1), draw = evidence?.draw, completion = evidence?.completion, drain = evidence?.drain;
    check(id(draw?.id) && draw.id > evidence?.beforeMain, 'No fresh post-action main draw; stale-frame reuse');
    check(draw?.kind === 'main-default-buffer' && draw?.owner === evidence?.owner && draw?.context === evidence?.context &&
      draw?.bufferGeneration === evidence?.bufferGeneration && draw?.appliedInputEpoch === last?.inputEpoch, 'Draw does not consume the final requested generation on the same native default buffer');
    check(draw?.inputDigest === sha(JSON.stringify(expected?.acceptedRequests)), 'Draw input lineage differs from the exact original segment');
    check(ordered(last?.handledAt, actions?.at(-1)?.endedAt, draw?.submittedAt) && draw?.stable === true && id(draw?.calls) && id(draw?.triangles), 'No stable genuine main submission after final input');
    check(geometryValid(draw?.state) && equal(draw?.state, expected?.state) && draw?.state?.camera?.appliedInputEpoch === last?.inputEpoch, 'Actual submitted pose/control/material/dimension state differs from independent requested target');
    for (const [label, fence] of [['Main completion', completion], ['Latest native drain', drain]]) {
      check(id(fence?.id) && fence?.owner === evidence?.owner && fence?.context === evidence?.context && fence?.origin === 'production-pacing', `${label}: native fence identity missing`);
      check(fence?.api === 'clientWaitSync' && fence?.flags === 0 && fence?.timeoutNanoseconds === 0 && positiveStatus(fence?.status), `${label}: no nonblocking positive native completion`);
      check(Array.isArray(fence?.drawIds) && fence.drawIds.includes(draw?.id), `${label}: fence does not cover the exact submitted draw`);
      check(ordered(draw?.submittedAt, fence?.createdAt, fence?.observedAt), `${label}: causal order invalid`);
      check(fence?.retiredReason === null || fence?.retiredReason === 'signaled', `${label}: native failure, cancellation or invalid retirement`);
    }
    check(drain?.id >= completion?.id && drain?.observedAt >= completion?.observedAt, 'Latest native prefix was not completed');
    const capture = evidence?.capture;
    check(time(capture?.invokedAt) && capture.invokedAt === actionEnd && capture.budgetStartedAt === capture.invokedAt, 'Capture budget must start at the original invocation boundary with no pre-budget readiness wait');
    check(capture?.absoluteDeadline === capture?.budgetStartedAt + 90_000, 'Original two-attempt absolute capture budget changed');
    check(Array.isArray(capture?.attempts) && capture.attempts.length >= 1 && capture.attempts.length <= 2, 'Original screenshot retry limit changed');
    let attemptEnd = capture?.budgetStartedAt;
    if (Array.isArray(capture?.attempts)) capture.attempts.forEach((attempt, i) => {
      check(ordered(attemptEnd, attempt?.startedAt) && (i > 0 || attempt?.startedAt === capture?.budgetStartedAt), `Capture attempt ${i}: readiness got an extra pre-capture budget`);
      check(attempt?.deadline === Math.min(attempt?.startedAt + 45_000, capture?.absoluteDeadline), `Capture attempt ${i}: original attempt deadline changed`);
      check(ordered(attempt?.startedAt, attempt?.readinessStartedAt, attempt?.readyAt, attempt?.pngStartedAt, attempt?.endedAt), `Capture attempt ${i}: readiness/capture ordering invalid`);
      check(attempt?.readinessStartedAt === attempt?.startedAt, `Capture attempt ${i}: readiness must share the capture budget`);
      check(attempt?.api === 'page.screenshot', `Capture attempt ${i}: wrong operation provenance`);
      if (i < capture.attempts.length - 1) check(attempt?.outcome === 'TimeoutError' && attempt?.error?.name === 'TimeoutError' && typeof attempt?.error?.message === 'string' && /page\.screenshot: Timeout \d+ms exceeded/.test(attempt.error.message) && attempt?.pngStartedAt < attempt?.deadline && attempt?.endedAt === attempt?.deadline, 'Only an actual screenshot timeout can consume the original retry');
      else check(attempt?.outcome === 'captured' && attempt?.endedAt < attempt?.deadline && attempt?.endedAt < capture?.absoluteDeadline, 'Capture did not finish inside the original absolute deadline');
      attemptEnd = attempt?.endedAt;
    });
    const attempt = capture?.attempts?.at(-1);
    check(ordered(completion?.observedAt, drain?.observedAt, attempt?.readyAt, attempt?.pngStartedAt), 'PNG started before exact native-prefix completion');
    check(capture?.transport === 'new-page-screenshot-call' && typeof capture?.id === 'string' && capture.id.length > 0 && hex(capture?.sha256), 'Fresh composited PNG call identity missing');
    check(capture?.blank === false && id(capture?.pixels) && typeof capture?.scene?.layout === 'string' && hex(capture?.scene?.sha256), 'Missing independent nonblank scene pixels');
    check(equal(capture?.dimensions, expected?.state?.dimensions), 'Captured dimensions differ from the requested original geometry');
    for (const name of ['before', 'after']) {
      const certificate = capture?.[name];
      check(certificate?.owner === evidence?.owner && certificate?.context === evidence?.context && certificate?.bufferGeneration === evidence?.bufferGeneration &&
        certificate?.mainDrawId === draw?.id && certificate?.completionFenceId === completion?.id && certificate?.drainFenceId === drain?.id &&
        certificate?.appliedInputEpoch === last?.inputEpoch && certificate?.pendingDemand === false && certificate?.pointerDown === false &&
        equal(certificate?.state, draw?.state), `Capture ${name}: stale/changed state, pending input, owner, buffer, draw or native prefix`);
    }
    check(ordered(drain?.observedAt, capture?.before?.observedAt, attempt?.pngStartedAt, attempt?.endedAt, capture?.after?.observedAt), 'Stable capture certificates do not bracket the PNG');
    check(capture?.after?.observedAt < capture?.absoluteDeadline && capture?.after?.observedAt < attempt?.deadline, 'Post-capture verification exceeded the unchanged wall-clock budget');
    // A changed-pixel witness is required when the reviewed expectation says the
    // old and desired visible poses differ at equal geometry. It is not a hidden
    // frame-ID and cannot prove exact compositor ownership.
    if (expected?.changedPixelsFrom) {
      const before = expected.changedPixelsFrom;
      check(hex(before.sha256) && typeof before.layout === 'string' && before.layout === capture?.scene?.layout && before.sha256 !== capture?.scene?.sha256, 'Expected visible pose change lacks independent changed-scene pixels at equal layout');
    }
  } catch (error) { failures.push(`Malformed evidence: ${error.message}`); }
  const final = evidence?.acceptedRequests?.at?.(-1);
  return {
    contract: contract.name,
    label: expected?.label ?? null,
    result: failures.length ? 'insufficient' : 'endpoint-evidence-satisfied',
    failures: [...new Set(failures)],
    finalRequestLatencyMs: !failures.length && final && evidence?.completion ? {
      receive: final.receivedAt - final.startedAt,
      handler: final.handledAt - final.receivedAt,
      submit: evidence.draw?.submittedAt - final.receivedAt,
      nativeComplete: evidence.completion.observedAt - final.receivedAt,
    } : null,
    intermediateRequests: failures.length ? 'Acceptance/order unproven. Intermediate presentation is not established.' : 'Accepted in original order; may be coalesced. Individual presentation is not established.',
    pixelStateAssociation: failures.length ? 'Stable causal association and fresh sampled output are not established.' : 'Stable causal interval and fresh nonblank composited sample; exact compositor frame identity is not observable.',
    fullMotionVerdict: 'not-established',
    perceptualSmoothness: 'not-established',
    hardwareFps: 'not-established',
  };
}

/** Historical bytes are independently supplied, never rewritten or reassessed. */
export function preserveOriginalGate(originalBytes, expectedSha256) {
  const digest = sha(originalBytes);
  if (!hex(expectedSha256) || digest !== expectedSha256) throw new Error('Historical report identity mismatch');
  const report = JSON.parse(originalBytes);
  if (report.result !== 'failed' || !Array.isArray(report.assessment?.failures) || !report.assessment.failures.length)
    throw new Error('Expected preserved historical failed motion report');
  return Object.freeze({ sha256: digest, result: report.result, failures: Object.freeze([...report.assessment.failures]) });
}

/** No aggregation path returns a release/full-motion pass. No known observer
 * currently emits this schema. Missing endpoint collection remains insufficient. */
export function summarizeDemandSubproof({ original, endpoints = [], expected = [], reviewed = [] }) {
  const failures = [];
  if (original?.result !== 'failed' || !hex(original?.sha256) || !original?.failures?.length) failures.push('Preserved original failed gate is required');
  if (!equal(expected.map(e => e.label), endpointLabels) || !equal(endpoints.map(e => e.label), endpointLabels)) failures.push('Exact seven final-request endpoints required once in original order');
  const captureIds = endpoints.map(e => e.capture?.id);
  if (captureIds.some(value => typeof value !== 'string') || new Set(captureIds).size !== captureIds.length) failures.push('Reused or missing capture transaction identity');
  const first = endpoints[0];
  for (const [i, endpoint] of endpoints.entries()) {
    for (const field of ['sourceTree', 'sourceCommit', 'controllerModelSha256', 'observerSha256', 'harnessCommit', 'runId', 'sessionId', 'viewport', 'timeOrigin', 'owner', 'context'])
      if (endpoint[field] !== first?.[field]) failures.push(`Endpoint ${i}: mixed run/session/source/viewport/native owner lineage`);
    if (i > 0 && !(endpoint.armedAt >= endpoints[i - 1]?.capture?.after?.observedAt)) failures.push(`Endpoint ${i}: endpoint timeline is not in original order`);
    if (i > 0) {
      const prior = endpoints[i - 1];
      if (!(endpoint.beforeMain >= prior?.draw?.id && endpoint.draw?.id > prior?.draw?.id)) failures.push(`Endpoint ${i}: native main draw lineage was reused or regressed`);
      if (!(endpoint.completion?.id > prior?.drain?.id && endpoint.drain?.id >= endpoint.completion?.id)) failures.push(`Endpoint ${i}: native fence lineage was reused or regressed`);
      if (!(endpoint.bufferGeneration >= prior?.bufferGeneration)) failures.push(`Endpoint ${i}: backing-buffer generation regressed`);
    }
    if (i > 0 && !(endpoint.baselineInputEpoch >= endpoints[i - 1]?.acceptedRequests?.at(-1)?.inputEpoch)) failures.push(`Endpoint ${i}: input epoch regressed across the original run`);
  }
  const results = expected.map((plan, i) => assessFinalRequest(endpoints[i], plan, reviewed[i]));
  if (results.some(result => result.result !== 'endpoint-evidence-satisfied')) failures.push('Missing or invalid final-request causal evidence');
  return { contract: contract.name, result: failures.length ? 'insufficient' : 'endpoint-subproof-only', originalGate: original,
    failures, endpoints: results, unresolved: ['04/05 moving-PNG to completed-state attribution', 'Historical frame-coverage and stable-resize failures', 'Perceptual lag/flicker and physical-device smoothness'], fullMotionVerdict: 'not-established' };
}

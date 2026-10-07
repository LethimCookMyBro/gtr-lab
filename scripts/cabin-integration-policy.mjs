/** CI-only public cabin target, byte identities and narrowly scoped fault adapter. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const cabinOrigin = 'https://gtr-lab-production.up.railway.app';
export const cabinModels = Object.freeze([
  { path: '/models/r35-cabin-sealed-spatial.glb', bytes: 14_599_520, sha256: '3302157a1d5986aca0d263eb991f1f6dd08ffc9dcfa9f7680a3b0de29f2a7dfd' },
  { path: '/models/ciasny-r35.glb', bytes: 8_296_356, sha256: 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d' },
]);
const cabinPath = cabinModels[0].path;
export const networkFaultHeader = 'x-r35-cabin-qa-fault';

export function resolveCabinTarget(env) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'This browser proof is CI-only');
  assert.equal(env.R35_ALLOW_CABIN_INTEGRATION, '1', 'Explicit CI opt-in required');
  assert.ok(['desktop', 'mobile'].includes(env.R35_QA_VIEWPORT), 'Choose one matrix viewport');
  const mode = env.R35_CABIN_MODE ?? 'local';
  assert.ok(['local', 'live'].includes(mode), 'Unknown cabin verification mode');
  if (mode === 'local') {
    assert.equal(env.R35_CABIN_BASE_URL, undefined, 'Local mode cannot accept a public target');
    assert.equal(env.R35_ALLOW_LIVE_CABIN, undefined, 'Local mode cannot accept live opt-in');
    return { mode, baseUrl: 'http://127.0.0.1:4178', output: 'cabin-integration-results' };
  }
  assert.equal(env.R35_ALLOW_LIVE_CABIN, '1', 'Explicit live CI opt-in required');
  assert.equal(env.R35_CABIN_BASE_URL, cabinOrigin, 'Live target must be the exact approved public origin');
  assert.equal(env.GITHUB_REPOSITORY, 'LethimCookMyBro/gtr-lab', 'Live verification requires the approved repository');
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Live verification requires main');
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/, 'Live verification requires an exact commit SHA');
  return { mode, baseUrl: cabinOrigin, output: 'cabin-live-results' };
}

export async function verifyPublicCabinModels({ fetchImpl = fetch } = {}) {
  const verified = [];
  const deadline = AbortSignal.timeout(120_000);
  for (const model of cabinModels) {
    const url = cabinOrigin + model.path;
    const response = await fetchImpl(url, { redirect: 'error', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.any([deadline, AbortSignal.timeout(60_000)]) });
    try {
      assert.equal(response.status, 200, `Public model HTTP status: ${model.path}`);
      assert.ok(!response.redirected && (!response.url || response.url === url), 'Public model must not redirect');
      const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      assert.ok(['model/gltf-binary', 'application/octet-stream'].includes(mime), 'Public model content-type is binary');
      const length = response.headers.get('content-length');
      assert.ok(length === null || /^\d+$/.test(length) && Number(length) === model.bytes, 'Public model declared byte length is exact');
      assert.ok(response.body, 'Public model body is present');
      const hash = createHash('sha256'); let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        assert.ok(bytes <= model.bytes, 'Public model exceeds exact byte limit');
        hash.update(chunk);
      }
      assert.equal(bytes, model.bytes, 'Public model byte length is exact');
      const sha256 = hash.digest('hex');
      assert.equal(sha256, model.sha256, 'Public model has the exact reviewed identity');
      verified.push({ path: model.path, url, bytes, sha256 });
    } finally {
      if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
    }
  }
  return verified;
}

export function isExpectedCabinRequestFailure(item, responses, path = cabinPath) {
  if (item.path !== path || item.failure !== 'net::ERR_ABORTED' || !Number.isSafeInteger(item.requestId)) return false;
  const response = responses.find(candidate => candidate.requestId === item.requestId && candidate.path === path);
  return response?.status === 404 && response.injectedFault === 'missing'
    || response?.status === 200 && ['held-stream', 'throttled-stream'].includes(response.injectedFault) && /cancel|in-flight/i.test(item.phase);
}

export function isExpectedCabinBodyError(record, failures) {
  return /abort|closed|No resource|No data|Protocol error/i.test(record.bodyError ?? '')
    && failures.some(failure => failure.requestId === record.requestId && isExpectedCabinRequestFailure(failure, [record]));
}

export function isExpectedCabinWarning(item) {
  return item.type === 'warning'
    && item.phase === 'Real WebGL context loss and explicit viewer retry'
    && item.text === 'THREE.WebGLRenderer: WEBGL_lose_context extension not supported.';
}

/** Pair Chromium's console duplicate with the exact CDP request that produced it. */
export function correlateCabinConsole404(records, entries, responses, cabinUrl) {
  const unused = [...entries];
  for (const item of records) {
    item.intentional404 = false;
    if (item.type !== 'error' || item.location?.url !== cabinUrl || !/^Failed to load resource:.*\b404\b/.test(item.text)) continue;
    const index = unused.findIndex(entry => entry.source === 'network' && entry.level === 'error' && entry.url === cabinUrl && entry.text === item.text);
    if (index < 0) continue;
    const [entry] = unused.splice(index, 1);
    item.networkRequestId = entry.networkRequestId;
    item.intentional404 = typeof entry.networkRequestId === 'string' && responses.some(response => response.requestId === entry.networkRequestId && response.url === cabinUrl && response.status === 404 && response.injectedFault === 'missing');
  }
}

export function createLiveCabinFaults({ page, cdp, cabinUrl, requestId, faults }) {
  assert.equal(cabinUrl, cabinOrigin + cabinPath, 'Fault adapter requires the exact public cabin URL');
  let pending = null;
  let throttled = false;
  const routes = new Set();
  const restore = async () => {
    if (!throttled) return;
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    throttled = false;
  };
  const onRequest = request => {
    if (!pending || request.url() !== cabinUrl || request.method() !== 'GET') return;
    pending.requestId = requestId(request); pending.started = true; pending = null;
  };
  return {
    get pending() { return pending; },
    onRequest,
    onFailed(request) {
      if (request.url() !== cabinUrl || request.failure()?.errorText !== 'net::ERR_ABORTED') return;
      const fault = faults.find(item => item.kind === 'throttled-stream' && item.requestId === requestId(request));
      if (fault) fault.closed = true;
    },
    async arm(kind, phase) {
      assert.equal(pending, null, 'One pending public network fault at a time');
      assert.equal(throttled, false, 'Previous public throttle must be restored');
      assert.ok(['missing', 'held-stream'].includes(kind), 'Known cabin fault required');
      const fault = { kind: kind === 'held-stream' ? 'throttled-stream' : kind, phase };
      faults.push(fault); pending = fault;
      if (kind === 'missing') {
        const handler = async route => {
          const request = route.request();
          assert.equal(request.url(), cabinUrl, 'Only the exact public cabin request may be replaced');
          assert.equal(request.method(), 'GET', 'Only cabin GET may be replaced');
          onRequest(request);
          assert.equal(fault.requestId, requestId(request), '404 is attached to its exact armed request');
          await route.fulfill({ status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store', [networkFaultHeader]: 'missing' }, body: 'Intentional cabin-only 404 for recovery verification' });
          fault.finished = true;
        };
        routes.add(handler);
        await page.route(cabinUrl, handler, { times: 1 });
      } else {
        // Only transport is slowed. The body and headers still come from Railway.
        // 64 KiB/s keeps 14.6 MB in flight through screenshot and cancellation.
        throttled = true;
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: 65_536, uploadThroughput: -1 });
        fault.release = async () => {
          fault.clientAlreadyClosed = fault.closed === true;
          await restore(); fault.released = true;
        };
      }
      return fault;
    },
    async dispose() {
      try { await restore(); }
      finally { for (const handler of routes) await page.unroute(cabinUrl, handler); routes.clear(); }
    },
  };
}

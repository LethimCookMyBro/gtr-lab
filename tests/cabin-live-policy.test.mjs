import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import * as driver from '../scripts/capture-cabin-preview.mjs';

const origin = 'https://gtr-lab-production.up.railway.app';
const cabinUrl = `${origin}/models/r35-cabin-realism-0b72bab4.glb`;
const environment = {
  GITHUB_ACTIONS: 'true', R35_ALLOW_CABIN_INTEGRATION: '1', R35_QA_VIEWPORT: 'desktop',
};
const liveEnvironment = { ...environment, R35_CABIN_MODE: 'live', R35_CABIN_BASE_URL: origin, R35_ALLOW_LIVE_CABIN: '1', GITHUB_SHA: 'a'.repeat(40), GITHUB_REF: 'refs/heads/main', GITHUB_REPOSITORY: 'LethimCookMyBro/gtr-lab' };

function api(name) { expect(driver[name], `${name} exists`).toBeTypeOf('function'); return driver[name]; }

function liveFixture() {
  const calls = [];
  const page = { route: vi.fn(async (...args) => calls.push(['route', ...args])), unroute: vi.fn(async (...args) => calls.push(['unroute', ...args])) };
  const cdp = { send: vi.fn(async (...args) => calls.push(['cdp', ...args])) };
  const faults = [];
  const adapter = api('createLiveCabinFaults')({ page, cdp, cabinUrl, requestId: request => request.id, faults });
  const request = { id: 4, url: () => cabinUrl, method: () => 'GET', failure: () => ({ errorText: 'net::ERR_ABORTED' }) };
  return { page, cdp, calls, faults, adapter, request };
}

describe('cabin verification target boundary', () => {
  it('keeps the existing CI local mode and fixed loopback target', () => {
    expect(api('resolveCabinTarget')(environment)).toMatchObject({ mode: 'local', baseUrl: 'http://127.0.0.1:4178', output: 'cabin-integration-results' });
  });
  it('accepts only the explicitly opted-in public CI target', () => {
    expect(api('resolveCabinTarget')(liveEnvironment)).toMatchObject({ mode: 'live', baseUrl: origin, output: 'cabin-live-results' });
  });
  it.each([
    { GITHUB_ACTIONS: 'false' }, { R35_ALLOW_CABIN_INTEGRATION: undefined }, { R35_QA_VIEWPORT: 'tablet' },
    { R35_CABIN_MODE: 'preview' }, { R35_ALLOW_LIVE_CABIN: undefined }, { GITHUB_SHA: 'main' },
    { GITHUB_REF: 'refs/heads/feature' }, { GITHUB_REPOSITORY: 'someone/fork' },
    ...['http://gtr-lab-production.up.railway.app', `${origin}/`, `${origin}/configurator/premium`, `${origin}?x=1`, `${origin}#x`, 'https://gtr-lab-production.up.railway.app:443', 'https://user@gtr-lab-production.up.railway.app', 'https://other.test', 'http://127.0.0.1:4178', undefined].map(R35_CABIN_BASE_URL => ({ R35_CABIN_BASE_URL })),
  ])('rejects malformed live environment %j before effects', changes => {
    expect(() => api('resolveCabinTarget')({ ...liveEnvironment, ...changes })).toThrow();
  });
  it.each([{ R35_CABIN_BASE_URL: origin }, { R35_ALLOW_LIVE_CABIN: '1' }])('rejects public settings in local mode: %j', changes => {
    expect(() => api('resolveCabinTarget')({ ...environment, ...changes })).toThrow();
  });
});

describe('public cabin fault adapter without sockets', () => {
  it('fulfills only the next exact GET cabin request with marked 404 and removes its route', async () => {
    const f = liveFixture();
    const fault = await f.adapter.arm('missing', 'missing phase');
    expect(f.page.route.mock.calls[0][0]).toBe(cabinUrl);
    expect(f.page.route.mock.calls[0][2]).toEqual({ times: 1 });
    const handler = f.page.route.mock.calls[0][1];
    const fulfill = vi.fn();
    await handler({ request: () => f.request, fulfill });
    expect(fault).toMatchObject({ requestId: 4, kind: 'missing', started: true, finished: true });
    expect(fulfill.mock.calls[0][0]).toMatchObject({ status: 404, headers: { 'x-r35-cabin-qa-fault': 'missing' } });
    expect(f.cdp.send).not.toHaveBeenCalled();
    await f.adapter.dispose();
    expect(f.page.unroute).toHaveBeenCalledWith(cabinUrl, handler);
  });
  it('throttles real public bytes, correlates cancellation, and restores network conditions', async () => {
    const f = liveFixture();
    const fault = await f.adapter.arm('held-stream', 'Delayed download cancel and stale response ignored');
    expect(fault.kind).toBe('throttled-stream');
    expect(f.page.route).not.toHaveBeenCalled();
    expect(f.cdp.send).toHaveBeenCalledWith('Network.emulateNetworkConditions', expect.objectContaining({ offline: false, downloadThroughput: 65536 }));
    f.adapter.onRequest({ ...f.request, id: 3, url: () => `${origin}/models/ciasny-r35.glb` });
    expect(fault.requestId).toBeUndefined();
    f.adapter.onRequest(f.request);
    expect(fault.requestId).toBe(4);
    f.adapter.onFailed({ ...f.request, id: 5 });
    expect(fault.closed).toBeUndefined();
    f.adapter.onFailed(f.request);
    expect(fault.closed).toBe(true);
    await fault.release();
    expect(fault).toMatchObject({ released: true, clientAlreadyClosed: true });
    expect(f.cdp.send).toHaveBeenLastCalledWith('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await f.adapter.dispose();
  });
  it('restores throttling in cleanup even if no cabin request starts', async () => {
    const f = liveFixture(); await f.adapter.arm('held-stream', 'cancel phase'); await f.adapter.dispose();
    expect(f.cdp.send).toHaveBeenLastCalledWith('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  });
  it('removes installed 404 routes even when restoring a later throttle fails', async () => {
    const f = liveFixture(); await f.adapter.arm('missing', 'missing');
    const handler = f.page.route.mock.calls[0][1];
    await handler({ request: () => f.request, fulfill: async () => {} });
    await f.adapter.arm('held-stream', 'cancel');
    f.cdp.send.mockRejectedValueOnce(new Error('CDP restore failure'));
    await expect(f.adapter.dispose()).rejects.toThrow('CDP restore failure');
    expect(f.page.unroute).toHaveBeenCalledWith(cabinUrl, handler);
  });
  it('rejects overlapping faults and a substituted route target', async () => {
    const f = liveFixture(); await f.adapter.arm('missing', 'missing');
    await expect(f.adapter.arm('held-stream', 'cancel')).rejects.toThrow(/One pending/);
    const handler = f.page.route.mock.calls[0][1];
    await expect(handler({ request: () => ({ ...f.request, url: () => cabinUrl + '?other' }) })).rejects.toThrow(/exact public/);
    await f.adapter.dispose();
  });
  it('does not classify a different failure as a cancelled stream', async () => {
    const f = liveFixture(); const fault = await f.adapter.arm('held-stream', 'cancel phase'); f.adapter.onRequest(f.request);
    f.adapter.onFailed({ ...f.request, failure: () => ({ errorText: 'net::ERR_CONNECTION_RESET' }) });
    expect(fault.closed).toBeUndefined(); await f.adapter.dispose();
  });
  it('rejects another origin before installing any browser effect', () => {
    expect(() => api('createLiveCabinFaults')({ cabinUrl: 'https://other.test/models/r35-cabin-realism-0b72bab4.glb' })).toThrow();
  });
});

describe('exact public model preflight', () => {
  it('checks pinned public GLB bytes using finite fetch bounds and denies redirects', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      const path = new URL(url).pathname;
      const manifest = JSON.parse(await readFile('modeldata/manifest.json', 'utf8'));
      const bytes = path.includes('cabin')
        ? gunzipSync(await readFile('qa/cabin-preview/r35-cabin-realism.glb.gz'))
        : Buffer.concat(await Promise.all(manifest[0].chunks.map(chunk => readFile(`modeldata/${chunk.path}`))));
      return new Response(bytes, { status: 200, headers: { 'content-type': 'model/gltf-binary', 'content-length': String(bytes.length) } });
    };
    const report = await api('verifyPublicCabinModels')({ fetchImpl });
    expect(report).toHaveLength(2);
    expect(report[0]).toMatchObject({ path: '/models/r35-cabin-realism-0b72bab4.glb', bytes: 18848516, sha256: '0b72bab4a297a9ac736e6fd65333de51e376f5364d6581ef1024423f6f146d83' });
    expect(report[1]).toMatchObject({ path: '/models/ciasny-r35.glb', bytes: 8296356, sha256: 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d' });
    expect(calls.every(({url, options}) => url.startsWith(`${origin}/models/`) && options.redirect === 'error' && options.signal instanceof AbortSignal)).toBe(true);
  });
  it('rejects a same-length cabin with one changed byte', async () => {
    const bytes = gunzipSync(await readFile('qa/cabin-preview/r35-cabin-realism.glb.gz'));
    bytes[bytes.length - 1] ^= 1;
    await expect(api('verifyPublicCabinModels')({ fetchImpl: async () => new Response(bytes, { headers: { 'content-type': 'model/gltf-binary' } }) })).rejects.toThrow(/reviewed identity/);
  });
  it('bounds streamed bytes without a Content-Length header', async () => {
    await expect(api('verifyPublicCabinModels')({ fetchImpl: async () => new Response(Buffer.alloc(18_848_517), { headers: { 'content-type': 'model/gltf-binary' } }) })).rejects.toThrow(/byte limit/);
  });
  it.each([
    ['changed bytes', () => new Response('different bytes', { headers: { 'content-type': 'model/gltf-binary' } })],
    ['404', () => new Response('missing', { status: 404 })],
    ['redirect', () => new Response(null, { status: 302, headers: { location: 'https://other.test' } })],
    ['oversized body declaration', () => new Response('x', { headers: { 'content-length': '14599521' } })],
    ['HTML fallback', () => new Response('<html>', { headers: { 'content-type': 'text/html' } })],
  ])('rejects %s before browser launch', async (_name, response) => {
    await expect(api('verifyPublicCabinModels')({ fetchImpl: async () => response() })).rejects.toThrow();
  });
});


describe('strict public fault and warning accounting', () => {
  const phase = 'Delayed download cancel and stale response ignored';
  const path = '/models/r35-cabin-realism-0b72bab4.glb';
  const record = { requestId: 4, path, phase, status: 200, injectedFault: 'throttled-stream', bodyError: 'Protocol error: No data found for resource' };
  const failure = { requestId: 4, path, phase, failure: 'net::ERR_ABORTED' };
  it('permits an interrupted body only with the exact injected and aborted request', () => {
    expect(api('isExpectedCabinBodyError')(record, [failure])).toBe(true);
    expect(api('isExpectedCabinBodyError')({ ...record, injectedFault: undefined }, [failure])).toBe(false);
    expect(api('isExpectedCabinBodyError')(record, [{ ...failure, requestId: 5 }])).toBe(false);
    expect(api('isExpectedCabinBodyError')({ ...record, bodyError: 'SHA identity mismatch' }, [failure])).toBe(false);
  });
  it('allows only the exact extension warning during the explicit context-loss check', () => {
    const item = { type: 'warning', phase: 'Real WebGL context loss and explicit viewer retry', text: 'THREE.WebGLRenderer: WEBGL_lose_context extension not supported.' };
    expect(api('isExpectedCabinWarning')(item)).toBe(true);
    expect(api('isExpectedCabinWarning')({ ...item, text: '[R3F] Error disposing renderer' })).toBe(false);
    expect(api('isExpectedCabinWarning')({ ...item, phase: 'Active cabin switch tears down without resurrection' })).toBe(false);
  });
  it('correlates a single 404 console event through its CDP network request ID', () => {
    const text = 'Failed to load resource: the server responded with a status of 404 (Not Found)';
    const item = { type: 'error', text, location: { url: cabinUrl } };
    const log = { source: 'network', level: 'error', text, url: cabinUrl, networkRequestId: 'cdp.3' };
    const response = { requestId: 'cdp.3', url: cabinUrl, status: 404, injectedFault: 'missing' };
    const records = [{ ...item }, { ...item }];
    api('correlateCabinConsole404')(records, [log, { ...log, networkRequestId: 'cdp.4' }], [response], cabinUrl);
    expect(records.map(item => item.intentional404)).toEqual([true, false]);
    const unrelated = [{ ...item }];
    api('correlateCabinConsole404')(unrelated, [{ ...log, networkRequestId: 'cdp.4' }], [response], cabinUrl);
    expect(unrelated[0].intentional404).toBe(false);
  });
  it('does not exempt an app-created 404 error or a wrong origin', () => {
    const item = { type: 'error', text: 'app says 404', location: { url: cabinUrl } };
    api('correlateCabinConsole404')([item], [], [], cabinUrl);
    expect(item.intentional404).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { isExpectedCabinRequestFailure } from '../scripts/capture-cabin-preview.mjs';
import * as policy from '../scripts/cabin-integration-policy.mjs';

const path = '/models/r35-cabin-realism-0b72bab4.glb';
const phase = 'Missing cabin preserves exterior and Retry loads real asset';
const missing = { requestId: 3, path, status: 404, injectedFault: 'missing' };
const retry = { requestId: 4, path, status: 200 };
const aborted = { requestId: 3, path, phase, failure: 'net::ERR_ABORTED' };

describe('cabin integration network fault classification', () => {
  it('allows the exact injected 404 response aborted by optional-loader cleanup', () => {
    expect(isExpectedCabinRequestFailure(aborted, [missing, retry])).toBe(true);
  });

  it('correlates a late 404 cleanup event even after the phase changes', () => {
    expect(isExpectedCabinRequestFailure({ ...aborted, phase: 'Three production seat views and keyboard/touch look' }, [missing, retry])).toBe(true);
  });

  it('does not excuse the successful retry request in the same phase', () => {
    expect(isExpectedCabinRequestFailure({ ...aborted, requestId: 4 }, [missing, retry])).toBe(false);
  });

  it.each([
    ['unmarked 404', { ...missing, injectedFault: undefined }],
    ['different request', { ...missing, requestId: 8 }],
    ['wrong status', { ...missing, status: 500 }],
    ['different asset', { ...missing, path: '/models/ciasny-r35.glb' }],
  ])('rejects an abort associated with %s', (_label, response) => {
    expect(isExpectedCabinRequestFailure(aborted, [response])).toBe(false);
  });

  it.each([
    ['a non-abort network error', { ...aborted, failure: 'net::ERR_CONNECTION_RESET' }],
    ['another asset', { ...aborted, path: '/models/ciasny-r35.glb' }],
    ['a missing request ID', { ...aborted, requestId: undefined }],
  ])('does not excuse %s', (_label, failure) => {
    expect(isExpectedCabinRequestFailure(failure, [missing])).toBe(false);
  });

  it('requires a known response even when both records lack an ID', () => {
    expect(isExpectedCabinRequestFailure({ ...aborted, requestId: undefined }, [{ ...missing, requestId: undefined }])).toBe(false);
  });

  it('retains the intentional held-stream cancel and in-flight switch cases', () => {
    for (const phase of ['Delayed download cancel and stale response ignored', 'In-flight cabin switch tears down and all other five stay photographic']) {
      expect(isExpectedCabinRequestFailure({ ...aborted, phase }, [{ ...missing, status: 200, injectedFault: 'held-stream' }])).toBe(true);
    }
  });

  it('does not excuse an ordinary request in a cancellation phase', () => {
    expect(isExpectedCabinRequestFailure({ ...aborted, phase: 'Delayed download cancel and stale response ignored' }, [{ ...missing, status: 200, injectedFault: undefined }])).toBe(false);
  });
});

it('allows only the correlated public throttled request during cancellation', () => {
  const response = { ...missing, status: 200, injectedFault: 'throttled-stream' };
  const failure = { ...aborted, phase: 'Delayed download cancel and stale response ignored' };
  expect(isExpectedCabinRequestFailure(failure, [response])).toBe(true);
  expect(isExpectedCabinRequestFailure({ ...failure, requestId: 4 }, [response])).toBe(false);
  expect(isExpectedCabinRequestFailure(aborted, [response])).toBe(false);
});

const bodyBytes = [
  gunzipSync(readFileSync('qa/cabin-preview/r35-cabin-realism.glb.gz')),
  Buffer.concat(JSON.parse(readFileSync('modeldata/manifest.json', 'utf8'))[0].chunks.map(chunk => readFileSync(`modeldata/${chunk.path}`))),
];

async function bodyFixture() {
  const cdp = new EventEmitter(), calls = [], bodies = new Map();
  const responses = [], errors = [], pageResponses = [], failures = [];
  let buffers;
  cdp.send = async (method, params) => {
    calls.push({ method, params });
    if (method === 'Network.enable') { buffers = params; return; }
    expect(method).toBe('Network.getResponseBody');
    const bytes = bodies.get(params.requestId);
    if (bytes instanceof Error) throw bytes;
    expect(bytes, 'Read only a request observed on this exact CDP session').toBeDefined();
    const body = bytes.toString('base64');
    // Chromium counts its encoded inspector content, not just the GLB's length.
    if (body.length > (buffers?.maxResourceBufferSize ?? 20_000_000)) throw new Error('Request content was evicted from inspector cache');
    return { body, base64Encoded: true };
  };
  expect(policy.observeCabinRuntimeBodies).toBeTypeOf('function');
  const observer = await policy.observeCabinRuntimeBodies({ cdp, baseUrl: 'http://127.0.0.1:4178', responses, errors, phase: () => phase });
  let id = 0;
  const add = (modelIndex, options = {}) => {
    const model = policy.cabinModels[modelIndex], requestId = ++id, networkId = `cdp.${id}`;
    const url = (options.origin ?? 'http://127.0.0.1:4178') + model.path;
    const status = options.status ?? 200;
    const record = { requestId, path: model.path, url, status, injectedFault: options.injectedFault };
    pageResponses.push(record);
    bodies.set(networkId, options.bytes ?? bodyBytes[modelIndex]);
    cdp.emit('Network.responseReceived', { requestId: networkId, response: { url, status, headers: { [policy.networkFaultHeader]: options.injectedFault } } });
    if (options.failure) {
      failures.push({ requestId, path: model.path, phase: options.phase ?? 'Delayed download cancel and stale response ignored', failure: options.failure });
      cdp.emit('Network.loadingFailed', { requestId: networkId, errorText: options.failure });
    } else if (options.complete !== false) cdp.emit('Network.loadingFinished', { requestId: networkId });
    return networkId;
  };
  return { cdp, calls, responses, errors, pageResponses, failures, observer, add };
}

describe('same-session runtime response identity without sockets', () => {
  it('buffers and hashes the actual 18.8 MB cabin response on the observing CDP session', async () => {
    const f = await bodyFixture(); f.add(0); f.add(1);
    await f.observer.verify(f.pageResponses, f.failures);
    expect(f.calls[0]).toMatchObject({ method: 'Network.enable', params: { maxResourceBufferSize: 64 * 1024 * 1024, maxTotalBufferSize: 256 * 1024 * 1024 } });
    expect(f.calls.filter(call => call.method === 'Network.getResponseBody').map(call => call.params.requestId)).toEqual(['cdp.1', 'cdp.2']);
    expect(f.responses.map(({ bytes, sha256 }) => ({ bytes, sha256 }))).toEqual(policy.cabinModels.map(({ bytes, sha256 }) => ({ bytes, sha256 })));
    expect(f.errors).toEqual([]);
  });
  it('keeps repeated successful loads distinct and reads them as each finishes', async () => {
    const f = await bodyFixture(); f.add(0); f.add(0); f.add(1);
    expect(f.calls.filter(call => call.method === 'Network.getResponseBody')).toHaveLength(3);
    await f.observer.verify(f.pageResponses, f.failures);
  });
  it('does not read aborted fault bodies, and still requires an exact successful retry', async () => {
    const f = await bodyFixture(); f.add(0, { injectedFault: 'held-stream', failure: 'net::ERR_ABORTED' }); f.add(0); f.add(1);
    await f.observer.verify(f.pageResponses, f.failures);
    expect(f.calls.filter(call => call.method === 'Network.getResponseBody').map(call => call.params.requestId)).toEqual(['cdp.2', 'cdp.3']);
  });
  it.each(['same-length wrong bytes', 'truncated bytes', 'inspector eviction'])('rejects %s for a completed successful request', async kind => {
    const f = await bodyFixture();
    const bytes = kind === 'inspector eviction' ? new Error('Protocol error: Request content was evicted from inspector cache') : Buffer.from(bodyBytes[0]);
    if (kind === 'same-length wrong bytes') bytes[bytes.length - 1] ^= 1;
    f.add(0, { bytes: kind === 'truncated bytes' ? bytes.subarray(0, -1) : bytes }); f.add(1);
    await expect(f.observer.verify(f.pageResponses, f.failures)).rejects.toThrow(/completed runtime asset/i);
    expect(f.errors).toHaveLength(1);
  });
  it('rejects an unmarked successful-request abort instead of classifying it as a test fault', async () => {
    const f = await bodyFixture(); f.add(0, { failure: 'net::ERR_ABORTED' }); f.add(0); f.add(1);
    await expect(f.observer.verify(f.pageResponses, f.failures)).rejects.toThrow(/injected cabin faults/i);
  });
  it('rejects a lost completion event even when another cabin response was verified', async () => {
    const f = await bodyFixture(); f.add(0, { complete: false }); f.add(0); f.add(1);
    await expect(f.observer.verify(f.pageResponses, f.failures)).rejects.toThrow(/completed runtime/i);
  });
  it('rejects response evidence missing from either network observer', async () => {
    const f = await bodyFixture(); f.add(0); f.add(1); f.pageResponses.pop();
    await expect(f.observer.verify(f.pageResponses, f.failures)).rejects.toThrow(/same runtime responses/i);
  });
  it.each([{ origin: 'https://other.test' }, { status: 206 }])('rejects unexpected response metadata %j', async options => {
    const f = await bodyFixture(); f.add(0, options); f.add(1);
    await expect(f.observer.verify(f.pageResponses, f.failures)).rejects.toThrow();
  });
});

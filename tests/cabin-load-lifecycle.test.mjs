import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { test } from 'vitest';
import { observeCabinLoadNetwork, observeCabinFaultResponse } from '../scripts/cabin-load-lifecycle.mjs';

const source = await readFile(new URL('../scripts/cabin-load-lifecycle.mjs', import.meta.url), 'utf8');
const url = 'https://test.invalid/models/proxy.glb';
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(options = {}) {
  let now = 0, fetchCalls = 0;
  class Reader {
    read() { assert.ok(this instanceof Reader); if (this.readError) throw this.readError; return this.next; }
    releaseLock() { assert.ok(this instanceof Reader); if (this.releaseError) throw this.releaseError; this.releases = (this.releases ?? 0) + 1; return 'released'; }
    cancel() { throw new Error('Observer must not cancel'); }
  }
  class Stream {
    constructor(reader) { this.reader = reader; }
    getReader(...args) { assert.ok(this instanceof Stream); this.args = args; return this.reader; }
    cancel() { throw new Error('Observer must not cancel'); }
    tee() { throw new Error('Observer must not clone streams'); }
  }
  class Response {
    constructor(body) { this._body = body; this.status = 200; }
    get body() { assert.ok(this instanceof Response); return this._body; }
    clone() { throw new Error('Observer must not clone responses'); }
    arrayBuffer() { throw new Error('Observer must not consume bodies'); }
  }
  class Request {
    constructor(value, signal) { this._url = value; this._signal = signal; }
    get url() { assert.ok(this instanceof Request); return this._url; }
    get signal() { assert.ok(this instanceof Request); return this._signal; }
  }
  const reader = new Reader(), stream = new Stream(reader), response = new Response(stream);
  const controller = new AbortController(), promise = Promise.resolve(response);
  const context = vm.createContext({ URL, Request, Response, EventTarget, ReadableStream: Stream, ReadableStreamDefaultReader: Reader,
    location: { href: 'https://test.invalid/' }, performance: { now: () => ++now, timeOrigin: 1000 },
    fetch(...args) { fetchCalls++; context.nativeArgs = args; context.nativeReceiver = this; if (context.fetchError) throw context.fetchError; return context.fetchPromise ?? promise; },
  });
  vm.runInContext(source.split('/** Separate from')[0].replace('export function', 'function') + `\ninstallCabinLoadLifecycle(${JSON.stringify({ urls: [url], ...options })});`, context);
  return { context, reader, stream, response, controller, promise, Request, observer: context.__cabinLoadLifecycle, calls: () => fetchCalls };
}

test('passively returns the exact native fetch promise, reader, read promise and native values', async () => {
  const f = setup(), init = { signal: f.controller.signal }, receiver = {};
  const returned = f.context.fetch.call(receiver, url, init);
  assert.equal(returned, f.promise); assert.equal(await returned, f.response);
  assert.equal(f.context.nativeReceiver, receiver); assert.equal(f.context.nativeArgs[1], init); assert.equal(f.calls(), 1);
  const options = { mode: undefined }; assert.equal(f.stream.getReader(options), f.reader); assert.equal(f.stream.args[0], options);
  f.reader.next = Promise.resolve({ done: false, value: new Uint8Array([1, 2, 3]) });
  assert.equal(f.reader.read(), f.reader.next); await tick();
  f.reader.next = Promise.resolve({ done: true }); assert.equal(f.reader.read(), f.reader.next); await tick();
  assert.equal(f.reader.releaseLock(), 'released'); assert.equal(f.reader.releases, 1);
  const s = plain(f.observer.snapshot());
  assert.equal(s.requests[0].bytesRead, 3); assert.equal(s.requests[0].chunksRead, 1); assert.equal(s.requests[0].readCalls, 2);
  assert.deepEqual(s.events.map(e => e.type), ['fetch-start', 'fetch-response', 'reader-acquired', 'reader-eof', 'reader-release']);
  assert.ok(s.events.every((e, index, events) => !index || e.at > events[index - 1].at));
  assert.deepEqual(s.issues, []); assert.equal(f.controller.signal.aborted, false);
});

test('signal abort is observed only when the application aborts, retaining native reason and caller stack', async () => {
  const f = setup(); await f.context.fetch(url, { signal: f.controller.signal });
  assert.equal(f.observer.snapshot().events.some(e => e.type === 'signal-abort'), false);
  const reason = new Error('application-owned cancellation');
  function applicationAbortCaller() { f.controller.abort(reason); }
  applicationAbortCaller();
  assert.equal(f.controller.signal.reason, reason);
  const event = f.observer.snapshot().events.find(e => e.type === 'signal-abort');
  assert.equal(event.aborted, true); assert.equal(event.reasonName, 'Error'); assert.match(event.stack, /applicationAbortCaller/);
});

test('native fetch and reader rejections remain identical and are not converted to success', async () => {
  const f = setup(), fetchError = new Error('fetch failed');
  f.context.fetchPromise = Promise.reject(fetchError);
  const promise = f.context.fetch(url, { signal: f.controller.signal }); assert.equal(promise, f.context.fetchPromise);
  await assert.rejects(promise, error => error === fetchError); await tick();
  f.context.fetchPromise = f.promise; await f.context.fetch(url, { signal: f.controller.signal }); f.stream.getReader();
  const readError = new Error('read failed'); f.reader.next = Promise.reject(readError);
  const readPromise = f.reader.read(); assert.equal(readPromise, f.reader.next);
  await assert.rejects(readPromise, error => error === readError); await tick();
  assert.ok(f.observer.snapshot().events.some(e => e.type === 'fetch-rejected'));
  assert.ok(f.observer.snapshot().events.some(e => e.type === 'reader-rejected'));
});

test('synchronous native errors and releaseLock errors are rethrown unchanged', async () => {
  const f = setup(), error = new Error('native throw'); f.context.fetchError = error;
  assert.throws(() => f.context.fetch(url, { signal: f.controller.signal }), e => e === error);
  delete f.context.fetchError; await f.context.fetch(url, { signal: f.controller.signal }); f.stream.getReader();
  f.reader.releaseError = error;
  assert.throws(() => f.reader.releaseLock(), e => e === error);
  assert.equal(f.reader.releases, undefined);
  assert.ok(f.observer.snapshot().events.some(e => e.type === 'releaseLock-threw'));
});

test('uses native Request getters without invoking custom init signal accessors', async () => {
  const f = setup();
  await f.context.fetch(new f.Request(url, f.controller.signal));
  assert.equal(f.observer.snapshot().requests.length, 1);
  let reads = 0;
  await f.context.fetch(url, { get signal() { reads++; return f.controller.signal; } });
  assert.equal(reads, 0, 'Fake native fetch does not read this accessor and neither may the observer');
  assert.ok(f.observer.snapshot().issues.some(x => /no observable plain signal/.test(x)));
});

test('does not consume, clone, read, release, abort or cancel resources by itself', async () => {
  const f = setup(); await f.context.fetch(url, { signal: f.controller.signal }); await tick();
  assert.equal(f.reader.releases, undefined); assert.equal(f.observer.snapshot().requests[0].readCalls, 0);
  assert.equal(f.controller.signal.aborted, false); assert.equal(f.calls(), 1);
  assert.deepEqual(plain(f.observer.snapshot().events.map(e => e.type)), ['fetch-start', 'fetch-response']);
});

test('keeps repeated same-URL requests distinct and snapshots detached', async () => {
  const f = setup(); await f.context.fetch(url, { signal: f.controller.signal }); await f.context.fetch(url, { signal: f.controller.signal });
  const snapshot = f.observer.snapshot(); assert.deepEqual(plain(snapshot.requests.map(r => r.ordinal)), [1, 2]);
  snapshot.requests[0].bytesRead = 999; snapshot.events.length = 0;
  assert.equal(f.observer.snapshot().requests[0].bytesRead, 0); assert.ok(f.observer.snapshot().events.length);
});

test('bounds records and reports coverage loss instead of silently dropping evidence', async () => {
  const f = setup({ maxRequests: 1, maxEvents: 1 });
  await f.context.fetch(url, { signal: f.controller.signal }); await f.context.fetch(url, { signal: f.controller.signal });
  const s = f.observer.snapshot(); assert.equal(s.requests.length, 1); assert.equal(s.events.length, 1);
  assert.ok(s.issues.some(x => /request capacity/.test(x))); assert.ok(s.issues.some(x => /event capacity/.test(x)));
});

test('leaves unrelated URLs completely outside the diagnostic', async () => {
  const f = setup(); assert.equal(f.context.fetch('https://other.invalid/private', {}), f.promise); await tick();
  assert.equal(f.calls(), 1); assert.equal(f.observer.snapshot().requests.length, 0); assert.equal(f.observer.snapshot().issues.length, 0);
});

test('CDP listener records exact IDs, monotonic completion/failure and byte totals without sending commands', () => {
  const cdp = new EventEmitter(), output = { requests: [], issues: [] }; let phase = 'initial';
  cdp.send = () => { throw new Error('Passive listener must not send CDP commands'); };
  observeCabinLoadNetwork(cdp, [url], () => phase, output);
  for (const [id, timestamp] of [['one', 1], ['two', 5]]) {
    cdp.emit('Network.requestWillBeSent', { requestId: id, request: { url }, timestamp, wallTime: 1000 + timestamp, initiator: { type: 'script' } });
    cdp.emit('Network.responseReceived', { requestId: id, timestamp: timestamp + 0.1, response: { url, status: 200 } });
  }
  cdp.emit('Network.dataReceived', { requestId: 'one', timestamp: 2, dataLength: 65536, encodedDataLength: 65536 });
  cdp.emit('Network.dataReceived', { requestId: 'one', timestamp: 3, dataLength: 890832, encodedDataLength: 890832 });
  cdp.emit('Network.loadingFinished', { requestId: 'one', timestamp: 4, encodedDataLength: 956368 });
  phase = 'late'; cdp.emit('Network.loadingFailed', { requestId: 'two', timestamp: 6, errorText: 'net::ERR_ABORTED', canceled: true });
  assert.equal(output.requests[0].dataBytes, 956368); assert.equal(output.requests[0].dataEvents, 2);
  assert.deepEqual(output.requests.map(r => r.ordinal), [1, 2]);
  assert.deepEqual(output.requests[0].terminals[0], { type: 'finished', at: 4, phase: 'initial', encodedDataLength: 956368 });
  assert.equal(output.requests[1].terminals[0].canceled, true); assert.equal(output.requests[1].terminals[0].at, 6); assert.deepEqual(output.issues, []);
});

test('server finish/close observation cannot end/destroy responses or swallow error events', () => {
  const request = new EventEmitter(), response = new EventEmitter(), fault = {};
  for (const object of [request, response]) for (const method of ['end', 'write', 'destroy']) object[method] = () => { throw new Error(`Must not ${method}`); };
  observeCabinFaultResponse(request, response, fault);
  assert.equal(request.listenerCount('error'), 0); assert.equal(response.listenerCount('error'), 0);
  response.writableEnded = true; response.writableFinished = true; response.destroyed = true;
  response.emit('finish'); response.emit('close'); request.emit('aborted');
  assert.ok(fault.lifecycle.finished.unixMs >= fault.lifecycle.started.unixMs);
  assert.equal(fault.lifecycle.closed.writableFinished, true); assert.ok(fault.lifecycle.requestAborted);
  const error = new Error('native unhandled event'); assert.throws(() => response.emit('error', error), value => value === error);
});

test('correlation joins repeated URLs by exact attempt ordinal, exposing missing evidence', async () => {
  const { correlateCabinLoadRequests } = await import('../scripts/cabin-load-lifecycle.mjs');
  const page = [{ requestId: 2, url, ordinal: 1 }, { requestId: 30, url, ordinal: 2 }, { requestId: 33, url, ordinal: 3 }];
  const browser = { timeOrigin: 1000, requests: [{ id: 2, url, ordinal: 1, startedAt: 10 }, { id: 30, url, ordinal: 2, startedAt: 20 }] };
  const network = { requests: [{ requestId: 'a.18', url, ordinal: 1, wallTime: 1.01 }, { requestId: 'a.394', url, ordinal: 2, wallTime: 1.02 }] };
  const joined = correlateCabinLoadRequests(page, browser, network);
  assert.deepEqual(joined.map(item => [item.requestId, item.browserFetchId, item.cdpRequestId]), [[2, 2, 'a.18'], [30, 30, 'a.394'], [33, null, null]]);
  assert.equal(joined[0].browserStartedUnixMs, joined[0].cdpStartedUnixMs);
});

test('previously observed released-held proxy aborts remain strict failures in both phases', async () => {
  const { isExpectedCabinRequestFailure } = await import('../scripts/cabin-integration-policy.mjs');
  const path = '/models/r35-exterior-cabin-proxy-49d7c2ab.glb';
  for (const [requestId, phase] of [[2, 'Initial exterior, WebGL and opt-in boundary'], [30, 'Full cabin arrives before proxy and late proxy remains hidden']]) {
    const failure = { requestId, path, phase, failure: 'net::ERR_ABORTED' };
    assert.equal(isExpectedCabinRequestFailure(failure, [{ requestId, path, status: 200, injectedFault: 'held-stream' }]), false);
  }
});

test('capture keeps original strict verifier and saves the scalar timeline before cleanup', async () => {
  const driver = await readFile(new URL('../scripts/capture-cabin-preview.mjs', import.meta.url), 'utf8');
  assert.ok(driver.includes('await context.addInitScript(installCabinLoadLifecycle'));
  assert.ok(driver.includes('observeCabinFaultResponse(request, response, fault)'));
  assert.ok(driver.includes("await snapshotLoadLifecycle('before-strict-hygiene')"));
  assert.ok(driver.includes('await runtimeBodies.verify(report.responses, report.requestFailures)'));
  assert.ok(driver.includes('comparison.changedPixels === 0'));
  assert.ok(driver.indexOf("load-lifecycle.json") < driver.indexOf('await browser?.close()'));
  assert.doesNotMatch(source, /\.abort\s*\(|\.cancel\s*\(|\.clone\s*\(|\.arrayBuffer\s*\(|cdp\.send\s*\(/);
});

test('CDP diagnostic capacity is bounded and incomplete coverage remains explicit', () => {
  const cdp = new EventEmitter(), output = { requests: [], issues: [] };
  observeCabinLoadNetwork(cdp, [url], () => 'test', output, 1);
  for (const requestId of ['one', 'two']) cdp.emit('Network.requestWillBeSent', { requestId, request: { url }, timestamp: 1, wallTime: 1000 });
  for (let i = 0; i < 10; i++) cdp.emit('Network.loadingFailed', { requestId: 'one', timestamp: i, errorText: 'failure' });
  assert.equal(output.requests.length, 1); assert.equal(output.requests[0].terminals.length, 4);
  assert.ok(output.issues.some(item => /capacity/.test(item))); assert.ok(output.issues.some(item => /Excess terminal/.test(item)));
});

test('stopping the CDP observer detaches only its own listeners before diagnostic cleanup', () => {
  const cdp = new EventEmitter(), output = { requests: [], issues: [] }; let originalCalls = 0;
  const existing = () => { originalCalls++; }; cdp.on('Network.loadingFailed', existing);
  const observer = observeCabinLoadNetwork(cdp, [url], () => 'test', output);
  cdp.emit('Network.requestWillBeSent', { requestId: 'one', request: { url }, timestamp: 1, wallTime: 1000 });
  observer.stop(); observer.stop();
  cdp.emit('Network.loadingFailed', { requestId: 'one', timestamp: 2, errorText: 'diagnostic browser close' });
  assert.equal(originalCalls, 1); assert.equal(output.requests[0].terminals.length, 0);
  assert.deepEqual(cdp.listeners('Network.loadingFailed'), [existing]);
});

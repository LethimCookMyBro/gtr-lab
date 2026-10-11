/** CI-only scalar timeline. No new fetch, body consumption, cancel or abort. */
export function installCabinLoadLifecycle({ urls, maxRequests = 128, maxEvents = 4096 }) {
  if (globalThis.__cabinLoadLifecycle) return;
  const allowed = new Set(urls), requests = [], events = [], issues = [];
  const streams = new WeakMap(), readers = new WeakMap();
  const issue = text => { if (!issues.includes(text) && issues.length < 32) issues.push(text); };
  const safely = action => { try { action(); } catch (error) { issue(`Observation failed: ${String(error)}`); } };
  const time = () => performance.now();
  const event = (record, type, details = {}) => {
    if (events.length >= maxEvents) { issue('Lifecycle event capacity exceeded'); return; }
    events.push({ sequence: events.length + 1, fetchId: record.id, type, at: time(), ...details });
  };
  const errorDetail = error => ({ name: typeof error?.name === 'string' ? error.name : typeof error,
    message: typeof error?.message === 'string' ? error.message.slice(0, 500) : null });
  const patch = (owner, name, before, after) => {
    const descriptor = owner && Object.getOwnPropertyDescriptor(owner, name);
    if (typeof descriptor?.value !== 'function') { issue(`Cannot observe ${name}`); return; }
    const original = descriptor.value;
    try { Object.defineProperty(owner, name, { ...descriptor, value: function (...args) {
      let record;
      safely(() => { record = before?.(this, args); });
      let result;
      try { result = Reflect.apply(original, this, args); }
      catch (error) { safely(() => { if (record) event(record, `${name}-threw`, errorDetail(error)); }); throw error; }
      safely(() => after?.(record, result, this, args));
      return result;
    } }); } catch (error) { issue(`Cannot wrap ${name}: ${String(error)}`); }
  };
  const observePromise = (promise, success, failure) => {
    // Return the original native Promise from the wrapper. This side observer
    // never replaces its settlement, value or rejection for the application.
    void Promise.prototype.then.call(promise,
      value => safely(() => success(value)),
      error => safely(() => failure(error)));
  };
  const requestUrl = Object.getOwnPropertyDescriptor(Request.prototype, 'url')?.get;
  const requestSignal = Object.getOwnPropertyDescriptor(Request.prototype, 'signal')?.get;
  const responseBody = Object.getOwnPropertyDescriptor(Response.prototype, 'body')?.get;
  if (!responseBody) issue('Response.body getter unavailable');
  patch(globalThis, 'fetch', (_receiver, args) => {
    const input = args[0];
    const url = typeof input === 'string' ? new URL(input, location.href).href
      : input instanceof Request ? requestUrl?.call(input) : null;
    if (!allowed.has(url)) return;
    if (requests.length >= maxRequests) { issue('Lifecycle request capacity exceeded'); return; }
    const signalDescriptor = args[1] && Object.getOwnPropertyDescriptor(args[1], 'signal');
    // The reviewed app passes a plain {signal}. Do not invoke an accessor twice.
    const signal = signalDescriptor && 'value' in signalDescriptor ? signalDescriptor.value
      : args[1] === undefined && input instanceof Request ? requestSignal?.call(input) : undefined;
    const record = { id: requests.length + 1, url, path: new URL(url).pathname,
      ordinal: requests.filter(item => item.url === url).length + 1, startedAt: time(),
      signalPresent: !!signal, signalAbortedAtStart: signal?.aborted ?? null,
      bytesRead: 0, chunksRead: 0, readCalls: 0 };
    requests.push(record); event(record, 'fetch-start');
    if (!signal) issue(`Fetch ${record.id} has no observable plain signal`);
    if (signal) EventTarget.prototype.addEventListener.call(signal, 'abort', function () {
      safely(() => event(record, 'signal-abort', {
        aborted: this.aborted,
        reasonName: typeof this.reason?.name === 'string' ? this.reason.name : typeof this.reason,
        // Abort dispatch is synchronous; its stack includes the application's
        // abort() caller without wrapping AbortController or cancellation APIs.
        stack: new Error('Observed signal abort').stack?.slice(0, 6000),
      }));
    }, { once: true });
    return record;
  }, (record, promise) => {
    if (!record) return;
    observePromise(promise, response => {
      event(record, 'fetch-response', { status: response.status });
      const stream = responseBody?.call(response);
      if (stream) streams.set(stream, record);
    }, error => event(record, 'fetch-rejected', errorDetail(error)));
  });
  patch(ReadableStream.prototype, 'getReader', stream => streams.get(stream), (record, reader) => {
    if (record) {
      if (!(reader instanceof ReadableStreamDefaultReader)) issue(`Fetch ${record.id} used an unsupported reader`);
      readers.set(reader, record); event(record, 'reader-acquired');
    }
  });
  patch(ReadableStreamDefaultReader.prototype, 'read', reader => readers.get(reader), (record, promise) => {
    if (!record) return;
    record.readCalls++;
    observePromise(promise, result => {
      if (result.done) event(record, 'reader-eof', { bytesRead: record.bytesRead, chunksRead: record.chunksRead });
      else {
        const now = time(); record.firstChunkAt ??= now; record.lastChunkAt = now;
        record.bytesRead += result.value.byteLength; record.chunksRead++;
      }
    }, error => event(record, 'reader-rejected', errorDetail(error)));
  });
  patch(ReadableStreamDefaultReader.prototype, 'releaseLock', reader => readers.get(reader), record => {
    if (record) event(record, 'reader-release', { bytesRead: record.bytesRead, chunksRead: record.chunksRead });
  });
  globalThis.__cabinLoadLifecycle = Object.freeze({ snapshot: () => ({
    version: 1, timeOrigin: performance.timeOrigin, snapshotAt: time(),
    requests: requests.map(record => ({ ...record })), events: events.map(record => ({ ...record })), issues: [...issues],
  }) });
}

/** Separate from the existing body verifier; receives events but sends no CDP commands. */
export function observeCabinLoadNetwork(cdp, urls, phase, output, maxRequests = 128) {
  const allowed = new Set(urls), byId = new Map(), listeners = [];
  const listen = (name, callback) => { cdp.on(name, callback); listeners.push([name, callback]); };
  const issue = message => { if (!output.issues.includes(message) && output.issues.length < 32) output.issues.push(message); };
  listen('Network.requestWillBeSent', ({ requestId, request, timestamp, wallTime, initiator }) => {
    if (!allowed.has(request.url)) return;
    if (byId.has(requestId)) { issue(`Repeated request ID ${requestId}`); return; }
    if (byId.size >= maxRequests) { issue('CDP lifecycle request capacity exceeded'); return; }
    const record = { requestId, url: request.url, path: new URL(request.url).pathname,
      ordinal: output.requests.filter(item => item.url === request.url).length + 1,
      phase: phase(), requestedAt: timestamp, wallTime, initiatorType: initiator?.type,
      dataEvents: 0, dataBytes: 0, encodedBytes: 0, terminals: [] };
    byId.set(requestId, record); output.requests.push(record);
  });
  listen('Network.responseReceived', ({ requestId, timestamp, response }) => {
    const record = byId.get(requestId);
    if (record) { record.responseAt = timestamp; record.status = response.status; }
    else if (allowed.has(response.url)) issue(`Response has no request event ${requestId}`);
  });
  listen('Network.dataReceived', ({ requestId, timestamp, dataLength, encodedDataLength }) => {
    const record = byId.get(requestId); if (!record) return;
    record.firstDataAt ??= timestamp; record.lastDataAt = timestamp;
    record.dataEvents++; record.dataBytes += dataLength; record.encodedBytes += encodedDataLength;
  });
  const terminal = (requestId, value) => {
    const record = byId.get(requestId); if (!record) return;
    if (record.terminals.length >= 4) { issue(`Excess terminal events ${requestId}`); return; }
    record.terminals.push(value);
  };
  listen('Network.loadingFinished', ({ requestId, timestamp, encodedDataLength }) => {
    terminal(requestId, { type: 'finished', at: timestamp, phase: phase(), encodedDataLength });
  });
  listen('Network.loadingFailed', ({ requestId, timestamp, errorText, canceled, blockedReason }) => {
    terminal(requestId, { type: 'failed', at: timestamp, phase: phase(), errorText, canceled, blockedReason });
  });
  return { stop() { for (const [name, callback] of listeners) cdp.off(name, callback); } };
}

export const cabinLoadTime = () => ({ unixMs: Date.now(), monotonicMs: performance.now() });

/** Only non-error event listeners: never writes/ends/destroys a request or response. */
export function observeCabinFaultResponse(request, response, fault) {
  fault.lifecycle = { started: cabinLoadTime() };
  response.once('finish', () => { fault.lifecycle.finished = cabinLoadTime(); });
  response.once('close', () => { fault.lifecycle.closed = { ...cabinLoadTime(),
    writableEnded: response.writableEnded, writableFinished: response.writableFinished, destroyed: response.destroyed }; });
  request.once('aborted', () => { fault.lifecycle.requestAborted = cabinLoadTime(); });
}

/** URL plus per-URL ordinal preserves distinct attempts across all three observers. */
export function correlateCabinLoadRequests(pageRequests, browser, network) {
  return pageRequests.map(request => {
    const sameAttempt = item => item.url === request.url && item.ordinal === request.ordinal;
    const fetch = browser?.requests.find(sameAttempt), cdp = network.requests.find(sameAttempt);
    return { requestId: request.requestId, url: request.url, ordinal: request.ordinal,
      browserFetchId: fetch?.id ?? null, cdpRequestId: cdp?.requestId ?? null,
      browserStartedUnixMs: fetch ? browser.timeOrigin + fetch.startedAt : null,
      cdpStartedUnixMs: cdp ? cdp.wallTime * 1000 : null };
  });
}

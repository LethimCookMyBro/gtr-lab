/** CI-only cabin transport observer. Native request IDs own bodies and fault fixtures. */
import assert from 'node:assert/strict';
import { budgets, models, sha256, remainingBudget, preparationOrigin } from './cabin-preparation-policy.mjs';
export const networkBuffers = Object.freeze({ maxResourceBufferSize: 32 * 1024 * 1024, maxTotalBufferSize: 128 * 1024 * 1024 });
export const failureBody = 'Explicit CI one-shot preparation transport failure';
export async function installCabinNetworkCapture(cdp, row, { baseUrl, phase, mode = 'staged' }) {
  assert.equal(baseUrl, preparationOrigin(mode));
  const url = baseUrl + models[0].path, requests = new Map(), pending = [];
  let fixture = null, interceptionEnabled = false, sequence = 0;
  row.networkObserver = { buffers: { ...networkBuffers }, fetchEnableCount: 0, fetchDisableCount: 0, closed: false };
  const command = async (receipt, method, parameters) => {
    assert.equal(receipt.interception.command, undefined, 'Each paused ID receives at most one continuation or fulfillment');
    receipt.interception.command = { method, fetchId: parameters.requestId, completed: false };
    try { await cdp.send(method, parameters); receipt.interception.command.completed = true; }
    catch (error) { receipt.interception.command.error = String(error); throw error; }
  };
  const fail = error => row.errors.push(String(error));
  const tracked = task => { const promise = Promise.resolve(task).catch(fail); pending.push(promise); return promise; };
  const on = (name, callback) => cdp.on(name, event => { try { sequence++; callback(event); } catch (error) { fail(error); } });
  const isModel = value => new URL(value).pathname === models[0].path;
  const native = id => { assert.ok(typeof id === 'string' && id.length > 0); if (!requests.has(id)) requests.set(id, { requestId: id, encodedBodyBytes: 0 }); return requests.get(id); };
  on('Network.requestWillBeSent', event => {
    if (!isModel(event.request.url)) return;
    assert.equal(event.request.url, url); assert.equal(event.request.method, 'GET');
    assert.equal(event.redirectResponse, undefined, 'The pinned cabin cannot redirect');
    const receipt = native(event.requestId); assert.equal(receipt.sent, undefined, 'Native cabin request ID cannot be reused');
    Object.assign(receipt, { sent: true, phase: phase(), url, wallTime: event.wallTime }); row.network.push(receipt);
  });
  on('Network.responseReceived', event => {
    const receipt = requests.get(event.requestId); if (!receipt) return;
    assert.equal(receipt.status, undefined, 'Duplicate native cabin response'); assert.equal(event.response.url, url);
    Object.assign(receipt, { status: event.response.status, headers: event.response.headers,
      cached: Boolean(event.response.fromDiskCache || event.response.fromServiceWorker || event.response.fromPrefetchCache) });
  });
  on('Network.loadingFailed', event => {
    const receipt = requests.get(event.requestId); if (!receipt) return;
    assert.equal(receipt.terminal, undefined, 'Duplicate terminal native receipt');
    receipt.terminalSequence = sequence; receipt.terminal = 'failed'; receipt.failed = { error: event.errorText, cancelled: event.canceled === true };
  });
  on('Network.dataReceived', event => {
    const receipt = requests.get(event.requestId); if (receipt) receipt.encodedBodyBytes += event.encodedDataLength;
  });
  on('Network.loadingFinished', event => {
    const receipt = requests.get(event.requestId); if (!receipt) return;
    assert.equal(receipt.terminal, undefined, 'Duplicate terminal native receipt');
    receipt.terminalSequence = sequence; receipt.terminal = 'finished'; receipt.encodedTotalBytes = event.encodedDataLength;
    const body = { requestId: event.requestId, path: models[0].path, status: receipt.status, phase: receipt.phase, source: 'CDP.Network.getResponseBody' };
    row.modelBodies.push(body);
    // Read immediately on this same session's completed native request. Never refetch.
    tracked((async () => { try {
      const result = await cdp.send('Network.getResponseBody', { requestId: event.requestId });
      if (receipt.status === 200) assert.equal(result.base64Encoded, true, 'The binary GLB must have lossless base64 transport');
      assert.equal(typeof result.base64Encoded, 'boolean'); assert.equal(typeof result.body, 'string');
      const bytes = Buffer.from(result.body, result.base64Encoded ? 'base64' : 'utf8');
      if (result.base64Encoded) assert.equal(bytes.toString('base64'), result.body, 'Malformed CDP base64');
      body.bytes = bytes.length; body.sha256 = sha256(bytes);
    } catch (error) { body.error = String(error); throw error; } })());
  });
  on('Fetch.requestPaused', event => {
    tracked((async () => {
      assert.equal(event.request.url, url);
      assert.equal(event.responseStatusCode, undefined, 'Fault boundary is before response delivery');
      assert.ok(typeof event.networkId === 'string' && event.networkId.length > 0, 'Fetch must supply its native Network request ID');
      const receipt = native(event.networkId); if (receipt.url) assert.equal(receipt.url, event.request.url);
      assert.equal(receipt.interception, undefined, 'A native request cannot pause twice');
      const held = { fetchId: event.requestId, requestId: event.networkId, phase: phase() };
      receipt.interception = { ...held, pausedSequence: sequence, url: event.request.url, kind: fixture?.kind ?? 'passthrough' };
      if (!fixture) { await command(receipt, 'Fetch.continueRequest', { requestId: held.fetchId }); return; }
      assert.equal(fixture.held, null, 'Only one exact cabin fetch may be held'); fixture.held = held;
      if (fixture.kind === 'failure') {
        row.expectedFailures.push({ ...held, declaredSequence: ++sequence, status: 503, reason: 'explicit-one-shot-503' });
        const body = Buffer.from(failureBody);
        await command(receipt, 'Fetch.fulfillRequest', { requestId: held.fetchId, responseCode: 503,
          responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }, { name: 'Content-Length', value: String(body.length) }], body: body.toString('base64') });
        fixture = null;
      }
    })());
  });
  await cdp.send('Network.enable', networkBuffers);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const waitFor = async (predicate, deadline) => {
    while (!predicate()) { remainingBudget(deadline); await new Promise(done => setTimeout(done, Math.min(20, remainingBudget(deadline)))); }
    remainingBudget(deadline);
  };
  const enable = async kind => {
    assert.equal(fixture, null); fixture = { kind, held: null };
    if (!interceptionEnabled) { await cdp.send('Fetch.enable', { patterns: [{ urlPattern: url, requestStage: 'Request' }] }); interceptionEnabled = true; row.networkObserver.fetchEnableCount++; } return fixture;
  };
  return {
    async hold() {
      const owner = await enable('hold'); let released = false;
      return {
        wait: deadline => waitFor(() => owner.held !== null, deadline),
        cancel(reason) { assert.ok(owner.held && !released); assert.equal(owner.cancel, undefined);
          assert.equal(native(owner.held.requestId).terminal, undefined, 'Cancellation must be declared before any native terminal event');
          assert.ok(typeof reason === 'string' && reason.length > 0); owner.cancel = reason;
          row.expectedCancellations.push({ ...owner.held, reason, declaredSequence: ++sequence }); },
        async release(deadline) {
          assert.ok(owner.held && !released); released = true;
          remainingBudget(deadline);
          const receipt = native(owner.held.requestId);
          let continuationError;
          if (receipt.terminal !== 'failed') {
            try { await command(receipt, 'Fetch.continueRequest', { requestId: owner.held.fetchId }); }
            catch (error) { continuationError = error; receipt.continuationError = String(error); }
          }
          if (owner.cancel) {
            // Even a failed continuation is forgiven only by this exact native abort.
            await waitFor(() => receipt.terminal !== undefined, deadline);
            assert.equal(receipt.terminal, 'failed'); assert.deepEqual(receipt.failed, { error: 'net::ERR_ABORTED', cancelled: true });
            receipt.interception.abortObserved = true;
          } else { assert.equal(receipt.failed, undefined); if (continuationError) throw continuationError; }
          assert.equal(fixture, owner); fixture = null;
          // Keep interception installed: disabling/unrouting is not a release action.

        },
      };
    },
    failOnce: () => enable('failure'),
    async close() {
      assert.equal(row.networkObserver.closed, false); assert.equal(fixture, null, 'Unreleased fault cannot be silently continued by teardown');
      if (interceptionEnabled) { await cdp.send('Fetch.disable'); row.networkObserver.fetchDisableCount++; }
      row.networkObserver.closed = true;
    },
    async settle() {
      let timer;
      try { await Promise.race([(async () => { let index = 0; while (index < pending.length) { const batch = pending.slice(index); index = pending.length; await Promise.all(batch); } })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native body/fixture receipt deadline exceeded')), budgets.lifecycle); })]); }
      finally { clearTimeout(timer); }
      assert.equal(fixture, null, 'Every deliberate cabin fault must be released');
      assert.equal(requests.size, row.network.length, 'Every Fetch identity must have its Network request receipt');
    },
  };
}

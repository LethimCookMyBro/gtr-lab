/** Socket-free, request-bound runtime body receipts. Never refetches or substitutes a body. */
import assert from 'node:assert/strict';
import { sha256, readinessWindow, remainingBudget } from './cabin-preparation-policy.mjs';

const immutable = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
};

/**
 * Call issue at Playwright's request event, before response.body can run. Numeric
 * request IDs identify actual Request objects, never URLs. A generation identifies
 * one real main document; SPA routing must keep its generation. The caller drains
 * and seals the old document before initiating a hard navigation.
 *
 * Pins are Map(path => { bytes, sha256 }), or the existing Map(path => sha256)
 * accompanied by intendedBytes: Map(path => bytes). No size/hash fallback exists.
 */
export function createRuntimeBodyLedger({ intendedAssets, intendedBytes, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  assert.ok(intendedAssets instanceof Map, 'Exact intended asset Map is required');
  const pins = new Map([...intendedAssets].map(([path, pin]) => {
    const expected = typeof pin === 'string' ? { sha256: pin, bytes: intendedBytes?.get(path) } : pin;
    assert.ok(typeof path === 'string' && path.startsWith('/'), 'Pinned asset path is required');
    assert.ok(Number.isSafeInteger(expected?.bytes) && expected.bytes >= 0, `Exact intended bytes required: ${path}`);
    assert.match(expected?.sha256 ?? '', /^[a-f0-9]{64}$/, `Exact intended hash required: ${path}`);
    return [path, Object.freeze({ bytes: expected.bytes, sha256: expected.sha256 })];
  }));
  const documents = new Map(), requests = new Map(), errors = [], lateEvents = [], drains = [], listeners = new Set();
  let currentGeneration = null, state = 'open', activeDrain = false;
  const signal = () => { for (const listener of [...listeners]) listener(); };
  const snapshot = () => immutable({ state, currentGeneration,
    generations: [...documents.values()].map(document => ({ ...document })),
    requests: [...requests.values()].map(record => ({ ...record.proof, bodyPending: record.bodyPending })),
    errors: errors.map(error => ({ ...error })), lateEvents: lateEvents.map(event => ({ ...event })), drains: drains.map(drain => ({ ...drain })),
  });
  const violation = (message, details = {}) => {
    const error = new Error(message);
    errors.push({ kind: 'ledger', ...details, error: String(error) });
    if (state === 'finished' || documents.get(details.generation)?.state === 'sealed') {
      state = 'failed';
      if (documents.has(details.generation)) documents.get(details.generation).state = 'failed';
    }
    signal();
    throw error;
  };
  const requireThat = (condition, message, details) => { if (!condition) violation(message, details); };
  const identity = ({ requestId, generation }) => {
    requireThat(Number.isSafeInteger(requestId) && requestId > 0, 'Exact Playwright request ID required', { requestId, generation });
    requireThat(Number.isSafeInteger(generation) && generation > 0, 'Explicit document generation required', { requestId, generation });
    const record = requests.get(requestId);
    requireThat(record && record.proof.generation === generation, 'Orphan response/failure or mismatched request generation', { requestId, generation });
    return record;
  };
  const publish = record => Object.assign(record.receipt, record.proof);
  const terminalError = (record, error, kind) => {
    // The first failure and its original bytes/hash (if any) are immutable evidence.
    if (record.proof.state !== 'error') {
      record.rawError = error;
      Object.assign(record.proof, { state: 'error', error: String(error), completedAt: now() });
      publish(record);
      Object.freeze(record.receipt);
      errors.push({ kind, requestId: record.proof.requestId, generation: record.proof.generation, error: String(error) });
    }
  };
  const beginDocument = generation => {
    requireThat(state === 'open', 'Cannot open a document after ledger closure');
    requireThat(errors.length === 0, 'Cannot open a document after a ledger error');
    requireThat(Number.isSafeInteger(generation) && generation === (currentGeneration ?? 0) + 1, 'Document generations must advance exactly once per hard navigation', { generation });
    requireThat(currentGeneration === null || documents.get(currentGeneration).state === 'sealed', 'Drain and seal the current document before hard navigation', { generation });
    documents.set(generation, { generation, state: 'open', startedAt: now() });
    currentGeneration = generation;
    signal();
  };
  const issue = ({ requestId, generation, url, path, phase, startedAt, receipt = {} }) => {
    requireThat(state === 'open' && generation === currentGeneration && documents.get(generation)?.state === 'open', 'Late request for a sealed, failed, or noncurrent document', { requestId, generation });
    requireThat(Number.isSafeInteger(requestId) && requestId > 0 && !requests.has(requestId), 'Duplicate or invalid Playwright request ID', { requestId, generation });
    requireThat(typeof url === 'string' && /^https?:\/\//.test(url), 'Exact issued request URL required', { requestId, generation });
    requireThat(pins.has(path), `Unpinned issued asset ${path}`, { requestId, generation });
    requireThat(typeof phase === 'string' && Number.isFinite(startedAt), 'Issued request phase and timing required', { requestId, generation });
    requireThat(receipt && typeof receipt === 'object' && Object.keys(receipt).length === 0 && Object.isExtensible(receipt), 'Receipt must be a fresh writable object', { requestId, generation });
    const proof = { requestId, generation, url, path, phase, startedAt, issuedAt: now(), state: 'issued' };
    const record = { proof, receipt, bodyPending: false };
    requests.set(requestId, record); publish(record); signal();
    return receipt;
  };
  const receive = ({ requestId, generation, url, status, body }) => {
    const record = identity({ requestId, generation });
    requireThat(state === 'open' && documents.get(generation)?.state === 'open', 'Late response for a closed document or ledger', { requestId, generation });
    requireThat(record.proof.state === 'issued', 'Duplicate response for an issued request', { requestId, generation });
    requireThat(url === record.proof.url, 'Response URL differs from its exact issued request', { requestId, generation });
    requireThat(Number.isInteger(status) && typeof body === 'function', 'Response status and body thunk required', { requestId, generation });
    Object.assign(record.proof, { status, state: 'receiving', responseAt: now() });
    record.bodyPending = true; publish(record);
    const completed = bytes => {
      record.bodyPending = false;
      if (record.proof.state === 'error' || state !== 'open' || documents.get(generation).state !== 'open') {
        lateEvents.push({ kind: 'late-body-completed', requestId, generation, at: now() }); signal(); return;
      }
      try {
        assert.ok(bytes instanceof Uint8Array, 'Response body must be actual bytes');
        Object.assign(record.proof, { bytes: bytes.byteLength, sha256: sha256(bytes) });
        const expected = pins.get(record.proof.path);
        assert.equal(status, 200, 'Runtime response status must be 200');
        assert.equal(record.proof.bytes, expected.bytes, 'Runtime body byte count differs from exact intended asset');
        assert.equal(record.proof.sha256, expected.sha256, 'Runtime body hash differs from exact intended asset');
        Object.assign(record.proof, { state: 'body-completed', completedAt: now() });
        publish(record); Object.freeze(record.receipt);
      } catch (error) { terminalError(record, error, 'body-validation'); }
      signal();
    };
    const rejected = error => {
      record.bodyPending = false;
      if (record.proof.state === 'error' || state !== 'open' || documents.get(generation).state !== 'open') {
        lateEvents.push({ kind: 'late-body-error', requestId, generation, at: now(), error: String(error) });
      } else terminalError(record, error, 'body');
      signal();
    };
    // Invoke now, after state is persisted; attach rejection handling in this turn.
    try { record.task = Promise.resolve(body()).then(completed, rejected); }
    catch (error) { rejected(error); record.task = Promise.resolve(); }
    signal(); return record.task;
  };
  const fail = ({ requestId, generation, error }) => {
    const record = identity({ requestId, generation });
    requireThat(state === 'open' && ['issued', 'receiving'].includes(record.proof.state), 'Late or duplicate request failure', { requestId, generation });
    requireThat(error !== undefined && error !== null, 'Raw request failure is required', { requestId, generation });
    terminalError(record, error, 'request'); signal();
  };
  const drain = ({ generation, window, sealDocument = false, finish = false }) => {
    requireThat(!activeDrain, 'A body drain is already active');
    requireThat(state !== 'finished', 'Body ledger is already finished');
    if (sealDocument) requireThat(generation === currentGeneration && documents.get(generation)?.state === 'open', 'Only the current open document can be sealed', { generation });
    // Validate the supplied original window. Neither retries nor new requests reset it.
    const original = readinessWindow(window?.budget, window?.startedAt);
    assert.deepEqual(window, original, 'Original readiness window must be retained exactly');
    const drainReceipt = { kind: finish ? 'finish' : sealDocument ? 'document' : 'all', ...(generation === undefined ? {} : { generation }), readinessWindow: original, startedAt: now(), state: 'draining' };
    drains.push(drainReceipt);
    activeDrain = true;
    const selected = () => [...requests.values()].filter(record => generation === undefined || record.proof.generation === generation);
    const pending = () => selected().filter(record => record.bodyPending || record.proof.state === 'issued' || record.proof.state === 'receiving');
    return new Promise((resolve, reject) => {
      let timer, settled = false;
      const stop = () => { settled = true; activeDrain = false; drainReceipt.completedAt = now(); listeners.delete(check); if (timer !== undefined) clearTimer(timer); };
      const failed = error => {
        state = 'failed';
        Object.assign(drainReceipt, { state: 'failed', error: String(error) });
        for (const document of documents.values()) if (document.state === 'open') Object.assign(document, { state: 'failed', sealedAt: now() });
        stop(); reject(error);
      };
      const expired = error => {
        const unresolved = pending();
        errors.push({ kind: 'deadline', ...(generation === undefined ? {} : { generation }), error: String(error), requestIds: unresolved.map(record => record.proof.requestId) });
        for (const record of unresolved) terminalError(record, error, 'deadline');
        failed(error);
      };
      const check = () => {
        if (settled) return;
        try { remainingBudget(original, now()); }
        catch (error) { expired(error); return; }
        if (pending().length) return;
        if (errors.length || state === 'failed') { failed(new Error('Runtime body ledger failed; original request errors remain in receipts')); return; }
        if (sealDocument || finish) for (const document of documents.values()) {
          if (document.state === 'open' && (finish || document.generation === generation)) Object.assign(document, { state: 'sealed', sealedAt: now(), readinessWindow: original });
        }
        if (finish) state = 'finished';
        drainReceipt.state = 'completed';
        stop(); resolve(snapshot());
      };
      const arm = () => {
        if (settled) return;
        let remaining;
        try { remaining = remainingBudget(original, now()); }
        catch (error) { expired(error); return; }
        timer = setTimer(() => { check(); if (!settled) arm(); }, remaining);
      };
      listeners.add(check); check(); arm();
    });
  };
  return Object.freeze({ beginDocument, issue, receive, fail, snapshot,
    drainAndSeal: ({ generation, window }) => drain({ generation, window, sealDocument: true }),
    drainAll: ({ window }) => drain({ window }),
    finish: ({ window }) => drain({ window, finish: true }),
  });
}

/** Safe direct-Node tests: no browser, server, request, fetch, or socket creation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRuntimeBodyLedger } from '../scripts/cabin-runtime-body-ledger.mjs';
import { sha256, readinessWindow } from '../scripts/cabin-preparation-policy.mjs';

const origin = 'https://gtr-lab-production.up.railway.app';
const body = Buffer.from('exact request body');
const pin = bytes => ({ bytes: bytes.length, sha256: sha256(bytes) });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const clock = (initial = 0) => {
  let time = initial, nextId = 0;
  const timers = new Map(), scheduled = [];
  return { now: () => time, scheduled, count: () => timers.size,
    setTimer: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, at: time + delay }); scheduled.push(delay); return id; },
    clearTimer: id => timers.delete(id),
    advance: amount => {
      time += amount;
      for (;;) {
        const entry = [...timers].find(([, timer]) => timer.at <= time);
        if (!entry) break;
        timers.delete(entry[0]); entry[1].callback();
      }
    },
  };
};
const setup = (options = {}) => {
  const timer = clock(), ledger = createRuntimeBodyLedger({ intendedAssets: new Map([['/a', pin(body)], ['/b', pin(body)]]), ...timer, ...options });
  ledger.beginDocument(1);
  const issue = (requestId, path = '/a', generation = 1) => ledger.issue({ requestId, generation, url: origin + path, path, phase: 'Home', startedAt: 1000 + requestId });
  const receive = (requestId, value = body, path = '/a', generation = 1) => ledger.receive({ requestId, generation, url: origin + path, status: 200, body: () => value });
  return { ledger, timer, issue, receive };
};

test('issued evidence exists before response; receiving persists before the body thunk runs', async () => {
  const { ledger, timer, issue } = setup();
  const receipt = issue(1), pending = deferred();
  assert.equal(receipt.state, 'issued'); assert.equal(receipt.status, undefined);
  const task = ledger.receive({ requestId: 1, generation: 1, url: origin + '/a', status: 200, body: () => {
    assert.equal(receipt.state, 'receiving'); assert.equal(ledger.snapshot().requests[0].bodyPending, true);
    return pending.promise;
  } });
  const captured = ledger.snapshot();
  assert.throws(() => { captured.requests[0].sha256 = 'forged'; }, TypeError);
  pending.resolve(body); await task;
  assert.equal(receipt.state, 'body-completed'); assert.equal(receipt.bytes, body.length); assert.equal(receipt.sha256, sha256(body));
  assert.ok(Object.isFrozen(receipt)); assert.equal(captured.requests[0].state, 'receiving');
  const finished = await ledger.finish({ window: readinessWindow(30_000, timer.now()) });
  assert.equal(finished.state, 'finished'); assert.equal(finished.generations[0].state, 'sealed'); assert.equal(timer.count(), 0);
  assert.deepEqual(finished.drains[0].readinessWindow, readinessWindow(30_000, 0));
});

test('drain includes issued-without-response and additional requests issued while awaiting bodies', async () => {
  const { ledger, timer, issue, receive } = setup();
  issue(1); const first = deferred(); receive(1, first.promise);
  const drain = ledger.drainAndSeal({ generation: 1, window: readinessWindow(15_000, 0) });
  let done = false; drain.then(() => { done = true; });
  issue(2, '/b'); first.resolve(body); await flush(); assert.equal(done, false);
  issue(3, '/a'); await receive(2, body, '/b'); await flush(); assert.equal(done, false);
  const third = deferred(); receive(3, third.promise); await flush(); assert.equal(done, false);
  third.resolve(body);
  const result = await drain;
  assert.deepEqual(result.requests.map(receipt => receipt.requestId), [1, 2, 3]);
  assert.ok(result.requests.every(receipt => receipt.state === 'body-completed'));
  assert.equal(result.generations[0].state, 'sealed'); assert.equal(timer.count(), 0);
});

test('hard navigation must seal its prior document; SPA requests retain the same generation', async () => {
  const { ledger, timer, issue, receive } = setup();
  issue(1); await receive(1);
  issue(2, '/b'); await receive(2, body, '/b'); // A route change in the existing document.
  await ledger.drainAndSeal({ generation: 1, window: readinessWindow(15_000, 0) });
  ledger.beginDocument(2); issue(3, '/a', 2); await receive(3, body, '/a', 2);
  const result = await ledger.finish({ window: readinessWindow(30_000, timer.now()) });
  assert.deepEqual(result.requests.map(receipt => receipt.generation), [1, 1, 2]);
  assert.deepEqual(result.generations.map(document => document.state), ['sealed', 'sealed']);
});

test('unsealed hard navigation fails closed even if the caller catches the synchronous error', async () => {
  const { ledger, issue, receive } = setup();
  issue(1); await receive(1);
  assert.throws(() => ledger.beginDocument(2), /Drain and seal/);
  await assert.rejects(ledger.finish({ window: readinessWindow(30_000, 0) }), /ledger failed/);
  assert.equal(ledger.snapshot().state, 'failed');
});

for (const budget of [15_000, 30_000, 90_000]) test(`${budget}ms original deadline is shared by every request without renewal`, async () => {
  const { ledger, timer, issue } = setup();
  const original = readinessWindow(budget, 0);
  issue(1); timer.advance(budget - 7);
  const rejected = assert.rejects(ledger.finish({ window: original }), /Original readiness deadline exceeded/);
  assert.deepEqual(timer.scheduled, [7]);
  timer.advance(3); issue(2, '/b'); timer.advance(3);
  assert.equal(ledger.snapshot().state, 'open');
  timer.advance(1); await rejected;
  const result = ledger.snapshot();
  assert.equal(result.state, 'failed'); assert.deepEqual(result.errors.find(error => error.kind === 'deadline').requestIds, [1, 2]);
  assert.ok(result.requests.every(receipt => receipt.state === 'error' && receipt.sha256 === undefined));
  assert.deepEqual(result.drains[0].readinessWindow, original); assert.equal(result.drains[0].state, 'failed');
  assert.equal(timer.count(), 0);
});

test('expired receipts remain failures when an unresolved body later resolves', async () => {
  const { ledger, timer, issue, receive } = setup();
  const receipt = issue(1), pending = deferred(), task = receive(1, pending.promise);
  const rejected = assert.rejects(ledger.finish({ window: readinessWindow(15_000, 0) }), /deadline exceeded/);
  timer.advance(15_000); await rejected;
  const failed = { ...receipt };
  pending.resolve(body); await task;
  assert.deepEqual(receipt, failed); assert.equal(receipt.bytes, undefined); assert.equal(receipt.sha256, undefined);
  assert.equal(ledger.snapshot().requests[0].bodyPending, false);
  assert.equal(ledger.snapshot().lateEvents[0].kind, 'late-body-completed');
  await assert.rejects(ledger.finish({ window: readinessWindow(30_000, timer.now()) }), /ledger failed/);
});

test('late body rejection is diagnostic and cannot replace the original timeout', async () => {
  const { ledger, timer, issue, receive } = setup();
  const receipt = issue(1), pending = deferred(), task = receive(1, pending.promise);
  const rejected = assert.rejects(ledger.finish({ window: readinessWindow(15_000, 0) }));
  timer.advance(15_000); await rejected;
  const originalError = receipt.error;
  pending.reject(new Error('raw late browser failure')); await task;
  assert.equal(receipt.error, originalError);
  assert.equal(ledger.snapshot().lateEvents[0].error, 'Error: raw late browser failure');
});

test('body thunk throws and promise rejections retain their exact raw error text', async () => {
  for (const asynchronous of [false, true]) {
    const { ledger, issue } = setup();
    const receipt = issue(1), raw = new Error('response.body: raw\nsecond line');
    await ledger.receive({ requestId: 1, generation: 1, url: origin + '/a', status: 200,
      body: () => { if (asynchronous) return Promise.reject(raw); throw raw; } });
    assert.equal(receipt.error, String(raw)); assert.equal(receipt.state, 'error');
    await assert.rejects(ledger.finish({ window: readinessWindow(30_000, 0) }), /ledger failed/);
    assert.equal(ledger.snapshot().errors[0].error, String(raw));
  }
});

test('all-generation cleanup waits for all active bodies even after one already failed', async () => {
  const { ledger, timer, issue, receive } = setup();
  issue(1); await receive(1); await ledger.drainAndSeal({ generation: 1, window: readinessWindow(15_000, 0) });
  ledger.beginDocument(2); issue(2, '/a', 2); issue(3, '/b', 2);
  await receive(2, Promise.reject(new Error('raw body error')), '/a', 2);
  const pending = deferred(); receive(3, pending.promise, '/b', 2);
  let settled = false;
  const finished = ledger.finish({ window: readinessWindow(30_000, 0) }).catch(error => { settled = true; throw error; });
  const rejected = assert.rejects(finished, /ledger failed/);
  await flush(); assert.equal(settled, false); assert.equal(timer.count(), 1);
  pending.resolve(body); await rejected;
  assert.equal(ledger.snapshot().requests[2].state, 'body-completed'); assert.equal(timer.count(), 0);
});

test('request failure preserves its first raw error and still drains an active body task', async () => {
  const { ledger, timer, issue, receive } = setup();
  const receipt = issue(1), pending = deferred(), task = receive(1, pending.promise);
  ledger.fail({ requestId: 1, generation: 1, error: 'net::ERR_ABORTED' });
  let settled = false;
  const finished = ledger.finish({ window: readinessWindow(30_000, 0) }).catch(error => { settled = true; throw error; });
  const rejected = assert.rejects(finished);
  await flush(); assert.equal(settled, false);
  pending.reject(new Error('response.body aborted')); await task; await rejected;
  assert.equal(receipt.error, 'net::ERR_ABORTED'); assert.equal(timer.count(), 0);
  assert.equal(ledger.snapshot().lateEvents[0].error, 'Error: response.body aborted');
});

test('byte count, hash, status and actual-byte validation cannot be waived', async () => {
  for (const override of [{ expected: { ...pin(body), bytes: body.length + 1 } }, { expected: { ...pin(body), sha256: '0'.repeat(64) } }, { status: 503 }, { value: { length: body.length, sha256: sha256(body) } }]) {
    const { ledger, issue } = setup({ intendedAssets: new Map([['/a', override.expected ?? pin(body)]]) });
    const receipt = issue(1);
    await ledger.receive({ requestId: 1, generation: 1, url: origin + '/a', status: override.status ?? 200, body: () => override.value ?? body });
    assert.equal(receipt.state, 'error');
    await assert.rejects(ledger.finish({ window: readinessWindow(30_000, 0) }));
  }
});

test('copied exact asset maps resist later hash/size mutation and require both pins', async () => {
  const expected = pin(body), intendedAssets = new Map([['/a', expected]]);
  const { ledger, issue, receive } = setup({ intendedAssets });
  expected.sha256 = '0'.repeat(64); expected.bytes++; intendedAssets.clear();
  issue(1); await receive(1); await ledger.finish({ window: readinessWindow(30_000, 0) });
  assert.throws(() => createRuntimeBodyLedger({ intendedAssets: new Map([['/a', sha256(body)]]) }), /intended bytes/);
  const alternate = setup({ intendedAssets: new Map([['/a', sha256(body)]]), intendedBytes: new Map([['/a', body.length]]) });
  alternate.issue(1); await alternate.receive(1); await alternate.ledger.finish({ window: readinessWindow(30_000, 0) });
});

test('orphan, mismatched, duplicate, unpinned and late events fail closed without reading their body', async () => {
  const mutations = [
    h => h.ledger.receive({ requestId: 2, generation: 1, url: origin + '/a', status: 200, body: () => { throw new Error('must not read orphan'); } }),
    h => h.ledger.receive({ requestId: 1, generation: 2, url: origin + '/a', status: 200, body: () => body }),
    h => h.ledger.receive({ requestId: 1, generation: 1, url: origin + '/b', status: 200, body: () => body }),
    h => h.issue(1),
    h => h.issue(2, '/unknown'),
  ];
  for (const mutate of mutations) {
    const h = setup(); h.issue(1);
    assert.throws(() => mutate(h)); await h.receive(1);
    await assert.rejects(h.ledger.finish({ window: readinessWindow(30_000, 0) }));
    assert.equal(h.ledger.snapshot().state, 'failed');
  }
  const h = setup(); h.issue(1); await h.receive(1);
  assert.throws(() => h.receive(1), /Duplicate response/);
  await assert.rejects(h.ledger.finish({ window: readinessWindow(30_000, 0) }));
  const sealed = setup(); sealed.issue(1); await sealed.receive(1);
  await sealed.ledger.drainAndSeal({ generation: 1, window: readinessWindow(15_000, 0) });
  assert.throws(() => sealed.issue(2), /Late request/);
  assert.equal(sealed.ledger.snapshot().state, 'failed');
  assert.throws(() => sealed.ledger.beginDocument(2), /after ledger closure/);
  assert.throws(() => sealed.receive(1), /Late response/);
  await assert.rejects(sealed.ledger.finish({ window: readinessWindow(30_000, 0) }));
});

test('a late event after finish immediately invalidates the ledger, without overwriting body proof', async () => {
  const { ledger, issue, receive } = setup(); const receipt = issue(1); await receive(1);
  await ledger.finish({ window: readinessWindow(30_000, 0) });
  assert.throws(() => issue(2), /Late request/);
  assert.equal(ledger.snapshot().state, 'failed'); assert.equal(receipt.state, 'body-completed');
  await assert.rejects(ledger.finish({ window: readinessWindow(30_000, 0) }));
});

test('drainAll checks every generation without falsely closing the current SPA document', async () => {
  const { ledger, issue, receive } = setup();
  issue(1); await receive(1);
  const result = await ledger.drainAll({ window: readinessWindow(30_000, 0) });
  assert.equal(result.state, 'open'); assert.equal(result.generations[0].state, 'open');
  issue(2, '/b'); await receive(2, body, '/b');
  assert.equal((await ledger.finish({ window: readinessWindow(30_000, 0) })).requests.length, 2);
});

test('a twenty-minute or mutated readiness window is rejected rather than extending proof', () => {
  const { ledger } = setup();
  assert.throws(() => ledger.finish({ window: { startedAt: 0, deadline: 1_200_000, budget: 1_200_000, clock: 'node-performance' } }));
  assert.throws(() => ledger.finish({ window: { ...readinessWindow(15_000, 0), deadline: 30_000 } }), /retained exactly/);
});

// Tiny metadata regression derived from the preserved run38172643798 desktop/mobile
// lifecycle report.json final cases. Bad/pending original IDs remain separate from
// later successful receipts; no raw reports or downloaded bodies are copied here.
const navigationAway = 'Error: response.body: Protocol error (Network.getResponseBody): No resource with given identifier found\nResponse body is not available for a response that was navigated away from. Read response.body() before triggering any navigation.';
const homePaths = new Map([
  [5, '/brand/gtr-stacked-badge.png'], [6, '/assets/dm-sans-latin-wght-normal-Xz1IZZA0.woff2'],
  [7, '/fonts/barlow-condensed/BarlowCondensed-Bold.ttf'], [8, '/brand/nissan-2001.svg'],
  [9, '/brand/gtr-stacked-badge.png'], [10, '/media/campaign-r35-orange-hero.webp'],
  [11, '/images/gtr-nismo.webp'], [12, '/media/cockpit-r35-2017-portrait.webp'], [13, '/images/gtr-premium.webp'],
]);
// Successful original same-URL report receipts supply these four pins. Other
// Home-only paths use the exact local intended public asset, never a refetch.
const reportedPins = new Map([
  ['/assets/dm-sans-latin-wght-normal-Xz1IZZA0.woff2', { bytes: 36932, sha256: '9fea608a947e67020c33cad9a6fe3d60c54119dfb8cff87768a8117a15ed7543' }],
  ['/fonts/barlow-condensed/BarlowCondensed-Bold.ttf', { bytes: 109912, sha256: 'e476562ec9c1e16cf16475895b511f08c804f438cc9a9f80a44ea50a0eeb5b65' }],
  ['/images/gtr-nismo.webp', { bytes: 233336, sha256: '4aa10326dabd5541d8d888cd657fd97d6222a0f544ee82b087a1c729ee7a0942' }],
  ['/images/gtr-premium.webp', { bytes: 315684, sha256: 'b1c71c122cc98db913d12026ba6fba15700e6d83f64500ba80f56a8d51b77a39' }],
]);
const intendedHome = async () => new Map(await Promise.all([...new Set(homePaths.values())].map(async path => [path, reportedPins.get(path) ?? pin(await readFile(new URL('../public' + path, import.meta.url)))])));

for (const fixture of [
  { viewport: 'desktop', bad: [6, 7, 5, 10, 8, 12, 13], pending: [11] },
  { viewport: 'mobile', bad: [6, 5, 9, 7, 10, 11, 8], pending: [12, 13] },
]) test(`run38172643798 ${fixture.viewport}: lost Home bodies fail promptly and pending originals cannot hang cleanup`, async () => {
  const { ledger, timer } = setup({ intendedAssets: await intendedHome() });
  const promises = new Map();
  for (const requestId of [...fixture.bad, ...fixture.pending]) {
    const path = homePaths.get(requestId);
    ledger.issue({ requestId, generation: 1, url: origin + path, path, phase: 'savedata-and-nonpremium-boundaries', startedAt: requestId });
    const value = fixture.bad.includes(requestId) ? Promise.reject(navigationAway) : deferred();
    if (fixture.pending.includes(requestId)) promises.set(requestId, value);
    const task = ledger.receive({ requestId, generation: 1, url: origin + path, status: 200, body: () => fixture.bad.includes(requestId) ? value : value.promise });
    if (fixture.bad.includes(requestId)) await task;
  }
  const failed = ledger.snapshot().requests.filter(receipt => receipt.state === 'error');
  assert.deepEqual(failed.map(receipt => receipt.requestId), fixture.bad);
  assert.ok(failed.every(receipt => receipt.error === navigationAway && receipt.sha256 === undefined));
  const finished = assert.rejects(ledger.finish({ window: readinessWindow(30_000, 0) }), /deadline exceeded/);
  timer.advance(29_999); assert.equal(ledger.snapshot().state, 'open');
  timer.advance(1); await finished;
  assert.deepEqual(ledger.snapshot().errors.find(error => error.kind === 'deadline').requestIds, fixture.pending);
  for (const [requestId, promise] of promises) promise.resolve(await readFile(new URL('../public' + homePaths.get(requestId), import.meta.url)));
  await flush();
  assert.equal(ledger.snapshot().state, 'failed');
  for (const requestId of fixture.pending) assert.equal(ledger.snapshot().requests.find(receipt => receipt.requestId === requestId).sha256, undefined);
});

test('run38172643798 later NISMO image body cannot substitute for original desktop Home request 11', async () => {
  const path = homePaths.get(11), exact = await readFile(new URL('../public' + path, import.meta.url));
  assert.deepEqual(pin(exact), reportedPins.get(path));
  const { ledger, timer } = setup({ intendedAssets: new Map([[path, reportedPins.get(path)]]) });
  for (const requestId of [11, 23]) ledger.issue({ requestId, generation: 1, url: origin + path, path, phase: 'Home', startedAt: requestId });
  const original = deferred();
  ledger.receive({ requestId: 11, generation: 1, url: origin + path, status: 200, body: () => original.promise });
  await ledger.receive({ requestId: 23, generation: 1, url: origin + path, status: 200, body: () => exact });
  assert.equal(ledger.snapshot().requests[0].sha256, undefined); assert.equal(ledger.snapshot().requests[1].sha256, reportedPins.get(path).sha256);
  const result = assert.rejects(ledger.drainAndSeal({ generation: 1, window: readinessWindow(15_000, 0) }), /deadline exceeded/);
  timer.advance(15_000); await result;
  assert.throws(() => ledger.beginDocument(2), /after ledger closure/);
  original.resolve(exact); await flush();
  assert.equal(ledger.snapshot().requests[0].state, 'error'); assert.equal(ledger.snapshot().requests[0].sha256, undefined);
});

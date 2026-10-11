import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessWindow } from '../scripts/cabin-preparation-policy.mjs';
import { boundedOperation, createCheckpointRecorder } from '../scripts/cabin-preparation-checkpoint.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function clock() { let now = 100, next = 0; const timers = new Map(); return { now: () => now, schedule: (f, delay) => { const id = ++next; timers.set(id, { f, at: now + delay }); return id; }, cancel: id => timers.delete(id), advance: n => { now += n; for (const [id, v] of [...timers]) if (v.at <= now) { timers.delete(id); v.f(); } }, timers }; }
test('checkpoint persists before observation and failure before cleanup; late settlement cannot reverse it', async () => {
  const c = clock(), row = { result: 'running', errors: [] }, saves = [], pending = deferred();
  const run = createCheckpointRecorder({ row, save: async () => saves.push(structuredClone(row)), ...c });
  const window = readinessWindow(15000, c.now()); const operation = run('postcapture snapshot', window, () => pending.promise);
  await new Promise(setImmediate); assert.equal(saves[0].checkpoints[0].status, 'started'); c.advance(15000); await assert.rejects(operation, /deadline exceeded/);
  const failed = structuredClone(row); assert.equal(saves.at(-1).result, 'failed'); pending.resolve({ misleading: 'late success' }); await new Promise(setImmediate); assert.deepEqual(row, failed);
  let dependent = false; await assert.rejects(run('Switch model', readinessWindow(15000, c.now()), () => { dependent = true; }), /seals dependent/); assert.equal(dependent, false);
  await run('context close', readinessWindow(30000, c.now()), async () => 'closed', { cleanup: true }); assert.equal(row.result, 'failed'); assert.equal(row.checkpoints.at(-1).phase, 'cleanup'); assert.equal(c.timers.size, 0);
});
test('the same absolute window bounds a multi-step operation and never reopens after expiration', async () => {
  const c = clock(), window = readinessWindow(30000, c.now());
  await boundedOperation(window, 'first', async () => c.advance(29000), c);
  const never = deferred(); const second = boundedOperation(window, 'second', () => never.promise, c); await new Promise(setImmediate);
  assert.equal([...c.timers.values()][0].at, window.deadline); c.advance(1000); await assert.rejects(second, /deadline exceeded/);
  let invoked = false; await assert.rejects(boundedOperation(window, 'expired', () => { invoked = true; }, c), /Original readiness deadline/); assert.equal(invoked, false);
});
test('synchronous errors and after-deadline resolution are failures, not successful certificates', async () => {
  const c = clock(); await assert.rejects(boundedOperation(readinessWindow(15000, c.now()), 'throw', () => { throw new Error('raw failure'); }, c), /raw failure/);
  await assert.rejects(boundedOperation(readinessWindow(15000, c.now()), 'late', async () => c.advance(15000), c), /deadline/); assert.equal(c.timers.size, 0);
});

test('shared driver persists postcapture, final navigation and retirement boundaries before cleanup', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../scripts/diagnose-cabin-preparation.mjs', import.meta.url), 'utf8');
  for (const name of ['savedata.postcapture-snapshot', 'savedata.final-switch-model', 'savedata.retirement', 'cleanup.preparation-snapshot', 'cleanup.resource-identities-and-snapshot', 'cleanup.native-fixture', 'cleanup.dpr-snapshot', 'cleanup.runtime-bodies', 'cleanup.model-network', 'cleanup.context-close']) assert.ok(source.includes(`'${name}'`), name);
  assert.match(source, /catch \(error\) \{ row.result = 'failed'; row.errors.push\(String\(error\)\); await save\(\); throw error; \}/);
  assert.match(source, /const cleanupWindow = readinessWindow\(budgets.lifecycle\)/);
  assert.match(source, /'cleanup.context-close', cleanupWindow, \(\) => context.close\(\), \{ cleanup: true \}/);
  assert.match(source, /const retirementWindow = readinessWindow\(budgets.lifecycle\); await h.checkpoint\('savedata.retirement', retirementWindow, \(\) => h.retire\(1, retirementWindow\)\)/);
  assert.doesNotMatch(source, /await save\(\); await context.close\(\)/);
});

test('Home ledger seals before hard navigation and final close cannot conceal a late request error', async () => {
  const { readFile } = await import('node:fs/promises'); const source = await readFile(new URL('../scripts/diagnose-cabin-preparation.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf("await runCase('savedata-and-nonpremium-boundaries'"));
  assert.ok(body.indexOf("'savedata.home-body-drain', homeWindow") < body.indexOf("'savedata.nismo-document'"));
  assert.ok(body.includes("assert.deepEqual(h.bodyLedger.snapshot().errors, [])"));
  assert.match(source, /requestGenerations.set\(request, documentGeneration\)/); assert.match(source, /generation: requestGenerations.get\(request\)/);
  assert.match(source, /'cleanup.context-close'[\s\S]*?assert.equal\(row.runtimeBodyLedger.state, 'finished'\); assert.deepEqual\(row.runtimeBodyLedger.errors, \[\]\); assert.deepEqual\(row.errors, \[\]\)/);
  assert.doesNotMatch(source, /Promise.all\(pendingBodies\)/);
});

test('late inner drawer completion cannot trigger dependent model click or append layout evidence', async () => {
  const c = clock(), row = { result: 'running', errors: [], layouts: [] }, inner = deferred(), effects = [];
  const run = createCheckpointRecorder({ row, save: async () => {}, ...c }); const window = readinessWindow(15000, c.now());
  const operation = run('final Switch model', window, async guard => { await inner.promise; guard(); row.layouts.push('late drawer'); effects.push('dependent model click'); });
  await new Promise(setImmediate); c.advance(15000); await assert.rejects(operation, /deadline exceeded/); const sealed = structuredClone(row);
  inner.resolve(); await new Promise(setImmediate); assert.deepEqual(effects, []); assert.deepEqual(row, sealed);
});
test('final model switch threads one original absolute window through every dependent operation', async () => {
  const { readFile } = await import('node:fs/promises'); const source = await readFile(new URL('../scripts/diagnose-cabin-preparation.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes("const switchWindow = readinessWindow(15_000); await h.checkpoint('savedata.final-switch-model', switchWindow, () => h.switchModel('nismo', switchWindow))"));
  assert.ok(source.includes("await open('Switch model', window); await tap("));
  assert.ok(source.includes("name: id === 'premium' ? /^Premium / : /^NISMO / }), window)"));
  assert.ok(source.includes('const after = await sampleDrawer(deadline); remainingBudget(deadline); row.layouts.push'));
  for (const name of ['trusted input', 'drawer sample', 'drawer terminal animation', 'model URL acknowledgement', 'model drawer dismissal']) assert.ok(source.includes(`'${name}'`));
});

test('actual shared switch implementation cannot click NISMO after its drawer sample expires', async () => {
  const { readFile } = await import('node:fs/promises'); const { remainingBudget } = await import('../scripts/cabin-preparation-policy.mjs');
  const source = await readFile(new URL('../scripts/diagnose-cabin-preparation.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('    const tap = '), end = source.indexOf('    const ready = ', start);
  const c = clock(), delayed = deferred(), effects = [], row = { result: 'running', errors: [], layouts: [], steps: [] };
  const page = { getByRole: (_role, value) => ({ click: async () => effects.push(value.name) }), locator: () => ({}), evaluate: () => delayed.promise, waitForFunction: async () => {} };
  const dialog = { getByRole: () => ({ click: async () => effects.push('NISMO selection') }) }; page.getByRole = (role, value) => role === 'dialog' ? dialog : ({ click: async () => effects.push(value.name) });
  const expect = () => ({ toHaveURL: async () => {}, toHaveCount: async () => {} });
  const make = new Function('target', 'readinessWindow', 'remainingBudget', 'boundedOperation', 'page', 'row', 'expect', 'budgets', 'assert', `${source.slice(start, end)} return switchModel;`);
  const switchModel = make({ hasTouch: false }, budget => readinessWindow(budget, c.now()), window => remainingBudget(window, c.now()), (window, label, work) => boundedOperation(window, label, work, c), page, row, expect, { lifecycle: 30000 }, assert);
  const run = createCheckpointRecorder({ row, save: async () => {}, ...c }), window = readinessWindow(15000, c.now());
  const pending = run('final Switch model', window, () => switchModel('nismo', window)); await new Promise(setImmediate);
  assert.deepEqual(effects, ['Switch model']); c.advance(15000); await assert.rejects(pending, /deadline/);
  delayed.resolve({ phase: 'open', bounds: {}, animations: [] }); await new Promise(setImmediate); assert.deepEqual(effects, ['Switch model']); assert.deepEqual(row.layouts, []); assert.equal(row.result, 'failed');
});

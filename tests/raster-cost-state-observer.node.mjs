import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installRasterStateObserver } from '../scripts/raster-cost-state-observer.mjs';
function setup() {
  const canvas = {}, snapshot = { live: true, pose: { x: 1, array: [1, 2] }, camera: { settled: true }, vehicle: { paint: 'silver' } };
  const host = { document: { querySelector: () => canvas }, performance: { now: () => 5 } }; vm.createContext(host); vm.runInContext(`(${installRasterStateObserver})()`, host);
  const emit = host.__gtrFunctionalCaptureObserver, api = host.__r35RasterState;
  emit({ kind: 'attach', owner: 1, canvas, read: () => snapshot, pending: () => false });
  emit({ kind: 'main', owner: 1, id: 1, stable: true, snapshot: structuredClone(snapshot) });
  return { emit, api, snapshot };
}
test('state seam reads only four explicit checkpoints and never requests frames or GL access', () => {
  const f = setup(); for (let i = 0; i < 4; i++) assert.equal(f.api.read().snapshot.pose.x, 1);
  assert.throws(() => f.api.read(), /four clean checkpoints/); assert.equal(f.api.snapshot().mainDraws, 1);
  assert.doesNotMatch(installRasterStateObserver.toString(), /requestAnimationFrame|setTimeout|\.getParameter|\.finish\(|\.flush\(/);
});
test('live state unrepresented by the last main draw is rejected', () => {
  const f = setup(); f.snapshot.pose.x = 2; assert.throws(() => f.api.read(), /last actual main draw/);
});
test('camera/vehicle provider order is semantically irrelevant; array order and key presence are not', () => {
  const f = setup(); const camera = f.snapshot.camera; delete f.snapshot.camera; f.snapshot.camera = camera;
  assert.equal(f.api.read().snapshot.camera.settled, true);
  const a = setup(); a.snapshot.pose.array.reverse(); assert.throws(() => a.api.read(), /last actual main draw/);
  const b = setup(); b.snapshot.vehicle.extra = null; assert.throws(() => b.api.read(), /last actual main draw/);
  const c = setup(); c.snapshot.pose.x = '1'; assert.throws(() => c.api.read(), /last actual main draw/);
});
test('an unstable main event cannot authorize a state checkpoint', () => {
  const f = setup(); f.emit({ kind: 'main', owner: 1, id: 2, stable: false, snapshot: structuredClone(f.snapshot) });
  assert.throws(() => f.api.read(), /Stable settled main/);
});
test('checkpoint eligibility waits for actual positive native retirement without issuing a GL call', () => {
  const f = setup(); assert.equal(f.api.ready(), true);
  f.emit({ kind: 'fence', owner: 1, id: 1, previous: null, draws: [1] }); assert.equal(f.api.ready(), false);
  f.emit({ kind: 'wait', owner: 1, id: 1, status: 0x911b }); assert.equal(f.api.ready(), false);
  f.emit({ kind: 'wait', owner: 1, id: 1, status: 0x911a }); assert.equal(f.api.ready(), false);
  f.emit({ kind: 'retire', owner: 1, id: 1, reason: 'signaled' }); assert.equal(f.api.ready(), true);
  assert.equal(f.api.snapshot().nativeFences[0].positive.status, 0x911a);
  f.emit({ kind: 'retire', owner: 1, id: 1, reason: 'signaled' }); assert.equal(f.api.ready(), false);
});
test('owner replacement, buffer replacement and producer invalidation reject reads', () => {
  for (const event of [{ kind: 'attach', owner: 2 }, { kind: 'buffer-replaced', owner: 1 }, { kind: 'invalid', owner: 1 }, { kind: 'stop', owner: 1 }]) {
    const f = setup(); f.emit(event); assert.throws(() => f.api.read());
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';

const source = await readFile(new URL('../scripts/cabin-resource-observer.mjs', import.meta.url), 'utf8');
function setup(options = {}) {
  const callbacks = new Map(); let nextRaf = 0;
  class Bitmap { constructor() { this.width = 32; this.height = 16; } close() { assert.ok(this instanceof Bitmap); this.width = 0; return 'closed'; } }
  class GL {
    constructor() { this.canvas = new EventTarget(); this.canvas.isConnected = true; this.canvas.matches = s => s === '.scene-stage canvas'; this.lost = false; this.calls = []; }
    createTexture() { assert.ok(this instanceof GL); return this.failCreate ? null : {}; }
    deleteTexture(value) { assert.ok(this instanceof GL); if (this.throwDelete) throw new Error('native delete failure'); this.calls.push(['delete', value]); return 'deleted'; }
    activeTexture(value) { this.calls.push(['active', value]); }
    bindTexture(...args) { this.calls.push(['bind', ...args]); }
    texImage2D(...args) { this.calls.push(['upload', ...args]); return 'upload'; }
    texSubImage2D(...args) { this.calls.push(['subupload', ...args]); return 'subupload'; }
    drawElements(...args) { if (this.throwDraw) throw new Error('native draw failure'); this.calls.push(['draw', ...args]); return 'drawn'; }
    drawArrays(...args) { this.calls.push(['draw-arrays', ...args]); return 'drawn-arrays'; }
    isContextLost() { return this.lost; }
    getExtension(name) { return this.extensions?.[name] ?? null; }
  }
  class GL2 extends GL { drawElementsInstanced(...args) { this.calls.push(['draw-instanced', ...args]); return 'instanced'; } drawArraysInstanced(...args) { this.calls.push(['draw-arrays-instanced', ...args]); } }
  const context = vm.createContext({
    console, Blob, EventTarget, ImageBitmap: Bitmap, WebGLRenderingContext: GL, WebGL2RenderingContext: GL2,
    WeakRef, crypto: webcrypto, performance, setTimeout, clearTimeout,
    requestAnimationFrame(cb) { const id = ++nextRaf; callbacks.set(id, cb); return id; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    createImageBitmap(...args) { context.lastBitmapArgs = args; return context.nextBitmapPromise ?? Promise.resolve(new Bitmap()); },
  });
  vm.runInContext(source.replace('export function installCabinResourceObserver', 'function installCabinResourceObserver') + '\ninstallCabinResourceObserver(' + JSON.stringify(options) + ');', context);
  return { context, gl: new GL2(), observer: context.__cabinResourceObserver, Bitmap, tick(timestamp = 1) { const batch = [...callbacks.values()]; callbacks.clear(); for (const cb of batch) cb.call(context, timestamp); }, callbacks };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('observer installs and serializes without module closure or browser launch', () => {
  const { observer } = setup();
  assert.equal(observer?.snapshot().version, 1);
});

test('native receivers, values, thrown errors and unique texture releases survive wrapping', () => {
  const { gl, observer } = setup();
  gl.failCreate = true; assert.equal(gl.createTexture(), null); gl.failCreate = false;
  const texture = gl.createTexture();
  gl.throwDelete = true; assert.throws(() => gl.deleteTexture(texture), /native delete failure/);
  assert.equal(observer.snapshot().textures[0].deleteCalls, 0);
  gl.throwDelete = false;
  assert.equal(gl.deleteTexture(texture), 'deleted'); gl.deleteTexture(texture); gl.deleteTexture(null);
  const [record] = observer.snapshot().textures;
  assert.equal(record.deleteCalls, 2); assert.equal(record.deletedWhileLive, true);
  assert.equal(observer.snapshot().textures.length, 1);
});

test('bitmap promise identity, decoded identity, source hash and upload texture links are preserved', async () => {
  const blob = new Blob(['candidate-image'], { type: 'image/png' });
  const sha256 = createHash('sha256').update('candidate-image').digest('hex');
  const { gl, context, observer, Bitmap } = setup({ expectedImages: [{ name: 'map', bytes: blob.size, mimeType: blob.type, sha256 }] });
  const bitmap = new Bitmap(); const promise = Promise.resolve(bitmap); context.nextBitmapPromise = promise;
  const returned = context.createImageBitmap(blob, { imageOrientation: 'flipY' });
  assert.equal(returned, promise); assert.equal(await returned, bitmap);
  await observer.settleIdentities();
  const texture = gl.createTexture(); gl.activeTexture(33985); gl.bindTexture(3553, texture);
  assert.equal(gl.texImage2D(3553, 0, 6408, 6408, 5121, bitmap), 'upload');
  assert.equal(gl.texSubImage2D(3553, 0, 0, 0, 6408, 5121, bitmap), 'subupload');
  const snap = plain(observer.snapshot());
  assert.equal(snap.bitmaps[0].sourceSha256, sha256); assert.equal(snap.bitmaps[0].sourceName, 'map');
  assert.deepEqual(snap.textures[0].bitmapIds, [snap.bitmaps[0].id]);
  assert.equal(bitmap.close(), 'closed'); bitmap.close();
  assert.equal(observer.snapshot().bitmaps[0].closeCalls, 2);
  assert.equal(bitmap.width, 0);
});

test('same-timestamp callbacks aggregate once and empty RAF frames do not erase demand-render evidence', () => {
  const { gl, context, observer, tick } = setup();
  const mark = observer.mark('seat'); let receiver;
  const id = context.requestAnimationFrame(function (t) { receiver = this; assert.equal(t, 10); gl.drawElements(4, 30, 5123, 0); });
  assert.equal(id, 1);
  context.requestAnimationFrame(() => gl.drawElementsInstanced(4, 12, 5123, 0, 3));
  tick(10); assert.equal(receiver, context);
  context.requestAnimationFrame(() => {}); tick(20);
  const frames = plain(observer.snapshot().frames);
  assert.equal(frames.length, 1); assert.equal(frames[0].calls, 2); assert.equal(frames[0].triangles, 22);
  assert.equal(frames[0].firstSequence > mark.sequence, true);
  assert.equal(frames[0].complete, true);
});

test('cancelAnimationFrame remains effective and exceptions are not hidden', () => {
  const { context, observer, tick, gl } = setup();
  const id = context.requestAnimationFrame(() => { throw new Error('should not run'); }); context.cancelAnimationFrame(id); tick(1);
  context.requestAnimationFrame(() => { throw new Error('callback error'); }); assert.throws(() => tick(2), /callback error/);
  gl.throwDraw = true; assert.throws(() => gl.drawElements(4, 3, 5123, 0), /native draw failure/);
  assert.equal(observer.snapshot().frames.length, 0);
});

test('context loss never counts as explicit texture deletion', () => {
  const { gl, observer } = setup(); const texture = gl.createTexture();
  gl.lost = true; gl.canvas.dispatchEvent(new Event('webglcontextlost'));
  assert.equal(observer.snapshot().textures[0].deleteCalls, 0);
  gl.deleteTexture(texture);
  const record = observer.snapshot().textures[0];
  assert.equal(record.deleteCalls, 1); assert.equal(record.deletedWhileLive, false);
  assert.equal(observer.snapshot().contexts[0].lostEvents, 1);
});

test('multidraw and WebGL1 instancing use one call and sum submitted instances', () => {
  const { gl, context, observer, tick } = setup();
  gl.extensions = {
    WEBGL_multi_draw: { multiDrawElementsInstancedWEBGL() { return 42; } },
    ANGLE_instanced_arrays: { drawArraysInstancedANGLE() { return 13; } },
  };
  const multi = gl.getExtension('WEBGL_multi_draw'); const angle = gl.getExtension('ANGLE_instanced_arrays');
  context.requestAnimationFrame(() => {
    assert.equal(multi.multiDrawElementsInstancedWEBGL(4, [6, 9], 0, 5123, [0, 0], 0, [2, 3], 0, 2), 42);
    assert.equal(angle.drawArraysInstancedANGLE(5, 0, 5, 2), 13);
  }); tick(1); context.requestAnimationFrame(() => {}); tick(2);
  const [frame] = observer.snapshot().frames;
  assert.equal(frame.calls, 2); assert.equal(frame.triangles, 19);
});

test('capacity bounds fail the observation rather than silently losing evidence', () => {
  const { gl, observer } = setup({ maxResources: 2 });
  gl.createTexture(); gl.createTexture(); gl.createTexture();
  assert.equal(observer.snapshot().textures.length, 2);
  assert.ok(observer.snapshot().issues.some(x => x.includes('capacity')));
});

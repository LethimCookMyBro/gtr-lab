import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installDprMotionObserver } from '../scripts/dpr-motion-observer.mjs';
function setup(options = {}, prepareCanvas = () => {}) {
  let now = 0; const queue = new Map(); let id = 0;
  class Element extends EventTarget {
    setAttribute(name, value) { if (name === 'width' || name === 'height') this[`_${name}`] = +value; return 'attribute'; }
    removeAttribute(name) { this[`_${name}`] = 300; }
  }
  class Canvas extends Element {
    constructor() { super(); this._width = 1200; this._height = 750; this.isConnected = true; this.reads = []; this.gl = { canvas: this, SAMPLES: 0x80a9, SAMPLE_BUFFERS: 0x80a8, FRAMEBUFFER_BINDING: 0x8ca6, getContextAttributes: () => { this.reads.push('attributes'); return { antialias: false, alpha: true }; }, getParameter: key => { this.reads.push(key); return key === 0x8ca6 ? null : 0; }, get drawingBufferWidth() { return this.canvas.width; }, get drawingBufferHeight() { return this.canvas.height; } }; }
    get width() { return this._width; } set width(value) { if (value === 'throw') throw new Error('native setter'); this._width = value; }
    get height() { return this._height; } set height(value) { this._height = value; }
    matches(selector) { return selector === '.scene-stage canvas'; }
    getBoundingClientRect() { return { width: 1200, height: 750, x: 0, y: 0 }; }
    getContext(name) { assert(this instanceof Canvas); if (name === 'throw') throw new Error('native context'); return name === 'webgl2' ? this.gl : null; }
  }
  const world = { HTMLCanvasElement: Canvas, Element, WeakRef, performance: { now: () => now }, devicePixelRatio: 2, innerWidth: 1440, innerHeight: 900,
    requestAnimationFrame(cb) { queue.set(++id, cb); return id; }, cancelAnimationFrame(id) { queue.delete(id); } };
  vm.runInNewContext(`(${installDprMotionObserver.toString()})(${JSON.stringify(options)})`, world);
  const canvas = new Canvas(); prepareCanvas(canvas);
  return { world, canvas, gl: canvas.getContext('webgl2', { antialias: false, alpha: true }), observer: world.__r35DprMotion, tick(t) { now = t; const copy = [...queue.values()]; queue.clear(); for (const cb of copy) cb.call(world, t); }, queue };
}
test('standalone observer does not schedule rendering, preserves getters, native returns and errors', () => {
  const h = setup(); assert.ok(h.observer); assert.equal(h.queue.size, 0); assert.equal(h.canvas.getContext('webgl2'), h.gl); assert.throws(() => h.canvas.getContext('throw'), /native context/);
  assert.throws(() => { h.canvas.width = 'throw'; }, /native setter/); assert.equal(h.canvas.width, 1200);
});
test('same-size width writes and attribute resizes are recorded with actual backing dimensions', () => {
  const h = setup(); h.observer.mark('orbit', true); h.canvas.width = 1200; h.canvas.height = 600;
  assert.equal(h.canvas.setAttribute('width', 1000), 'attribute');
  const events = h.observer.snapshot().events.filter(e => e.kind === 'canvas-write');
  assert.equal(events.length, 3); assert.equal(events[0].before, events[0].after); assert.equal(events[0].phase, 'orbit'); assert.equal(events[2].dimensions.width, 1000); assert.equal(events[2].dimensions.height, 600);
});
test('records real RAF timestamps without adding callbacks or swallowing errors', () => {
  const h = setup(); h.observer.mark('orbit', true); let receiver;
  h.world.requestAnimationFrame(function () { receiver = this; h.canvas.width = 900; }); h.tick(10);
  assert.equal(receiver, h.world); assert.equal(h.queue.size, 0); assert.equal(h.observer.snapshot().dimensions.at(-1).timestamp, 10); assert.equal(h.observer.snapshot().dimensions.at(-1).width, 900);
  const id = h.world.requestAnimationFrame(() => { throw new Error('cancelled'); }); h.world.cancelAnimationFrame(id); h.tick(20);
  h.world.requestAnimationFrame(() => { throw new Error('callback failure'); }); assert.throws(() => h.tick(30), /callback failure/);
});
test('deliberate viewport phase and stable phase retain separate context-bound identity', () => {
  const h = setup(); h.observer.mark('viewport-change', false); h.canvas.width = 700; h.observer.mark('resized-idle', true);
  const snapshot = h.observer.snapshot(); assert.equal(snapshot.phases[0].stable, false); assert.equal(snapshot.phases[1].dimensions.width, 700); assert.equal(snapshot.phases[1].contextId, 1);
});
test('context loss does not get suppressed and evidence overflow fails closed', () => {
  const h = setup({ maxRecords: 2 }); h.observer.mark('orbit', true); const event = new Event('webglcontextlost', { cancelable: true }); h.canvas.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
  for (let i = 0; i < 10; i++) h.canvas.width = 1200;
  const s = h.observer.snapshot(); assert.equal(s.contexts[0].lostEvents, 1); assert(s.issues.some(x => /capacity/.test(x))); assert(s.events.length <= 2);
});
test('detached old canvases remain part of the context-churn evidence', () => {
  const h = setup(); h.observer.mark('orbit', true); h.canvas.isConnected = false; h.canvas.matches = () => false;
  const [context] = h.observer.snapshot().contexts; assert.equal(context.sceneCanvas, true); assert.equal(context.connected, false);
});

test('MSAA evidence reads actual attributes and default-buffer samples once, only at setup creation', () => {
  const h = setup({ observeContextCreation: true });
  assert.equal(h.canvas.reads.length, 4);
  const proof = h.observer.snapshot().contexts[0].creation;
  assert.equal(proof.phase, 'setup'); assert.equal(proof.contextType, 'webgl2');
  assert.equal(proof.requestedAntialias, false); assert.equal(proof.antialias, false); assert.equal(proof.alpha, true);
  assert.equal(proof.samples, 0); assert.equal(proof.sampleBuffers, 0); assert.equal(proof.defaultFramebufferBound, true);
  assert.equal(proof.reads, 1);
  h.observer.mark('exterior-orbit', true);
  h.canvas.getContext('webgl2', { antialias: true }); h.canvas.width = 1200;
  h.world.requestAnimationFrame(() => {}); h.tick(10); h.observer.snapshot();
  assert.equal(h.canvas.reads.length, 4);
  assert.deepEqual(h.observer.snapshot().contexts[0].creation, proof);
  assert.equal(h.queue.size, 0);
});
test('historical observer never adds GL queries unless the new contract opts in', () => {
  const h = setup(); h.observer.mark('exterior-orbit', true); h.canvas.getContext('webgl2');
  assert.equal(h.canvas.reads.length, 0); assert.equal(h.observer.snapshot().contexts[0].creation, undefined);
});

test('a new context during motion fails closed without adding any GL queries', () => {
  const h = setup({ observeContextCreation: true }); h.observer.mark('exterior-orbit', true);
  const replacement = new h.canvas.constructor(); const native = replacement.gl;
  assert.equal(replacement.getContext('webgl2', { antialias: false }), native);
  assert.equal(replacement.reads.length, 0);
  const snapshot = h.observer.snapshot();
  assert.equal(snapshot.contexts.length, 2); assert.equal(snapshot.contexts[1].creation, undefined);
  assert.ok(snapshot.issues.some(issue => /outside untimed setup/.test(issue)));
});
test('native evidence query failure preserves the original context return and fails closed', () => {
  const h = setup({ observeContextCreation: true }, canvas => {
    canvas.gl.getContextAttributes = () => { throw new Error('device query unavailable'); };
  });
  assert.equal(h.gl, h.canvas.gl);
  assert.ok(h.observer.snapshot().issues.some(issue => /device query unavailable/.test(issue)));
  assert.equal(h.observer.snapshot().contexts[0].creation, undefined);
  h.observer.mark('exterior-orbit', true);
  assert.equal(h.canvas.getContext('webgl2'), h.gl);
  assert.equal(h.canvas.reads.length, 0);
});

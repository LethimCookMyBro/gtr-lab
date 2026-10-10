/**
 * CI-only browser observer. Pass this function to context.addInitScript before
 * newPage/goto. No imports or captured module values are allowed in its body.
 * Records contain IDs and scalars, never strong texture/bitmap/canvas references.
 */
export function installCabinResourceObserver(options = {}) {
  if (globalThis.__cabinResourceObserver) return;
  const maxResources = options.maxResources ?? 4096;
  const maxFrames = options.maxFrames ?? 8192;
  const expected = options.expectedImages ?? [];
  const contexts = [], textures = [], bitmaps = [], frames = [], issues = [];
  const contextIds = new WeakMap(), textureIds = new WeakMap(), bitmapIds = new WeakMap();
  const extensionSeen = new WeakSet(), pendingIdentities = new Set();
  const covered = new Set();
  let sequence = 0, phase = 'initial', rafTimestamp = null, latestTimestamp = null;
  let requestedBitmaps = 0, pendingBitmapDecodes = 0, rejectedBitmaps = 0;
  const issue = message => { if (!issues.includes(message) && issues.length < 32) issues.push(message); };
  const safely = action => { try { return action(); } catch (error) { issue(`Observer error: ${String(error)}`); } };
  const bump = () => ++sequence;
  const getContext = gl => {
    let id = contextIds.get(gl);
    if (id) return contexts[id - 1];
    if (contexts.length >= 16) { issue('Context capacity exceeded'); return null; }
    id = contexts.length + 1;
    const state = {
      id, canvas: new WeakRef(gl.canvas), activeUnit: 33984, bindings: new Map(),
      lostEvents: 0, restoredEvents: 0, lostSequence: null,
      calls: 0, triangles: 0, outsideRafCalls: 0, outsideRafTriangles: 0,
    };
    contexts.push(state); contextIds.set(gl, id);
    gl.canvas.addEventListener('webglcontextlost', () => { state.lostEvents++; state.lostSequence = bump(); });
    gl.canvas.addEventListener('webglcontextrestored', () => { state.restoredEvents++; });
    return state;
  };
  // Do not query getError, change GL state, force frames, or suppress native errors.
  const patch = (owner, name, observe, transformArgs) => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    if (!descriptor || typeof descriptor.value !== 'function') return false;
    const original = descriptor.value;
    const replacement = function (...args) {
      const forwarded = transformArgs ? transformArgs(args) : args;
      const result = Reflect.apply(original, this, forwarded);
      safely(() => observe(this, args, result));
      return result;
    };
    try { Object.defineProperty(owner, name, { ...descriptor, value: replacement }); covered.add(name); return true; }
    catch (error) { issue(`Cannot wrap ${name}: ${String(error)}`); return false; }
  };
  const patchExtensionMethod = (extension, name, observe) => {
    let owner = extension;
    while (owner && !Object.prototype.hasOwnProperty.call(owner, name)) owner = Object.getPrototypeOf(owner);
    if (!owner) return;
    // Extensions may share a prototype between contexts. Shadow its native method
    // on this exact returned extension, preserving its descriptor and receiver.
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    if (owner !== extension) Object.defineProperty(extension, name, { ...descriptor, configurable: true });
    patch(extension, name, observe);
  };
  const triangles = (mode, count, instances = 1) => {
    if (mode === 4) return Math.floor(Math.max(0, count) / 3) * instances;
    if (mode === 5 || mode === 6) return Math.max(0, count - 2) * instances;
    return 0;
  };
  const draw = (gl, method, submittedTriangles) => {
    const context = getContext(gl); if (!context) return;
    const eventSequence = bump(); context.calls++; context.triangles += submittedTriangles;
    if (rafTimestamp === null) {
      context.outsideRafCalls++; context.outsideRafTriangles += submittedTriangles; return;
    }
    let frame = frames.at(-1);
    if (!frame || frame.timestamp !== rafTimestamp || frame.contextId !== context.id) {
      // Multiple contexts in one RAF get independent records. The current app has
      // one scene context at a time, but do not combine separate contexts silently.
      frame = frames.findLast(item => item.timestamp === rafTimestamp && item.contextId === context.id);
      if (!frame) {
        if (frames.length >= maxFrames) { issue('Frame capacity exceeded'); return; }
        frame = { id: frames.length + 1, timestamp: rafTimestamp, contextId: context.id, phase,
          firstSequence: eventSequence, lastSequence: eventSequence, calls: 0, triangles: 0, methods: {} };
        frames.push(frame);
      }
    }
    frame.calls++; frame.triangles += submittedTriangles; frame.lastSequence = eventSequence;
    frame.methods[method] = (frame.methods[method] ?? 0) + 1;
  };
  const upload = (gl, args) => {
    const context = getContext(gl); if (!context) return;
    const target = args[0] >= 34069 && args[0] <= 34074 ? 34067 : args[0];
    const textureId = context.bindings.get(`${context.activeUnit}:${target}`);
    const texture = textureId ? textures[textureId - 1] : null;
    for (const value of args) {
      const bitmapId = value && typeof value === 'object' ? bitmapIds.get(value) : null;
      if (!bitmapId) continue;
      if (!texture) { issue('Bitmap upload has no observed bound texture'); continue; }
      if (!texture.bitmapIds.includes(bitmapId)) texture.bitmapIds.push(bitmapId);
      texture.uploadCalls++; texture.lastUploadSequence = bump();
    }
  };
  const nativeMethods = {
    createTexture(gl, _args, texture) {
      if (!texture) return;
      const context = getContext(gl); if (!context) return;
      if (textures.length >= maxResources) { issue('Texture capacity exceeded'); return; }
      const id = textures.length + 1; textureIds.set(texture, id);
      textures.push({ id, contextId: context.id, phase, createdSequence: bump(), deleteCalls: 0,
        deletedSequence: null, deletedWhileLive: false, bitmapIds: [], uploadCalls: 0, lastUploadSequence: null });
    },
    deleteTexture(gl, args) {
      const id = args[0] && textureIds.get(args[0]); if (!id) return;
      const context = getContext(gl), texture = textures[id - 1];
      if (texture.contextId !== context?.id) { issue('Cross-context texture deletion'); return; }
      texture.deleteCalls++; texture.deletedSequence ??= bump();
      if (!gl.isContextLost()) texture.deletedWhileLive = true;
      for (const [key, value] of context.bindings) if (value === id) context.bindings.delete(key);
    },
    activeTexture(gl, args) { const context = getContext(gl); if (context) context.activeUnit = args[0]; },
    bindTexture(gl, args) {
      const context = getContext(gl); if (!context) return;
      context.bindings.set(`${context.activeUnit}:${args[0]}`, args[1] ? textureIds.get(args[1]) : null);
    },
    texImage2D: upload, texSubImage2D: upload, texImage3D: upload, texSubImage3D: upload,
    drawArrays(gl, args) { draw(gl, 'drawArrays', triangles(args[0], args[2])); },
    drawElements(gl, args) { draw(gl, 'drawElements', triangles(args[0], args[1])); },
    drawArraysInstanced(gl, args) { draw(gl, 'drawArraysInstanced', triangles(args[0], args[2], args[3])); },
    drawElementsInstanced(gl, args) { draw(gl, 'drawElementsInstanced', triangles(args[0], args[1], args[4])); },
    drawRangeElements(gl, args) { draw(gl, 'drawRangeElements', triangles(args[0], args[3])); },
    getExtension(gl, args, extension) {
      if (!extension || extensionSeen.has(extension)) return;
      extensionSeen.add(extension);
      if (args[0] === 'ANGLE_instanced_arrays') {
        patchExtensionMethod(extension, 'drawArraysInstancedANGLE', (_self, a) => draw(gl, 'drawArraysInstancedANGLE', triangles(a[0], a[2], a[3])));
        patchExtensionMethod(extension, 'drawElementsInstancedANGLE', (_self, a) => draw(gl, 'drawElementsInstancedANGLE', triangles(a[0], a[1], a[4])));
      }
      if (args[0] === 'WEBGL_multi_draw') {
        const specs = [
          ['multiDrawArraysWEBGL', 3, 4, null, null, 5],
          ['multiDrawElementsWEBGL', 1, 2, null, null, 6],
          ['multiDrawArraysInstancedWEBGL', 3, 4, 5, 6, 7],
          ['multiDrawElementsInstancedWEBGL', 1, 2, 6, 7, 8],
        ];
        for (const [name, counts, offset, instances, instanceOffset, drawCount] of specs) {
          patchExtensionMethod(extension, name, (_self, a) => {
            let total = 0;
            for (let i = 0; i < a[drawCount]; i++) total += triangles(a[0], a[counts][a[offset] + i], instances === null ? 1 : a[instances][a[instanceOffset] + i]);
            draw(gl, name, total);
          });
        }
      }
      if (/base_instance|base_vertex/i.test(args[0])) issue(`Unsupported draw extension requested: ${args[0]}`);
    },
  };
  for (const type of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) {
    if (!type) continue;
    // Only own methods: inherited methods already wrapped on their defining class.
    for (const [name, observe] of Object.entries(nativeMethods)) patch(type.prototype, name, observe);
  }
  for (const name of ['createTexture', 'deleteTexture', 'bindTexture', 'texImage2D', 'texSubImage2D', 'drawElements', 'drawArrays']) {
    if (!covered.has(name)) issue(`Required method unavailable: ${name}`);
  }
  const bitmapType = globalThis.ImageBitmap;
  if (!bitmapType || !patch(bitmapType.prototype, 'close', (bitmap) => {
    const id = bitmapIds.get(bitmap); if (!id) { issue('Closed unobserved bitmap'); return; }
    const record = bitmaps[id - 1]; record.closeCalls++; record.closedSequence ??= bump();
  })) issue('ImageBitmap.close unavailable');
  if (!patch(globalThis, 'createImageBitmap', (_self, args, promise) => {
    const requestedSequence = bump(), requestPhase = phase; requestedBitmaps++; pendingBitmapDecodes++;
    const input = args[0];
    const identity = { sourceBytes: input instanceof Blob ? input.size : null, sourceMimeType: input instanceof Blob ? input.type : null,
      sourceSha256: null, sourceName: null };
    const matches = expected.filter(item => item.bytes === identity.sourceBytes && item.mimeType === identity.sourceMimeType);
    let identityPromise = Promise.resolve();
    if (matches.length) {
      identityPromise = input.arrayBuffer().then(bytes => crypto.subtle.digest('SHA-256', bytes)).then(bytes => {
        identity.sourceSha256 = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        identity.sourceName = matches.find(item => item.sha256 === identity.sourceSha256)?.name ?? null;
      }).catch(error => issue(`Image identity failed: ${String(error)}`));
      pendingIdentities.add(identityPromise);
      void identityPromise.then(() => pendingIdentities.delete(identityPromise));
    }
    // Observe without replacing the native Promise or delaying its consumer.
    // Both branches settle this side observer, so rejection cannot create an
    // extra unhandled Promise. The app receives the original rejection unchanged.
    void promise.then(bitmap => safely(() => {
      pendingBitmapDecodes--;
      if (bitmaps.length >= maxResources) { issue('Bitmap capacity exceeded'); return; }
      if (bitmapIds.has(bitmap)) { issue('Repeated bitmap object returned by createImageBitmap'); return; }
      const id = bitmaps.length + 1; bitmapIds.set(bitmap, id);
      const record = { id, phase: requestPhase, requestedSequence, createdSequence: bump(), width: bitmap.width, height: bitmap.height,
        closeCalls: 0, closedSequence: null, identity };
      bitmaps.push(record);
    }), () => { pendingBitmapDecodes--; rejectedBitmaps++; });
  })) issue('createImageBitmap unavailable');
  if (!patch(globalThis, 'requestAnimationFrame', () => {}, args => {
    // Leave invalid callbacks to the native method's validation.
    if (typeof args[0] !== 'function') return args;
    const callback = args[0];
    return [function (...callbackArgs) {
      const previous = rafTimestamp;
      rafTimestamp = callbackArgs[0]; latestTimestamp = rafTimestamp;
      try { return Reflect.apply(callback, this, callbackArgs); }
      finally { rafTimestamp = previous; }
    }, ...args.slice(1)];
  })) issue('requestAnimationFrame unavailable');
  Object.defineProperty(globalThis, '__cabinResourceObserver', { value: Object.freeze({
    mark(label) { phase = String(label); return { sequence: bump(), phase, lastFrameId: frames.at(-1)?.id ?? 0 }; },
    async settleIdentities() { await Promise.all([...pendingIdentities]); },
    snapshot() {
      return {
        version: 1, sequence, phase, issues: [...issues], covered: [...covered].sort(),
        requestedBitmaps, pendingBitmapDecodes, rejectedBitmaps, pendingIdentities: pendingIdentities.size,
        contexts: contexts.map(({ canvas, bindings, activeUnit, ...record }) => ({ ...record,
          canvasConnected: canvas.deref()?.isConnected ?? false, sceneCanvas: canvas.deref()?.matches?.('.scene-stage canvas') ?? false })),
        textures: textures.map(record => ({ ...record, bitmapIds: [...record.bitmapIds] })),
        bitmaps: bitmaps.map(({ identity, ...record }) => ({ ...record, ...identity })),
        frames: frames.map(record => ({ ...record, methods: { ...record.methods }, complete: record.timestamp !== latestTimestamp })),
      };
    },
  }), enumerable: false, configurable: false, writable: false });
}

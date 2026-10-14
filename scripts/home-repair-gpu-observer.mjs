/** Reconstructed narrow homepage adaptation of gpu-frame-observer.mjs.
 * Native fence, yielding zero-wait polling, deadlines and cleanup are unchanged.
 * Only owned homepage contexts participate. Additional passive bookkeeping ties
 * completed default-framebuffer draws to actual canvas scroll progress. */
export function installHomeRepairGpuObserver(options = {}) {
  if (globalThis.top && globalThis.top !== globalThis) return; // Leave provider frames completely untouched.
  if (globalThis.__r35HomeGpuFrames) throw new Error('GPU observer already installed');
  const limits = {
    windowMs: options.windowMs ?? 300_000, pollMs: options.pollMs ?? 50,
    maxPending: options.maxPending ?? 128, maxFrames: options.maxFrames ?? 2048,
    maxPolls: options.maxPolls ?? 6500, maxContexts: 4,
  };
  for (const [key, value] of Object.entries(limits)) if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid ${key}`);
  if (limits.windowMs > 300_000 || limits.pollMs < 50 || limits.maxPending > 128 || limits.maxFrames > 2048 || limits.maxPolls > 6500) throw new Error('Observer bounds cannot expand');
  const startAt = performance.now(), contexts = [], frames = [], checkpoints = [], polls = [], markers = [], issues = [], restorers = [];
  const ids = new WeakMap(), extensionSeen = new WeakSet();
  let activeCallback = null, callbackId = 0, phase = 'loading', stopped = false, stoppedAt = null, stopReason = null, deadlineTimer = null, pollTimer = null, nextPollAt = null;
  const now = () => performance.now();
  const issue = text => { if (!issues.includes(text) && issues.length < 32) issues.push(text); };
  const safe = action => { try { return action(); } catch (error) { issue(`Observer exception: ${String(error)}`); stop('observer-exception'); } };
  const isScene = canvas => Boolean(canvas?.matches?.('.home-signature-runway canvas'));
  const native = {};
  for (const name of ['fenceSync', 'clientWaitSync', 'deleteSync', 'isContextLost']) {
    let proto = globalThis.WebGL2RenderingContext?.prototype;
    while (proto && !Object.hasOwn(proto, name)) proto = Object.getPrototypeOf(proto);
    native[name] = proto && Object.getOwnPropertyDescriptor(proto, name)?.value;
  }
  function removeFence(context, item, status) {
    item.record.status = status;
    const gl = context.gl.deref();
    if (gl && item.sync) {
      try { Reflect.apply(native.deleteSync, gl, [item.sync]); item.record.deleted = true; }
      catch (error) { issue(`Sync deletion failed: ${String(error)}`); item.record.deleted = false; }
    } else { item.record.deleted = false; issue('Sync deletion unavailable after context collection'); }
    item.sync = null;
  }
  function detectContextLoss() {
    let lost = false;
    for (const context of contexts) {
      const gl = context.gl.deref();
      if (gl && Reflect.apply(native.isContextLost, gl, [])) {
        context.nativeContextLost = true; lost = true; issue('WebGL context lost (native health check)');
      }
    }
    return lost;
  }
  function stop(reason = 'manual-stop') {
    if (stopped) return;
    stopped = true; stoppedAt = now(); stopReason = reason;
    try { detectContextLoss(); } catch (error) { issue(`Context health check failed: ${String(error)}`); }
    if (deadlineTimer !== null) clearTimeout(deadlineTimer);
    if (pollTimer !== null) clearTimeout(pollTimer);
    deadlineTimer = null; pollTimer = null; nextPollAt = null;
    for (const context of contexts) {
      for (const item of context.pending) { item.record.censoredAt = stoppedAt; removeFence(context, item, 'censored'); }
      context.pending.length = 0;
      const canvas = context.canvas.deref();
      canvas?.removeEventListener('webglcontextlost', context.onLost);
      canvas?.removeEventListener('webglcontextrestored', context.onRestored);
    }
    for (const restore of restorers.reverse()) {
      try { restore(); } catch (error) { issue(`Hook restoration failed: ${String(error)}`); }
    }
    restorers.length = 0;
  }
  const totalPending = () => contexts.reduce((sum, c) => sum + c.pending.length, 0);
  function schedulePoll() {
    if (stopped || pollTimer !== null || !totalPending()) return;
    nextPollAt = now() + limits.pollMs;
    pollTimer = setTimeout(() => safe(poll), limits.pollMs);
  }
  function poll() {
    const scheduledFor = nextPollAt; pollTimer = null; nextPollAt = null;
    if (stopped) return;
    if (detectContextLoss()) { stop('context-lost'); return; }
    if (polls.length >= limits.maxPolls) { issue('Poll capacity exceeded'); stop('poll-capacity'); return; }
    const row = { id: polls.length + 1, phase, scheduledFor, startedAt: now(), pendingBefore: totalPending(), checked: 0, signaled: 0 };
    polls.push(row);
    try {
      for (const context of contexts) {
        const gl = context.gl.deref();
        if (!gl) { issue('Observed context was collected'); stop('context-collected'); break; }
        // Same-context commands are ordered. Stop at the first unobserved fence;
        // later counts mean unobserved completions, never asserted GPU queue depth.
        while (!stopped && context.pending.length) {
          const item = context.pending[0], before = now();
          const result = Reflect.apply(native.clientWaitSync, gl, [item.sync, 0, 0]);
          const after = now(); row.checked++;
          item.record.pollCount++; item.record.lastPollStartedAt = before; item.record.lastPollEndedAt = after;
          if (result === gl.TIMEOUT_EXPIRED) {
            item.record.lastUnsignaledAt = after; break;
          }
          if (detectContextLoss()) { stop('context-lost'); break; }
          if (result !== gl.ALREADY_SIGNALED && result !== gl.CONDITION_SATISFIED) {
            issue(result === gl.WAIT_FAILED ? 'clientWaitSync returned WAIT_FAILED' : `Unexpected sync status ${result}`);
            stop('wait-failure'); break;
          }
          item.record.observedSignaledAt = after;
          item.record.observableLatencyLowerMs = Math.max(0, (item.record.lastUnsignaledAt ?? item.record.fenceCallStartedAt) - item.record.fenceCallStartedAt);
          item.record.observableLatencyUpperMs = after - item.record.fenceCallStartedAt;
          item.record.completionObservationBracketMs = after - (item.record.lastUnsignaledAt ?? item.record.fenceCallStartedAt);
          removeFence(context, item, 'signaled'); context.pending.shift(); row.signaled++;
          if (item.record.kind === 'frame') context.previousCompletedFrameId = item.record.id;
        }
      }
    } finally {
      row.endedAt = now(); row.elapsedMs = row.endedAt - row.startedAt;
      row.schedulingDelayMs = Math.max(0, row.startedAt - scheduledFor); row.pendingAfter = totalPending();
      schedulePoll();
    }
  }
  function register(canvas, gl, attributes) {
    if (stopped || !gl || ids.has(gl) || !isScene(canvas)) return;
    if (!(globalThis.WebGL2RenderingContext && gl instanceof WebGL2RenderingContext)) { if (isScene(canvas)) { issue('Scene requires WebGL2 fences'); stop('webgl2-unavailable'); } return; }
    if (contexts.length >= limits.maxContexts) { issue('Context capacity exceeded'); stop('context-capacity'); return; }
    const context = { id: contexts.length + 1, gl: new WeakRef(gl), canvas: new WeakRef(canvas), pending: [], workRevision: 0, lastFenceWorkRevision: null, lastFenceId: null, lastFenceAt: null, previousCompletedFrameId: null, framebuffer: null, defaultFramebufferRevision: 0, outsideRafWorkCalls: 0, outsideRafDrawCalls: 0, sceneCanvas: isScene(canvas), nativeContextLost: false, requestedAttributes: attributes && typeof attributes === 'object' ? { antialias: attributes.antialias ?? null, alpha: attributes.alpha ?? null, preserveDrawingBuffer: attributes.preserveDrawingBuffer ?? null, powerPreference: attributes.powerPreference ?? null } : null, lostEvents: 0, restoredEvents: 0 };
    context.onLost = () => { context.lostEvents++; issue('WebGL context lost'); stop('context-lost'); };
    context.onRestored = () => { context.restoredEvents++; issue('WebGL context restored'); stop('context-restored'); };
    canvas.addEventListener('webglcontextlost', context.onLost); canvas.addEventListener('webglcontextrestored', context.onRestored);
    contexts.push(context); ids.set(gl, context);
  }
  const triangles = (mode, count, instances = 1) => (mode === 4 ? Math.floor(Math.max(0, count) / 3) : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0) * instances;
  const drawnTriangles = (name, a) => {
    if (name === 'drawArrays') return triangles(a[0], a[2]);
    if (name === 'drawElements') return triangles(a[0], a[1]);
    if (name === 'drawArraysInstanced') return triangles(a[0], a[2], a[3]);
    if (name === 'drawElementsInstanced') return triangles(a[0], a[1], a[4]);
    if (name === 'drawRangeElements') return triangles(a[0], a[3]);
    return 0;
  };
  function work(gl, name, args) {
    if (stopped) return;
    const context = ids.get(gl);
    if (!context || !isScene(context.canvas.deref())) return;
    context.sceneCanvas = true;
    if (name === 'bindFramebuffer' && (args[0] === gl.FRAMEBUFFER || args[0] === gl.DRAW_FRAMEBUFFER)) context.framebuffer = args[1];
    let item;
    if (activeCallback) {
      item = activeCallback.contexts.get(context.id);
      if (!item) {
        item = { context, calls: 0, defaultFramebufferCalls: 0, defaultFramebufferMutations: 0, triangles: 0, workCalls: 0, firstWorkAt: now(), entryPendingEarlierFrames: context.pending.length,
          entryPriorAppWorkComplete: context.lastFenceId !== null && context.pending.length === 0 && context.previousCompletedFrameId === context.lastFenceId && context.workRevision === context.lastFenceWorkRevision,
          previousCompletedFrameId: context.previousCompletedFrameId, outsideWorkSincePreviousFence: context.lastFenceWorkRevision === null ? null : context.workRevision - context.lastFenceWorkRevision,
          entryIdleSincePreviousFenceMs: context.lastFenceAt === null ? null : now() - context.lastFenceAt };
        activeCallback.contexts.set(context.id, item);
      }
      item.workCalls++;
    } else context.outsideRafWorkCalls++;
    context.workRevision++;
    if (context.framebuffer === null && ['clear','clearBufferfv','clearBufferiv','clearBufferuiv','clearBufferfi','blitFramebuffer','invalidateFramebuffer','invalidateSubFramebuffer','drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced','drawRangeElements'].includes(name)) { context.defaultFramebufferRevision++; if (item) item.defaultFramebufferMutations++; }
    for (const cp of checkpoints) if (cp.contextId === context.id && !cp.stale && cp.workRevision !== context.workRevision) { cp.stale = true; cp.staleAt = now(); cp.staleMethod = name; cp.staleRevision = context.workRevision; }
    if (['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'].includes(name)) {
      if (item) { item.calls++; if (context.framebuffer === null) item.defaultFramebufferCalls++; item.triangles += drawnTriangles(name, args); }
      else context.outsideRafDrawCalls++;
    }
  }
  function patch(owner, name, replacementFactory) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    if (typeof descriptor?.value !== 'function') return;
    const replacement = replacementFactory(descriptor.value);
    Object.defineProperty(owner, name, { ...descriptor, value: replacement });
    restorers.push(() => { if (Object.getOwnPropertyDescriptor(owner, name)?.value === replacement) Object.defineProperty(owner, name, descriptor); else issue(`Hook ownership changed: ${name}`); });
  }
  function submit(callback, returned) {
    for (const item of callback.contexts.values()) {
      if (stopped || !item.calls) continue;
      if (frames.length >= limits.maxFrames || totalPending() >= limits.maxPending) { issue(frames.length >= limits.maxFrames ? 'Frame capacity exceeded' : 'Pending fence capacity exceeded'); stop('capacity'); break; }
      const { context, ...values } = item, gl = context.gl.deref();
      if (!gl) { issue('Context unavailable at frame end'); stop('context-collected'); break; }
      const record = { kind: 'frame', id: frames.length + 1, contextId: context.id, callbackId: callback.id, timestamp: callback.timestamp, phase: callback.phase,
        callbackStartedAt: callback.startedAt, callbackEndedAt: callback.endedAt, callbackReturned: returned,
        ...values, pendingEarlierAtFence: context.pending.length, fenceCallStartedAt: now(), pollCount: 0, lastUnsignaledAt: null, status: 'pending',
        bufferWidth: gl.drawingBufferWidth, bufferHeight: gl.drawingBufferHeight, defaultFramebufferRevision: context.defaultFramebufferRevision, rearProgress: context.canvas.deref()?.getAttribute('data-rear-progress') ?? null };
      const sync = Reflect.apply(native.fenceSync, gl, [gl.SYNC_GPU_COMMANDS_COMPLETE, 0]);
      record.fenceCallEndedAt = now(); record.fenceInsertionCpuMs = record.fenceCallEndedAt - record.fenceCallStartedAt;
      if (!sync) { issue('fenceSync returned null'); stop('fence-creation-failure'); break; }
      frames.push(record); context.pending.push({ sync, record });
      context.lastFenceWorkRevision = context.workRevision; context.lastFenceId = record.id; context.lastFenceAt = record.fenceCallEndedAt;
      if (!returned) issue('Application RAF callback threw after issuing GL work');
      schedulePoll();
    }
  }
  // Identical drained-key checkpoint mechanism: no frame/invalidation, no flush,
  // zero-wait polling and at most four prefix attempts per fixed pose.
  function checkpoint(gate) {
    if (!['initial', 'rear-1', 'rear-2'].includes(gate)) throw new Error('Unknown checkpoint gate');
    if (stopped || detectContextLoss()) { if (!stopped) stop('context-lost'); throw new Error('Observer not healthy/active'); }
    const scenes = contexts.filter(context => isScene(context.canvas.deref()) && context.canvas.deref()?.isConnected);
    if (scenes.length !== 1) throw new Error('Exactly one connected scene context required');
    const context = scenes[0];
    if (activeCallback || context.pending.some(item => item.record.kind === 'frame')) return null;
    if (checkpoints.filter(cp => cp.gate === gate).length >= 4 || checkpoints.length >= 16 || totalPending() >= limits.maxPending) throw new Error('Checkpoint capacity exceeded');
    const gl = context.gl.deref();
    const record = { kind: 'checkpoint', id: checkpoints.length + 1, gate, phase, contextId: context.id, workRevision: context.workRevision, lastFrameId: frames.at(-1)?.id ?? 0, outsideRafWorkCalls: context.outsideRafWorkCalls, outsideRafDrawCalls: context.outsideRafDrawCalls, stale: false, status: 'pending', fenceCallStartedAt: now(), pollCount: 0, lastUnsignaledAt: null, bufferWidth: gl.drawingBufferWidth, bufferHeight: gl.drawingBufferHeight, defaultFramebufferRevision: context.defaultFramebufferRevision };
    const sync = Reflect.apply(native.fenceSync, gl, [gl.SYNC_GPU_COMMANDS_COMPLETE, 0]);
    record.fenceCallEndedAt = now(); record.fenceInsertionCallWallMs = record.fenceCallEndedAt - record.fenceCallStartedAt;
    if (!sync) { issue('Checkpoint fenceSync returned null'); stop('fence-creation-failure'); throw new Error('Checkpoint fence creation failed'); }
    checkpoints.push(record); context.pending.push({ sync, record }); schedulePoll(); return { ...record };
  }
  Object.defineProperty(globalThis, '__r35HomeGpuFrames', { value: Object.freeze({
    mark(name) {
      if (!['loading', 'initial-idle', 'isolated-key-input', 'isolated-key-settle', 'orbit-input', 'orbit-settle', 'finished'].includes(name)) throw new Error('Unknown GPU probe phase');
      if (stopped) throw new Error('Observer already stopped');
      if (markers.length >= 16) throw new Error('Marker capacity exceeded');
      phase = name; const row = { name, at: now(), lastFrameId: frames.at(-1)?.id ?? null, pendingObservedFrames: totalPending() }; markers.push(row); return { ...row };
    },
    checkpoint, stop,
    snapshot() {
      if (!stopped && detectContextLoss()) stop('context-lost');
      return { version: 1, startedAt: startAt, stopped, stoppedAt, stopReason, phase, limits: { ...limits }, issues: [...issues], markers: markers.map(x => ({ ...x })),
        pendingObservedFrames: totalPending(), explicitFlush: false,
        interpretation: 'Fences bound observable completion of preceding same-context commands. Pending means unobserved completion, not proven GPU queue depth. Timing includes queueing, browser scheduling, sync-cache refresh and timer delay; no pure GPU time or FPS claim.',
        contexts: contexts.map(c => ({ id: c.id, sceneCanvas: c.sceneCanvas, connected: c.canvas.deref()?.isConnected ?? false, requestedAttributes: c.requestedAttributes, pendingObservedFrames: c.pending.length, workRevision: c.workRevision, defaultFramebufferRevision: c.defaultFramebufferRevision, lastFenceWorkRevision: c.lastFenceWorkRevision, lastFenceId: c.lastFenceId, previousCompletedFrameId: c.previousCompletedFrameId, outsideRafWorkCalls: c.outsideRafWorkCalls, outsideRafDrawCalls: c.outsideRafDrawCalls, nativeContextLost: c.nativeContextLost, lostEvents: c.lostEvents, restoredEvents: c.restoredEvents })),
        frames: frames.map(r => ({ ...r })), checkpoints: checkpoints.map(cp => ({ ...cp })), polls: polls.map(p => ({ ...p })),
      };
    },
  }), configurable: false, writable: false });
  if (Object.values(native).some(fn => typeof fn !== 'function')) { issue('WebGL2 sync methods unavailable'); stop('webgl2-unavailable'); return; }
  patch(HTMLCanvasElement.prototype, 'getContext', original => function (...args) {
    const result = Reflect.apply(original, this, args);
    if (['webgl', 'experimental-webgl', 'webgl2'].includes(args[0])) safe(() => register(this, result, args[1]));
    return result;
  });
  for (const Type of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) {
    if (!Type) continue;
    for (const name of Object.getOwnPropertyNames(Type.prototype)) {
      if (name === 'constructor' || name.startsWith('get') || name.startsWith('is') || name === 'checkFramebufferStatus' || name === 'clientWaitSync') continue;
      patch(Type.prototype, name, original => function (...args) { const result = Reflect.apply(original, this, args); safe(() => work(this, name, args)); return result; });
    }
    patch(Type.prototype, 'getExtension', original => function (...args) {
      const result = Reflect.apply(original, this, args);
      if (result && ids.has(this) && !extensionSeen.has(result)) {
        extensionSeen.add(result);
        // The pinned app uses core WebGL2 draw calls. Never silently undercount
        // extension dispatches: requesting one invalidates this measurement.
        if (/multi_draw|instanced_arrays|base_vertex|base_instance/i.test(String(args[0]))) safe(() => { issue(`Unsupported drawing extension requested: ${args[0]}`); stop('unsupported-extension'); });
      }
      return result;
    });
  }
  patch(globalThis, 'requestAnimationFrame', original => function (callback, ...args) {
    if (typeof callback !== 'function') return Reflect.apply(original, this, [callback, ...args]);
    return Reflect.apply(original, this, [function (...values) {
      if (stopped) return Reflect.apply(callback, this, values);
      const previous = activeCallback;
      const current = { id: ++callbackId, timestamp: values[0], phase, startedAt: now(), contexts: new Map() };
      activeCallback = current; let returned = false;
      try { const result = Reflect.apply(callback, this, values); returned = true; return result; }
      finally { current.endedAt = now(); activeCallback = previous; safe(() => submit(current, returned)); }
    }, ...args]);
  });
  deadlineTimer = setTimeout(() => stop('window-limit'), limits.windowMs);
}

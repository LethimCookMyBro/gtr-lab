/**
 * CI-only injected observation-delay fixture. This is NOT a simulated slow GPU.
 * Pass the self-contained function to addInitScript after the resource observer.
 * Native fence/wait/delete calls always run. Only native positive waits for the
 * explicitly armed first current scene owner may be reported as TIMEOUT_EXPIRED.
 * No rendering, GL state writes, synthetic completion, app hooks or timers.
 */
export function installRenderBackpressureLifecycleFixture(options = {}) {
  if (globalThis.__r35RenderBackpressureLifecycle) return;
  const maxRecords = options.maxRecords ?? 32768;
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 32768) throw new Error('Invalid bounded fixture capacity');
  const contexts = [], fences = [], polls = [], events = [], holds = [], notices = [], retryClicks = [], issues = [];
  const contextIds = new WeakMap(), fenceIds = new WeakMap();
  let sequence = 0, phase = 'setup', firstSceneContextId = null, activeHold = null, lastNotice;
  const issue = text => { if (!issues.includes(text) && issues.length < 32) issues.push(text); };
  const stamp = () => ({ sequence: ++sequence, time: performance.now(), phase });
  const append = (list, record) => { if (list.length < maxRecords) list.push(record); else issue('Fixture record capacity exceeded'); return record; };
  const fail = text => { throw new Error(text); };
  const contextFor = gl => {
    const known = contextIds.get(gl);
    if (known) return contexts[known - 1];
    if (contexts.length >= 16) { issue('Fixture context capacity exceeded'); return null; }
    const record = { id: contexts.length + 1, canvas: new WeakRef(gl.canvas), ...stamp(), sceneOwner: gl.canvas.matches('.scene-stage canvas'), lostEvents: 0, restoredEvents: 0, lostSequence: null };
    contexts.push(record); contextIds.set(gl, record.id);
    if (record.sceneOwner && firstSceneContextId === null) firstSceneContextId = record.id;
    gl.canvas.addEventListener('webglcontextlost', () => { record.lostEvents++; record.lostSequence = ++sequence; append(events, { kind: 'context-lost', contextId: record.id, ...stamp() }); });
    gl.canvas.addEventListener('webglcontextrestored', () => { record.restoredEvents++; append(events, { kind: 'context-restored', contextId: record.id, ...stamp() }); });
    append(events, { kind: 'context-created', contextId: record.id, ...stamp() });
    return record;
  };
  const patch = (owner, name, observe) => {
    const descriptor = Object.getOwnPropertyDescriptor(owner ?? {}, name);
    if (!descriptor || typeof descriptor.value !== 'function') { issue(`Required native method unavailable: ${name}`); return; }
    const original = descriptor.value;
    try {
      Object.defineProperty(owner, name, { ...descriptor, value: function (...args) {
        let result;
        try { result = Reflect.apply(original, this, args); }
        catch (error) { append(events, { kind: 'native-exception', method: name, message: String(error), ...stamp() }); throw error; }
        try { return observe(this, args, result); }
        catch (error) { issue(`Fixture observation failed: ${String(error)}`); return result; }
      } });
    } catch (error) { issue(`Cannot wrap ${name}: ${String(error)}`); }
  };
  patch(globalThis.HTMLCanvasElement?.prototype, 'getContext', (_canvas, args, result) => {
    if (args[0] === 'webgl2' && result instanceof globalThis.WebGL2RenderingContext) contextFor(result);
    return result;
  });
  const proto = globalThis.WebGL2RenderingContext?.prototype;
  patch(proto, 'fenceSync', (gl, args, result) => {
    const context = contextFor(gl);
    if (!result) { append(events, { kind: 'null-fence', contextId: context?.id ?? null, ...stamp() }); return result; }
    if (!context || fences.length >= maxRecords) { issue('Fixture fence capacity exceeded'); return result; }
    const record = { id: fences.length + 1, contextId: context.id, condition: args[0], flags: args[1], ...stamp(), deleteCalls: 0, deletedSequence: null, deletedWhileLive: false, pollCalls: 0, pollsAfterDelete: 0 };
    // Native sealBatch replaces its old fence before deleting it. Preserve
    // that uninterrupted prefix, matching production's pendingSince lifetime.
    const overlapping = fences.filter(f => f.contextId === context.id && f.deletedSequence === null);
    record.overlappedFenceIds = overlapping.map(f => f.id);
    record.pendingPrefixTime = Math.min(record.time, ...overlapping.map(f => f.pendingPrefixTime));
    fenceIds.set(result, record.id); fences.push(record);
    return result;
  });
  patch(proto, 'clientWaitSync', (gl, args, nativeResult) => {
    const context = contextFor(gl), id = args[0] && fenceIds.get(args[0]);
    const fence = id ? fences[id - 1] : null;
    const owned = Boolean(context && fence && fence.contextId === context.id);
    if (!owned) issue('Native poll has no observed same-context fence');
    if (fence) {
      fence.pollCalls++;
      if (fence.deletedSequence !== null) { fence.pollsAfterDelete++; issue('Native poll used a deleted fence'); }
    }
    const hold = activeHold?.contextId === context?.id ? activeHold : null;
    const nativePositive = nativeResult === gl.ALREADY_SIGNALED || nativeResult === gl.CONDITION_SATISFIED;
    const lost = gl.isContextLost();
    const substituted = Boolean(hold && owned && fence.deletedSequence === null && !lost && nativePositive);
    const returnedResult = substituted ? gl.TIMEOUT_EXPIRED : nativeResult;
    const record = { contextId: context?.id ?? null, fenceId: fence?.id ?? null, holdId: hold?.id ?? null,
      flags: args[1], timeout: args[2], nativeResult: nativeResult ?? null, returnedResult: returnedResult ?? null,
      nativePositive, contextLost: lost, substituted, ...stamp() };
    append(polls, record);
    if (substituted) {
      hold.substitutions++; hold.firstSubstitutionSequence ??= record.sequence; hold.firstSubstitutionTime ??= record.time;
      if (!hold.fenceIds.includes(fence.id)) hold.fenceIds.push(fence.id);
    }
    return returnedResult;
  });
  patch(proto, 'deleteSync', (gl, args, result) => {
    const id = args[0] && fenceIds.get(args[0]);
    if (id) {
      const fence = fences[id - 1], context = contextFor(gl);
      if (fence.contextId !== context?.id) issue('Native deletion used a different context');
      fence.deleteCalls++; fence.deletedSequence ??= ++sequence;
      fence.deletedWhileLive ||= !gl.isContextLost();
      append(events, { kind: 'fence-deleted', contextId: context?.id ?? null, fenceId: id, ...stamp() });
    }
    return result;
  });
  const currentContext = () => {
    const current = [...document.querySelectorAll('.scene-stage canvas')];
    if (current.length !== 1) return fail('Exactly one current scene canvas required');
    const found = contexts.filter(record => record.canvas.deref() === current[0] && current[0].isConnected);
    if (found.length !== 1) return fail('Exactly one observed current WebGL2 context required');
    found[0].sceneOwner = true;
    firstSceneContextId ??= found[0].id;
    return found[0];
  };
  const recordNotice = () => {
    const nodes = [...document.querySelectorAll('.scene-notice')];
    const matching = nodes.filter(node => node.textContent.includes('Rendering is taking longer than usual.'));
    const pending = matching.length > 0;
    if (pending !== lastNotice) {
      lastNotice = pending;
      append(notices, { pending, count: matching.length, role: matching[0]?.getAttribute('role') ?? null,
        connectedContextIds: contexts.filter(c => c.canvas.deref()?.isConnected && c.canvas.deref()?.matches('.scene-stage canvas')).map(c => c.id), ...stamp() });
    }
  };
  const release = reason => {
    if (!activeHold) return fail('No active observation hold');
    if (!activeHold.substitutions) return fail('Hold must first observe native positive completion');
    const released = activeHold; activeHold = null;
    const s = stamp(); released.releasedSequence = s.sequence; released.releasedTime = s.time; released.releaseReason = reason;
    append(events, { kind: 'hold-released', holdId: released.id, contextId: released.contextId, reason, ...s });
    return { ...released, fenceIds: [...released.fenceIds] };
  };
  // Trusted Playwright pointer input reaches this before React's root handler.
  // Never release in page.evaluate before the click: it could erase its target.
  document.addEventListener('click', event => {
    if (!event.isTrusted || activeHold?.label !== 'manual-retry') return;
    const button = event.target?.closest?.('button');
    if (button?.textContent?.trim() !== 'Retry viewer' || !button.closest('.scene-notice')) return;
    try {
      const context = currentContext();
      if (context.id !== activeHold.contextId) return fail('Retry click does not belong to the armed current owner');
      const click = { contextId: context.id, trusted: true, capturePhase: true, ...stamp() };
      append(retryClicks, click);
      const hold = release('trusted-retry-capture'); click.releaseSequence = hold.releasedSequence;
    } catch (error) { issue(`Retry release failed: ${String(error)}`); }
  }, true);
  new MutationObserver(() => { try { recordNotice(); } catch (error) { issue(`Notice observation failed: ${String(error)}`); } }).observe(document.documentElement ?? document, { childList: true, subtree: true, characterData: true });
  recordNotice();
  Object.defineProperty(globalThis, '__r35RenderBackpressureLifecycle', { enumerable: false, configurable: false, writable: false, value: Object.freeze({
    mark(label) { phase = String(label); return stamp(); },
    armCurrent(label) {
      if (activeHold) return fail('An observation hold is already active');
      if (holds.length >= 2) return fail('Both first-owner observation cycles are complete');
      if (label !== ['completion-clear', 'manual-retry'][holds.length]) return fail('Ordered completion-clear/manual-retry holds required');
      const context = currentContext();
      if (context.id !== firstSceneContextId || context.lostEvents || context.restoredEvents) return fail('Only the first unlost current scene owner may be armed');
      activeHold = { id: holds.length + 1, label, contextId: context.id, ...stamp(), substitutions: 0, fenceIds: [], firstSubstitutionSequence: null, firstSubstitutionTime: null, releasedSequence: null, releasedTime: null, releaseReason: null };
      holds.push(activeHold);
      return { ...activeHold, fenceIds: [] };
    },
    releaseCompletion() {
      if (activeHold?.label !== 'completion-clear') return fail('Only the completion-clear hold can be released explicitly');
      return release('completion-observed');
    },
    snapshot() {
      return { version: 1, scope: 'injected-positive-observation-delay; ownership-only, not GPU speed or motion evidence', sequence, phase, firstSceneContextId, activeHoldId: activeHold?.id ?? null, issues: [...issues],
        contexts: contexts.map(({ canvas, ...record }) => ({ ...record, connected: canvas.deref()?.isConnected ?? false })),
        fences: fences.map(record => ({ ...record, overlappedFenceIds: [...record.overlappedFenceIds] })), polls: polls.map(record => ({ ...record })), events: events.map(record => ({ ...record })),
        holds: holds.map(record => ({ ...record, fenceIds: [...record.fenceIds] })), notices: notices.map(record => ({ ...record, connectedContextIds: [...record.connectedContextIds] })), retryClicks: retryClicks.map(record => ({ ...record })),
      };
    },
  }) });
}

/** External CI instrumentation; never imported by the production application. */
export function installCabinTeardownProbe({ maxEvents = 6000, slowCallMs = 8 } = {}) {
  if (window.__r35TeardownProbe) return;
  const now = () => performance.now();
  let armed = false, sequence = 0, ringCursor = 0, dropped = 0, activeFrame = null;
  let events = [], aggregate = {}, previousDOM = '', frameSequence = 0;
  let programSequence = 0, contextSequence = 0, armedAt = 0;
  let phaseKeys = new Set();
  const contexts = new WeakMap(), programs = new WeakMap(), wrappedExtensions = new WeakSet();
  const frameTotals = { draws: 0, uploads: 0, deletes: 0, firstProgramDraws: 0 };
  const record = (kind, fields = {}) => {
    if (!armed) return;
    const event = { seq: ++sequence, kind, time: now(), ...fields };
    if (events.length < maxEvents) events.push(event);
    else { events[ringCursor] = event; ringCursor = (ringCursor + 1) % maxEvents; dropped++; }
    return event;
  };
  const milestone = (kind, fields = {}) => {
    const event = record(kind, fields);
    if (event) {
      const name = `r35:${kind}:${event.seq}`;
      performance.mark(name);
      performance.clearMarks?.(name); // CDP retains the mark; avoid an unbounded browser entry buffer.
    }
  };
  const dom = () => {
    const controls = document.querySelector('footer[aria-label="Cabin preview controls"]');
    const activeSeat = controls?.querySelector('button[aria-pressed="true"]');
    const drawer = document.querySelector('[role="dialog"]');
    return {
      pathname: location.pathname,
      title: document.querySelector('.config-title h1')?.textContent ?? null,
      canvases: document.querySelectorAll('.scene-stage canvas').length,
      cabin: activeSeat ? 'active' : controls ? 'loading-or-error' : 'closed',
      seat: activeSeat?.textContent?.trim() ?? null,
      drawer: drawer?.getAttribute('data-phase') ?? (drawer ? 'present' : null),
      photo: Boolean(document.querySelector('.reference-view img')),
    };
  };
  const observeDOM = () => {
    if (!armed) return;
    const state = dom(), signature = JSON.stringify(state);
    if (signature !== previousDOM) { previousDOM = signature; milestone('dom', { state }); }
  };
  new MutationObserver(observeDOM).observe(document, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['class', 'aria-label', 'aria-pressed', 'data-phase'],
  });
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.startTime >= armedAt) record('longtask', {
        start: entry.startTime, duration: entry.duration, name: entry.name,
      });
    }).observe({ type: 'longtask', buffered: false });
  } catch (error) { /* Unsupported observers do not change app execution. */ }
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    history[name] = function (...args) {
      if (armed) milestone(`history-${name}-start`, { destination: String(args[2] ?? '') });
      try { return Reflect.apply(original, this, args); }
      finally { if (armed) { milestone(`history-${name}-end`, { pathname: location.pathname }); observeDOM(); } }
    };
  }
  document.addEventListener('click', (event) => {
    if (!armed) return;
    const button = event.target?.closest?.('button,a');
    const label = (button?.getAttribute('aria-label') || button?.textContent || '').trim().slice(0, 140);
    milestone('click-capture', { label, state: dom() });
    queueMicrotask(() => milestone('click-microtask', { label, state: dom() }));
  }, true);
  document.addEventListener('click', () => { if (armed) milestone('click-bubble', { state: dom() }); });
  const nativeRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function (callback) {
    return Reflect.apply(nativeRAF, this, [function (timestamp) {
      if (!armed) return Reflect.apply(callback, this, [timestamp]);
      const id = ++frameSequence, start = now(), before = { ...frameTotals }, state = dom();
      const parent = activeFrame;
      activeFrame = { id, start, state };
      milestone('raf-start', { id, start, state });
      try { return Reflect.apply(callback, this, [timestamp]); }
      finally {
        const end = now();
        milestone('raf-end', {
          id, start, end, duration: end - start, state,
          draws: frameTotals.draws - before.draws,
          uploads: frameTotals.uploads - before.uploads,
          deletes: frameTotals.deletes - before.deletes,
          firstProgramDraws: frameTotals.firstProgramDraws - before.firstProgramDraws,
        });
        activeFrame = parent;
      }
    }]);
  };
  const classify = (name) => /^draw/.test(name) ? 'draw'
    : /^(bufferData|bufferSubData|texImage|texSubImage|compressedTex|texStorage)/.test(name) ? 'upload'
      : /^delete|loseContext/.test(name) ? 'delete'
        : /readPixels|getBufferSubData|finish|flush|clientWaitSync|getSyncParameter/.test(name) ? 'readback-or-fence'
          : 'shader-or-state';
  const measured = (context, name, original, receiver, args) => {
    if (!armed) return Reflect.apply(original, receiver, args);
    const category = classify(name), start = now();
    const phaseKey = `${context.id}:${activeFrame?.id ?? 'sync'}:${category}`;
    // One marker per category/context/frame, never one marker per draw call.
    if (category !== 'shader-or-state' && !phaseKeys.has(phaseKey) && phaseKeys.size < maxEvents) {
      phaseKeys.add(phaseKey);
      milestone('gl-category', { category, name, context: context.id, frame: activeFrame?.id ?? null });
    }
    if (category === 'draw') frameTotals.draws++;
    if (category === 'upload') frameTotals.uploads++;
    if (category === 'delete') frameTotals.deletes++;
    let result, threw = false;
    try { result = Reflect.apply(original, receiver, args); return result; }
    catch (error) { threw = true; throw error; }
    finally {
      const duration = now() - start;
      const key = `${context.id}:${name}`;
      const total = aggregate[key] ??= { context: context.id, method: name, category, count: 0, totalMs: 0, maxMs: 0 };
      total.count++; total.totalMs += duration; total.maxMs = Math.max(total.maxMs, duration);
      if (name === 'createProgram' && result) programs.set(result, { id: ++programSequence, createdAt: start, firstDraw: null });
      if (name === 'useProgram') context.program = args[0];
      if (category === 'draw' && context.program) {
        const program = programs.get(context.program);
        if (program && program.firstDraw === null) {
          program.firstDraw = start; frameTotals.firstProgramDraws++;
          milestone('new-program-first-draw', { program: program.id, createdAt: program.createdAt, start, end: now(), frame: activeFrame?.id ?? null, state: dom() });
        }
      }
      if (duration >= slowCallMs || threw) record('gl-slow', {
        method: name, category, context: context.id, frame: activeFrame?.id ?? null,
        start, duration, threw, stack: new Error().stack?.slice(0, 5000),
      });
    }
  };
  const methods = [
    'createProgram', 'compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'useProgram',
    'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced',
    'bufferData', 'bufferSubData', 'texImage2D', 'texImage3D', 'texSubImage2D', 'texSubImage3D',
    'compressedTexImage2D', 'compressedTexImage3D', 'texStorage2D', 'texStorage3D',
    'deleteBuffer', 'deleteTexture', 'deleteShader', 'deleteProgram', 'deleteFramebuffer', 'deleteRenderbuffer', 'deleteVertexArray',
    'readPixels', 'getBufferSubData', 'finish', 'flush', 'clientWaitSync', 'getSyncParameter',
  ];
  const contextInfo = (gl) => {
    if (!contexts.has(gl)) contexts.set(gl, { id: ++contextSequence, program: null });
    return contexts.get(gl);
  };
  for (const constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!constructor) continue;
    const prototype = constructor.prototype;
    for (const name of methods) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (typeof descriptor?.value !== 'function') continue;
      const original = descriptor.value;
      Object.defineProperty(prototype, name, { ...descriptor, value: function (...args) {
        return measured(contextInfo(this), name, original, this, args);
      } });
    }
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'getExtension');
    if (typeof descriptor?.value !== 'function') continue;
    const original = descriptor.value;
    Object.defineProperty(prototype, 'getExtension', { ...descriptor, value: function (...args) {
      const extension = Reflect.apply(original, this, args);
      if (String(args[0]).toLowerCase() === 'webgl_lose_context' && extension && !wrappedExtensions.has(extension)) {
        const lose = extension.loseContext, info = contextInfo(this);
        extension.loseContext = function (...values) { return measured(info, 'loseContext', lose, this, values); };
        wrappedExtensions.add(extension);
      }
      return extension;
    } });
  }
  window.__r35TeardownProbe = {
    contextId(context) { return contextInfo(context).id; },
    releaseStatus(contextId) { return aggregate[`${contextId}:loseContext`] ?? null; },
    arm() {
      events = []; aggregate = {}; ringCursor = dropped = sequence = frameSequence = 0;
      phaseKeys = new Set(); previousDOM = ''; armedAt = now(); armed = true;
      for (const key of Object.keys(frameTotals)) frameTotals[key] = 0;
      milestone('armed', { timeOrigin: performance.timeOrigin }); observeDOM();
    },
    snapshot() {
      observeDOM();
      return {
        timeOrigin: performance.timeOrigin, capturedAt: now(), state: dom(),
        dropped, maxEvents, slowCallMs, activeFrame, totals: { ...frameTotals },
        calls: Object.values(aggregate),
        events: dropped ? [...events.slice(ringCursor), ...events.slice(0, ringCursor)] : [...events],
      };
    },
  };
}

export function summarizeCabinTeardown(snapshot) {
  if (!snapshot) return null;
  const events = snapshot.events;
  const active = events.find(event => event.kind === 'dom' && event.state.cabin === 'active');
  const click = events.find(event => event.kind === 'click-capture' && /^NISMO /.test(event.label));
  const history = events.find(event => event.kind === 'history-pushState-end' && /\/nismo$/.test(event.pathname));
  const removed = events.find(event => event.kind === 'dom' && event.state.canvases === 0 && event.time >= (click?.time ?? Infinity));
  const photo = events.find(event => event.kind === 'dom' && event.state.photo && /\/nismo$/.test(event.state.pathname));
  const frames = events.filter(event => event.kind === 'raf-end');
  const activeDraws = frames.filter(event => event.state.cabin === 'active' && event.draws > 0);
  return {
    cabinActiveDOMAt: active?.time, nismoClickAt: click?.time, historyNismoAt: history?.time,
    canvasRemovedAt: removed?.time, nismoPhotoDOMAt: photo?.time,
    clickToCanvasRemovalMs: removed && click ? removed.time - click.time : null,
    completedActiveDrawFrameBeforeClick: click ? activeDraws.some(frame => frame.end < click.time) : null,
    firstCompletedActiveDrawFrame: activeDraws[0] ?? null,
    // A new program first drawn after opt-in supports first-render attribution;
    // this instrumentation does not pretend to identify individual cabin meshes.
    firstNewProgramDraws: events.filter(event => event.kind === 'new-program-first-draw').slice(0, 30),
    longestFrames: [...frames].sort((a, b) => b.duration - a.duration).slice(0, 12),
    longestNativeCalls: events.filter(event => event.kind === 'gl-slow').sort((a, b) => b.duration - a.duration).slice(0, 20),
    longestTasks: events.filter(event => event.kind === 'longtask').sort((a, b) => b.duration - a.duration).slice(0, 12),
    topNativeTotals: [...snapshot.calls].sort((a, b) => b.totalMs - a.totalMs).slice(0, 20),
    droppedEvents: snapshot.dropped, unfinishedFrame: snapshot.activeFrame,
  };
}

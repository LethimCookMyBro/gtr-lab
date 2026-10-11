/** External init script. Observe native buffer writes; never request GL reads or frames. */
export function installDprMotionObserver({ maxRecords = 8192 } = {}) {
  if (globalThis.__r35DprMotion) return;
  const contexts = [], events = [], dimensions = [], phases = [], issues = [], covered = [];
  const ids = new WeakMap(), canvasIds = new WeakMap();
  let phase = 'setup', sequence = 0, timestamp = null;
  const issue = message => { if (!issues.includes(message) && issues.length < 32) issues.push(message); };
  const safe = action => { try { return action(); } catch (error) { issue(`Observer failure: ${String(error)}`); } };
  const push = (target, record) => { if (target.length < maxRecords) target.push(record); else issue('Motion observer capacity exceeded'); };
  const isScene = canvas => canvas instanceof HTMLCanvasElement && canvas.matches('.scene-stage canvas');
  const measure = context => {
    const gl = context.gl.deref(), canvas = context.canvas.deref();
    if (!gl || !canvas) return null;
    const css = canvas.getBoundingClientRect();
    return { contextId: context.id, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
      attributeWidth: canvas.width, attributeHeight: canvas.height, cssWidth: css.width, cssHeight: css.height,
      nativeDpr: devicePixelRatio, viewportWidth: innerWidth, viewportHeight: innerHeight };
  };
  const sample = context => {
    if (!isScene(context.canvas.deref())) return null;
    context.everScene = true;
    const d = measure(context); if (!d) return null;
    const record = { phase, timestamp, time: performance.now(), sequence: ++sequence, ...d };
    const previous = dimensions.at(-1);
    if (timestamp !== null && previous?.timestamp === timestamp && previous.contextId === context.id && previous.phase === phase) dimensions[dimensions.length - 1] = record;
    else push(dimensions, record);
    return d;
  };
  const register = (canvas, gl) => {
    if (!gl || ids.has(gl)) return;
    if (contexts.length >= 16) { issue('Context capacity exceeded'); return; }
    const context = { id: contexts.length + 1, gl: new WeakRef(gl), canvas: new WeakRef(canvas), createdPhase: phase, lostEvents: 0, restoredEvents: 0 };
    contexts.push(context); ids.set(gl, context.id); canvasIds.set(canvas, context.id);
    for (const [eventName, key] of [['webglcontextlost', 'lostEvents'], ['webglcontextrestored', 'restoredEvents']]) canvas.addEventListener(eventName, () => {
      context[key]++; push(events, { kind: eventName, phase, contextId: context.id, time: performance.now(), sequence: ++sequence });
    });
    sample(context);
  };
  const method = (owner, name, observe, transform) => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    if (typeof descriptor?.value !== 'function') return false;
    const original = descriptor.value;
    Object.defineProperty(owner, name, { ...descriptor, value: function (...args) {
      const forwarded = transform ? transform(args) : args;
      const result = Reflect.apply(original, this, forwarded);
      safe(() => observe(this, args, result)); return result;
    } }); covered.push(name); return true;
  };
  method(HTMLCanvasElement.prototype, 'getContext', (canvas, args, result) => { if (['webgl', 'experimental-webgl', 'webgl2'].includes(args[0])) register(canvas, result); });
  const recordWrite = (canvas, property, before, via) => {
    if (!isScene(canvas)) return;
    const id = canvasIds.get(canvas), context = id ? contexts[id - 1] : null;
    push(events, { kind: 'canvas-write', phase, property, before, after: canvas[property], via, contextId: id ?? null,
      dimensions: context ? measure(context) : null, sequence: ++sequence, time: performance.now(), timestamp });
    if (context) sample(context);
  };
  for (const property of ['width', 'height']) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property);
    if (!descriptor?.set || !descriptor?.get) { issue(`Canvas ${property} descriptor unavailable`); continue; }
    Object.defineProperty(HTMLCanvasElement.prototype, property, { ...descriptor, set(value) {
      const before = Reflect.apply(descriptor.get, this, []);
      Reflect.apply(descriptor.set, this, [value]);
      safe(() => recordWrite(this, property, before, 'property'));
    } }); covered.push(property);
  }
  for (const name of ['setAttribute', 'removeAttribute']) {
    const original = Element.prototype[name];
    if (!original) { issue(`Element ${name} unavailable`); continue; }
    Element.prototype[name] = function (...args) {
      const property = typeof args[0] === 'string' ? args[0].toLowerCase() : '';
      const tracked = isScene(this) && ['width', 'height'].includes(property);
      const before = tracked ? this[property] : null;
      const result = Reflect.apply(original, this, args);
      if (tracked) safe(() => recordWrite(this, property, before, name)); return result;
    }; covered.push(name);
  }
  method(globalThis, 'requestAnimationFrame', () => {}, args => {
    if (typeof args[0] !== 'function') return args;
    const callback = args[0];
    return [function (...values) {
      const previous = timestamp; timestamp = values[0];
      try { return Reflect.apply(callback, this, values); }
      finally { safe(() => contexts.forEach(sample)); timestamp = previous; }
    }, ...args.slice(1)];
  });
  for (const name of ['getContext', 'width', 'height', 'requestAnimationFrame']) if (!covered.includes(name)) issue(`Required observer hook absent: ${name}`);
  Object.defineProperty(globalThis, '__r35DprMotion', { value: Object.freeze({
    mark(name, stable = false) {
      phase = String(name); const scene = contexts.filter(c => isScene(c.canvas.deref()) && c.canvas.deref()?.isConnected);
      if (stable && scene.length !== 1) issue('Stable phase needs one connected scene context');
      const context = scene[0]; const d = context ? sample(context) : null;
      const record = { name: phase, stable, contextId: context?.id ?? null, dimensions: d, time: performance.now(), sequence: ++sequence };
      push(phases, record); return record;
    },
    snapshot() { return {
      version: 1, phase, issues: [...issues], covered: [...covered], phases: phases.map(p => ({ ...p })),
      events: events.map(e => ({ ...e })), dimensions: dimensions.map(d => ({ ...d })),
      contexts: contexts.map(c => ({ id: c.id, createdPhase: c.createdPhase, sceneCanvas: Boolean(c.everScene) || isScene(c.canvas.deref()), connected: c.canvas.deref()?.isConnected ?? false, lostEvents: c.lostEvents, restoredEvents: c.restoredEvents })),
    }; },
  }), configurable: false, writable: false });
}

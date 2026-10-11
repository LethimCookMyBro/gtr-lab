/** Bounded passive bookkeeping. This never renders, queries completion, or changes GL state. */
export function installPreparationObserver({ modelPath, modelJson, maxEvents = 16384 } = {}) {
  if (globalThis.__r35Preparation) throw new Error('One preparation observer per document');
  const prior = globalThis.__gtrFunctionalCaptureObserver;
  if (typeof prior !== 'function') throw new Error('Native functional observer must already be installed');
  const events = [], dom = [], clicks = [], issues = [], resources = [], contexts = [];
  const ids = new WeakMap(), contextIds = new WeakMap();
  const totals = Object.fromEntries(['fetches', 'gltfParses', 'bitmapRequests', 'compileShader', 'linkProgram', 'bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D', 'compressedTexSubImage2D'].map(key => [key, 0]));
  let owner = null, phase = 'setup', signature = '', sequence = 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  const issue = message => { if (issues.length < 32 && !issues.includes(message)) issues.push(message); };
  const append = (list, value) => { if (list.length >= maxEvents) issue('Preparation observation capacity exceeded'); else list.push({ sequence: ++sequence, phase, at: performance.now(), ...value }); };
  const box = element => { const r = element?.getBoundingClientRect(); return r && { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const read = () => { try { return owner?.read() ?? null; } catch { return null; } };
  const ui = () => {
    const masks = [...document.querySelectorAll('.scene-loading')].filter(e => getComputedStyle(e).display !== 'none');
    const canvas = document.querySelector('.scene-stage canvas'), stage = box(canvas), mask = masks[0], rect = box(mask), css = mask && getComputedStyle(mask);
    let ancestorOpaque = true;
    for (let element = mask; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (Number(style.opacity) !== 1 || style.visibility !== 'visible' || style.display === 'none') ancestorOpaque = false;
    }
    const backgroundOpaque = css && (/^rgb\(/.test(css.backgroundColor) || /^rgba\([^,]+,[^,]+,[^,]+,\s*1\)$/.test(css.backgroundColor));
    const state = read(), root = document.querySelector('main[data-cabin-preparation]');
    const number = key => { const value = root?.getAttribute(key); return value === null || value === undefined || value === '' ? null : Number(value); };
    const preparation = root ? { phase: root.getAttribute('data-cabin-preparation'), request: number('data-cabin-request'), modelUrl: root.getAttribute('data-cabin-model-url'), progressPhase: root.getAttribute('data-cabin-progress'), startedAt: number('data-cabin-started-at'), readyAt: number('data-cabin-ready-at'), entryRequestedAt: number('data-cabin-entry-requested-at') } : null;
    return { pathname: location.pathname, maskCount: masks.length,
      maskOpaque: Boolean(mask && stage && rect && ancestorOpaque && backgroundOpaque && rect.x <= stage.x + .5 && rect.y <= stage.y + .5 && rect.right >= stage.right - .5 && rect.bottom >= stage.bottom - .5),
      maskText: mask?.textContent.trim() ?? null, ready: preparation?.phase === 'ready', preparation: preparation ?? null,
      legacyLoading: [...document.querySelectorAll('.cabin-load-status, .cabin-load-indeterminate')].some(element => element.closest('.scene-loading') !== mask || preparation?.phase !== 'loading' || Boolean(element.closest('footer[aria-label=\"Cabin preview controls\"]'))),
      cabinRail: Boolean(document.querySelector('footer[aria-label="Cabin preview controls"]')),
      seat: document.querySelector('.cabin-seat-choices [aria-pressed="true"]')?.textContent.trim() ?? null,
      dimensions: state?.dimensions ?? null };
  };
  const observeDOM = () => { const value = ui(), next = JSON.stringify(value); if (signature !== next) { signature = next; append(dom, value); } };
  const mutations = new MutationObserver(observeDOM);
  mutations.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'disabled', 'aria-pressed', 'data-cabin-preparation', 'data-cabin-request', 'data-cabin-model-url', 'data-cabin-progress', 'data-cabin-started-at', 'data-cabin-ready-at', 'data-cabin-entry-requested-at'] });
  globalThis.__gtrFunctionalCaptureObserver = event => {
    if (event.kind === 'attach') { owner = event; const id = context(event.context); contexts[id - 1].owner = event.owner; }
    const value = event.kind === 'attach' ? { kind: event.kind, owner: event.owner } : clone(event);
    append(events, { ...value, ui: ui() });
    prior(event);
    if (event.kind === 'stop' && event.owner === owner?.owner) owner = null;
    observeDOM();
  };
  document.addEventListener('click', event => {
    const control = event.target?.closest?.('button,a'); if (!control) return;
    const value = { label: (control.getAttribute('aria-label') || control.textContent || '').trim(), trusted: event.isTrusted,
      owner: owner?.owner ?? null, mainBefore: globalThis.__gtrFunctionalCapture.snapshot()?.lastMain?.id ?? null, ui: ui() };
    append(clicks, value);
    queueMicrotask(() => append(events, { kind: 'click-handler-return', label: value.label, trusted: value.trusted, ui: ui() }));
  }, true);
  const context = gl => {
    if (contextIds.has(gl)) return contextIds.get(gl);
    const id = contexts.length + 1; contextIds.set(gl, id);
    contexts.push({ id, canvas: new WeakRef(gl.canvas), owner: null, lost: 0, restored: 0 });
    gl.canvas.addEventListener('webglcontextlost', () => { contexts[id - 1].lost++; });
    gl.canvas.addEventListener('webglcontextrestored', () => { contexts[id - 1].restored++; });
    return id;
  };
  const patch = (object, name, after) => {
    const descriptor = Object.getOwnPropertyDescriptor(object, name);
    if (!descriptor || typeof descriptor.value !== 'function') return false;
    const original = descriptor.value;
    Object.defineProperty(object, name, { ...descriptor, value: function (...args) {
      const result = Reflect.apply(original, this, args);
      try { after(this, args, result); } catch (error) { issue(String(error)); }
      return result;
    } }); return true;
  };
  const coverage = new Set();
  for (const type of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) {
    if (!type) continue;
    for (const name of Object.keys(totals).filter(name => !['fetches', 'gltfParses', 'bitmapRequests'].includes(name)))
      if (patch(type.prototype, name, () => { totals[name]++; })) coverage.add(name);
    for (const [create, remove, kind] of [['createBuffer', 'deleteBuffer', 'buffer'], ['createProgram', 'deleteProgram', 'program'], ['createShader', 'deleteShader', 'shader']]) {
      if (patch(type.prototype, create, (gl, _args, resource) => {
        if (!resource) return; if (resources.length >= 8192) return issue('Preparation resource capacity exceeded');
        const row = { id: resources.length + 1, contextId: context(gl), kind, createdPhase: phase, deleted: 0, deletedLive: false };
        ids.set(resource, row); resources.push(row);
      })) coverage.add(create);
      if (patch(type.prototype, remove, (gl, [resource]) => { const row = resource && ids.get(resource); if (row) {
        if (row.contextId !== context(gl)) { issue(`Cross-context ${kind} deletion`); return; }
        row.deleted++; row.deletedLive ||= !gl.isContextLost();
      } })) coverage.add(remove);
    }
  }
  for (const name of [...Object.keys(totals).filter(name => !['fetches', 'gltfParses', 'bitmapRequests'].includes(name)), 'createBuffer', 'deleteBuffer', 'createProgram', 'deleteProgram', 'createShader', 'deleteShader']) if (!coverage.has(name)) issue(`Missing native method ${name}`);
  if (!patch(globalThis, 'fetch', (_self, [input]) => { if (new URL(typeof input === 'string' ? input : input.url ?? String(input), location.href).pathname === modelPath) {
    totals.fetches++; append(events, { kind: 'cabin-fetch-start', snapshot: clone(read()), ui: ui() });
  } })) issue('fetch observation unavailable');
  if (typeof modelJson !== 'string' || !modelJson.length) throw new Error('Exact accepted GLB JSON bytes required');
  if (!patch(JSON, 'parse', (_self, [text]) => { if (text === modelJson) totals.gltfParses++; })) issue('GLB JSON parse observation unavailable');
  if (!patch(globalThis, 'createImageBitmap', () => { totals.bitmapRequests++; })) issue('Bitmap observation unavailable');
  globalThis.__r35Preparation = Object.freeze({
    mark(label) { phase = String(label); observeDOM(); return { sequence, at: performance.now(), totals: clone(totals) }; },
    status() { return clone({ current: read(), ui: ui(), totals }); },
    snapshot() { observeDOM(); return clone({ version: 1, events, dom, clicks, issues, coverage: [...coverage], totals, resources,
      contexts: contexts.map(({ canvas, ...value }) => ({ ...value, connected: canvas.deref()?.isConnected ?? false, scene: canvas.deref()?.matches('.scene-stage canvas') ?? false })),
      measures: performance.getEntriesByType('measure').filter(e => e.name.startsWith('gtr-cabin-')).map(e => ({ name: e.name, startTime: e.startTime, duration: e.duration })), current: read(), ui: ui() }); },
  });
}

/** Deterministic lifecycle fixture only: real decode runs, its result delivery is paused. */
export function installPreparationDecodeFixture({ images }) {
  const original = globalThis.createImageBitmap;
  const descriptor = Object.getOwnPropertyDescriptor(ImageBitmap.prototype, 'close'), identities = new WeakMap();
  if (!descriptor || typeof descriptor.value !== 'function') throw new Error('Native bitmap close method required');
  Object.defineProperty(ImageBitmap.prototype, 'close', { ...descriptor, value: function (...args) {
    const result = Reflect.apply(descriptor.value, this, args), record = identities.get(this);
    if (record) { record.closeCalls++; record.closedAt = performance.now(); }
    return result;
  } });
  let armed = false, pending = [], records = [];
  globalThis.createImageBitmap = function (...args) {
    const native = Reflect.apply(original, this, args), source = args[0];
    const match = source instanceof Blob && images.some(i => i.bytes === source.size && i.mimeType === source.type);
    if (!armed || !match) return native;
    armed = false;
    const record = { bitmapIdentity: records.length + 1, requestedAt: performance.now(), sourceBytes: source.size, sourceSha256: null, nativeCompletedAt: null, releasedAt: null, closeCalls: 0, closedAt: null };
    records.push(record);
    return native.then(async bitmap => {
      record.nativeCompletedAt = performance.now(); identities.set(bitmap, record); record.width = bitmap.width; record.height = bitmap.height;
      const digest = await crypto.subtle.digest('SHA-256', await source.arrayBuffer());
      record.sourceSha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (!images.some(image => image.sha256 === record.sourceSha256 && image.bytes === record.sourceBytes)) throw new Error('Held bitmap is not an exact accepted model image');
      return new Promise(resolve => { pending.push(() => { record.releasedAt = performance.now(); resolve(bitmap); }); });
    });
  };
  globalThis.__r35PreparationDecode = Object.freeze({ arm() { if (armed || pending.length) throw new Error('Decode fixture is already armed'); armed = true; }, release() { const jobs = pending; pending = []; jobs.forEach(run => run()); }, snapshot() { return JSON.parse(JSON.stringify({ armed, pending: pending.length, records })); } });
}

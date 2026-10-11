/** Same read-only production-state seam in both lanes; no frame request or GL call here. */
export function installRasterStateObserver() {
  if (globalThis.__gtrFunctionalCaptureObserver || globalThis.__r35RasterState) throw new Error('State observer already installed');
  let owner = null, reads = 0, mainDraws = 0, latestMain = null; const issues = [], nativeFences = new Map();
  const fail = text => { if (!issues.includes(text)) issues.push(text); };
  const same = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
  };
  Object.defineProperty(globalThis, '__gtrFunctionalCaptureObserver', { value(event) {
    if (event.kind === 'attach') {
      if (owner) fail('Production state owner replaced');
      owner = { id: event.owner, read: event.read, pending: event.pending, canvas: event.canvas, stopped: false };
    } else if (!owner || event.owner !== owner.id || owner.stopped) fail('Unknown or stopped production state owner');
    else if (event.kind === 'main') { latestMain = { snapshot: event.snapshot, id: event.id, stable: event.stable, at: performance.now() }; if (++mainDraws > 2048) fail('State main-draw bound exceeded'); }
    else if (event.kind === 'fence') {
      if (nativeFences.size >= 4096 || nativeFences.has(event.id)) { fail('Production fence bound or identity invalid'); return; }
      nativeFences.set(event.id, { id: event.id, draws: [...event.draws], previous: event.previous, createdAt: performance.now(), waits: 0, positive: null, retirement: null });
    } else if (event.kind === 'wait') {
      const f = nativeFences.get(event.id);
      if (!f || f.retirement) { fail('Unowned production wait'); return; }
      if (++f.waits > 20000) fail('Production wait bound exceeded');
      if (event.status === 0x911a || event.status === 0x911c) f.positive ??= { status: event.status, at: performance.now() };
      else if (event.status !== 0x911b) fail('Production wait failed');
    } else if (event.kind === 'retire') {
      const f = nativeFences.get(event.id);
      if (!f || f.retirement || !['signaled', 'superseded'].includes(event.reason) || (event.reason === 'signaled' && !f.positive)) { fail('Unproven production retirement'); return; }
      f.retirement = { reason: event.reason, at: performance.now() };
    }
    else if (event.kind === 'invalid' || event.kind === 'buffer-replaced') fail(`Producer ${event.kind}`);
    else if (event.kind === 'stop') owner.stopped = true;
  }, writable: false, configurable: false });
  Object.defineProperty(globalThis, '__r35RasterState', { value: Object.freeze({
    ready() { return Boolean(owner && !owner.stopped && !issues.length && !owner.pending() && [...nativeFences.values()].every(f => f.retirement)); },
    read() {
      if (++reads > 4 || !owner || owner.stopped || owner.canvas !== document.querySelector('.scene-stage canvas') || issues.length) throw new Error('State read is invalid or outside its four clean checkpoints');
      const snapshot = JSON.parse(JSON.stringify(owner.read()));
      if (!latestMain || !same(snapshot, latestMain.snapshot)) throw new Error('Live state differs from the last actual main draw');
      const pending = owner.pending();
      if (latestMain.stable !== true || snapshot.camera?.settled !== true || pending !== false || [...nativeFences.values()].some(f => !f.retirement)) throw new Error('Stable settled main and no pending app frame or production fence required');
      return { snapshot, main: { id: latestMain.id, at: latestMain.at, stable: latestMain.stable }, pending };
    },
    snapshot() { return { owner: owner?.id ?? null, reads, mainDraws, nativeFences: [...nativeFences.values()].map(f => ({ ...f, draws: [...f.draws] })), issues: [...issues] }; },
  }), writable: false, configurable: false });
}

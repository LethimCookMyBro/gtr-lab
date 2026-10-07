import { expect, it } from 'vitest';
import vm from 'node:vm';
import { installCabinTeardownProbe, summarizeCabinTeardown } from '../scripts/cabin-teardown-probe.mjs';
import { validateDiagnosticEnvironment, within } from '../scripts/diagnose-cabin-teardown.mjs';

function harness(options = {}) {
  let clock = 0, active = false, title = 'GT-R R35', canvases = 1;
  const marks = [], listeners = new Map(), frames = [], observers = [], microtasks = [];
  const location = { pathname: '/configurator/premium' };
  const seat = { textContent: 'Driver' };
  const controls = { querySelector: () => active ? seat : null };
  const document = {
    querySelector(selector) {
      if (selector === '.config-title h1') return { textContent: title };
      if (selector.startsWith('footer')) return active ? controls : null;
      if (selector === '.reference-view img') return canvases ? null : {};
      return null;
    },
    querySelectorAll: () => Array.from({ length: canvases }, () => ({})),
    addEventListener(name, callback, capture) { listeners.set(`${name}:${!!capture}`, callback); },
  };
  const history = {
    pushState(state, unused, path) { if (this !== history) throw new Error('wrong history receiver'); location.pathname = path; return state; },
    replaceState(state, unused, path) { if (this !== history) throw new Error('wrong history receiver'); location.pathname = path; return state; },
  };
  const failure = new Error('native deletion failure');
  const extension = { loseContext() { if (this !== extension) throw new Error('wrong extension receiver'); clock += 2; return 73; } };
  class GL {
    createProgram() { clock += 1; return {}; }
    useProgram(program) { this.program = program; return 17; }
    drawElements(...args) { this.args = args; clock += 12; return this.program; }
    bufferData(...args) { this.bufferArgs = args; clock += 3; return 'uploaded'; }
    deleteProgram(program) { if (program === 'throw') throw failure; clock += 4; return true; }
    getExtension(name) { return name === 'WEBGL_lose_context' ? extension : null; }
  }
  class GL2 extends GL { drawElementsInstanced(...args) { this.instanced = args; clock += 5; return 27; } }
  const window = { WebGLRenderingContext: GL, WebGL2RenderingContext: GL2,
    requestAnimationFrame(callback) { frames.push(callback); return frames.length + 100; },
  };
  class MutationObserver { constructor(callback) { observers.push(callback); } observe() {} }
  class PerformanceObserver { constructor(callback) { this.callback = callback; } observe() {} }
  const globals = { window, document, history, location, MutationObserver, PerformanceObserver,
    performance: { now: () => clock, timeOrigin: 500, mark: value => marks.push(value) },
    queueMicrotask: callback => microtasks.push(callback), Error,
  };
  const install = vm.runInNewContext(`(${installCabinTeardownProbe.toString()})`, globals);
  install(options);
  return { window, history, failure, marks, frames, GL, GL2, install,
    tick: amount => { clock += amount; },
    active() { active = true; observers.forEach(callback => callback()); },
    photo() { canvases = 0; title = 'GT-R NISMO'; observers.forEach(callback => callback()); },
    click(label) { const button = { getAttribute: () => label }; listeners.get('click:true')({ target: { closest: () => button } }); },
    snapshot: () => window.__r35TeardownProbe.snapshot(),
    arm: () => window.__r35TeardownProbe.arm(),
  };
}

it('preserves native WebGL receiver, arguments, return values and thrown errors while measuring', () => {
  const test = harness(); const gl = new test.GL();
  const unarmed = gl.createProgram();
  expect(unarmed).toEqual({}); expect(test.snapshot().events).toHaveLength(0);
  test.arm();
  const program = gl.createProgram();
  expect(gl.useProgram(program)).toBe(17);
  expect(gl.drawElements(4, 120, 5123, 0)).toBe(program);
  expect(gl.args).toEqual([4, 120, 5123, 0]);
  expect(gl.bufferData(1, 'bytes', 2)).toBe('uploaded');
  expect(gl.deleteProgram(program)).toBe(true);
  expect(() => gl.deleteProgram('throw')).toThrow(test.failure);
  const result = test.snapshot();
  expect(result.totals).toEqual({ draws: 1, uploads: 1, deletes: 2, firstProgramDraws: 1 });
  expect(result.calls.find(call => call.method === 'drawElements')).toMatchObject({ count: 1, totalMs: 12, maxMs: 12 });
  expect(result.events.find(event => event.kind === 'gl-slow' && event.method === 'drawElements')).toMatchObject({ duration: 12, category: 'draw' });
  expect(result.events.find(event => event.kind === 'gl-slow' && event.threw)).toMatchObject({ method: 'deleteProgram' });
});

it('records real scheduled callbacks without scheduling frames or changing handles and callback returns', () => {
  const test = harness(); test.arm(); test.active(); const gl = new test.GL();
  const program = gl.createProgram(); gl.useProgram(program);
  const receiver = {}, answer = {};
  const handle = test.window.requestAnimationFrame(function (timestamp) {
    expect(this).toBe(receiver); expect(timestamp).toBe(92); gl.drawElements(4, 6, 1, 0); return answer;
  });
  expect(handle).toBe(101); expect(test.frames).toHaveLength(1);
  expect(test.frames[0].call(receiver, 92)).toBe(answer);
  expect(test.frames).toHaveLength(1);
  const frame = test.snapshot().events.find(event => event.kind === 'raf-end');
  expect(frame).toMatchObject({ draws: 1, duration: 12, firstProgramDraws: 1, state: { cabin: 'active' } });
});

it('does not double-wrap repeated installation, inherited GL methods or context-loss extensions', () => {
  const test = harness(); test.install(); test.arm(); const gl = new test.GL2();
  gl.drawElements(1, 2, 3, 4); expect(gl.drawElementsInstanced(1, 2, 3, 4, 5)).toBe(27);
  const extension = gl.getExtension('WEBGL_lose_context');
  expect(gl.getExtension('WEBGL_lose_context')).toBe(extension);
  expect(extension.loseContext()).toBe(73);
  expect(test.snapshot().totals).toMatchObject({ draws: 2, deletes: 1 });
  expect(test.snapshot().calls.find(call => call.method === 'loseContext').count).toBe(1);
});

it('bounds event storage, keeps chronological order, and preserves total call accounting', () => {
  const test = harness({ maxEvents: 8 }); test.arm(); const gl = new test.GL();
  for (let index = 0; index < 30; index++) gl.drawElements(1, 2, 3, 4);
  const result = test.snapshot();
  expect(result.events).toHaveLength(8); expect(result.dropped).toBeGreaterThan(0);
  expect(result.events.map(event => event.seq)).toEqual([...result.events.map(event => event.seq)].sort((a, b) => a - b));
  expect(result.calls.find(call => call.method === 'drawElements').count).toBe(30);
});

it('distinguishes a completed active draw before click from deferred DOM teardown', () => {
  const test = harness(); test.arm(); test.active(); const gl = new test.GL();
  test.window.requestAnimationFrame(() => gl.drawElements(1, 2, 3, 4)); test.frames[0](0);
  test.tick(1); test.click('NISMO Precision under pressure.');
  expect(test.history.pushState('state', '', '/configurator/nismo')).toBe('state');
  test.tick(1000); test.photo();
  const summary = summarizeCabinTeardown(test.snapshot());
  expect(summary.completedActiveDrawFrameBeforeClick).toBe(true);
  expect(summary.clickToCanvasRemovalMs).toBe(1000);
  expect(summary.longestNativeCalls[0].method).toBe('drawElements');
});

it('rejects local or unreviewed execution before browser and server work', () => {
  expect(() => validateDiagnosticEnvironment({})).toThrow(/CI-only/);
  expect(() => validateDiagnosticEnvironment({ GITHUB_ACTIONS: 'true' })).toThrow(/opt-in/);
  expect(() => validateDiagnosticEnvironment({ GITHUB_ACTIONS: 'true', R35_ALLOW_CABIN_TEARDOWN_DIAGNOSTIC: '1' })).toThrow(/digest/);
  expect(() => validateDiagnosticEnvironment({ GITHUB_ACTIONS: 'true', R35_ALLOW_CABIN_TEARDOWN_DIAGNOSTIC: '1', R35_EXPECTED_APP_TREE: 'a'.repeat(64) })).not.toThrow();
});

it('evidence collection deadlines fail explicitly and do not hide action failure', async () => {
  expect(await within(Promise.resolve('evidence'), 100, 'test')).toBe('evidence');
  await expect(within(new Promise(() => {}), 5, 'test')).rejects.toThrow(/collection budget/);
});

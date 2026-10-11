// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installFunctionalCaptureObserver } from '../scripts/functional-capture-readiness.mjs';
import { waitForEnvironmentReady, waitForExteriorCapture, environmentCaptureReady, readFunctionalCaptureFailure } from '../scripts/vehicle-preview-readiness.mjs';
let state, observer;
const expected = { preset: 'hero', seat: null, lights: false, proxy: false };
const api = () => globalThis.__gtrFunctionalCapture;
const draw = id => {
  observer({ kind: 'main', owner: 1, id, snapshot: JSON.parse(JSON.stringify(state)), stable: true });
  observer({ kind: 'fence', owner: 1, id, draws: [id] });
};
const signal = id => observer({ kind: 'wait', owner: 1, id, status: 0x911c });
const page = {
  waitForFunction: async (predicate, arg, { timeout, polling }) => {
    const deadline = performance.now() + timeout;
    while (performance.now() < deadline) {
      if (predicate(arg)) return true;
      await new Promise(resolve => setTimeout(resolve, polling));
    }
    throw new Error(`Timed out after ${timeout}ms`);
  },
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal('devicePixelRatio', 1);
  document.body.innerHTML = '<main class="configurator environment-coast is-scene-ready"><div class="scene-stage"><canvas></canvas></div><div class="paint-swatches"><button aria-label="Ultimate Silver" aria-pressed="true"><span class="swatch" style="background-color:#a6acb1"></span></button></div><div class="config-toolbar"><button aria-label="Lights" aria-pressed="false">Lights</button></div></main>';
  state = {
    camera: { preset: 'hero', requestId: 0, settled: true, target: [0, 0, 0], destination: [0, 1, 5], targetFov: 34 },
    vehicle: { environment: 'coast', paint: '#a6acb1', exterior: true, full: false, proxy: false, lights: false, cabinSeat: null, lamps: [{ role: 'taillights', intensity: 0, emissive: [1,0,0] }] },
    pose: { position: [0,1,5], quaternion: [0,0,0,1], projection: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1] },
    dimensions: { width:100, height:100, cssWidth:100, cssHeight:100, renderWidth:100, renderHeight:100, pixelRatio:1 }, live:true,
  };
  installFunctionalCaptureObserver(); observer = globalThis.__gtrFunctionalCaptureObserver;
  observer({ kind:'attach', owner:1, canvas:document.querySelector('canvas'), context:{}, read:()=>state, pending:()=>false });
});
afterEach(() => { api()?.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML=''; });
const wait = () => waitForEnvironmentReady(page, 'coast', { timeout:15000, functional:api().begin(expected,15000) });
it('does not accept a full-size, ready DOM before genuine main-draw native completion', async () => {
  draw(1); let done=false; const waiting=wait().then(()=>done=true);
  await vi.advanceTimersByTimeAsync(1000); expect(done).toBe(false);
  signal(1); await vi.advanceTimersByTimeAsync(100); await waiting; expect(done).toBe(true);
});
it.each(['environment','paint'])('does not accept completed but stale requested %s', async key => {
  state.vehicle[key] = key === 'environment' ? 'forest' : '#121619'; draw(1); signal(1);
  let done=false; const waiting=wait().then(()=>done=true);
  await vi.advanceTimersByTimeAsync(1000); expect(done).toBe(false);
  state.vehicle[key] = key === 'environment' ? 'coast' : '#a6acb1'; draw(2); signal(2);
  await vi.advanceTimersByTimeAsync(100); await waiting; expect(done).toBe(true);
});
it('keeps an old full-size native result pending until the post-action draw completes', async () => {
  draw(1); signal(1); api().arm(); let done=false; const waiting=wait().then(()=>done=true);
  await vi.advanceTimersByTimeAsync(1000); expect(done).toBe(false);
  draw(2); signal(2); await vi.advanceTimersByTimeAsync(100); await waiting; expect(done).toBe(true);
});
it('never accepts late native completion after the original 15-second deadline', async () => {
  draw(1); let outcome; const waiting=wait().then(()=>outcome='passed',error=>outcome=error);
  await vi.advanceTimersByTimeAsync(14999); expect(outcome).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1); signal(1); await waiting;
  expect(outcome).toBeInstanceOf(Error); expect(outcome.message).toMatch(/15000|deadline/);
});

it('the driver composes dimensions, selected state and native completion in one unchanged 15s budget', async () => {
  draw(1); signal(1);
  const options = [];
  await waitForExteriorCapture({
    evaluate: async (fn,arg) => fn(arg),
    waitForFunction: async (fn,arg,opts) => { options.push(opts); expect(fn(arg)).toBe(true); },
  }, { preset:'hero', environment:'coast', timeout:15000 });
  expect(options).toEqual([{ timeout:15000, polling:16 }]);
  expect(api().verify()).toMatchObject({ mainDrawId:1, nativeStatus:0x911c, deadline:15000, captureStartedAt:0 });
});
it('a native result delivered after a main-thread stall cannot pass the original deadline', async () => {
  const functional = api().begin(expected,15000); draw(1); signal(1);
  await vi.advanceTimersByTimeAsync(15001);
  expect(() => environmentCaptureReady({environment:'coast',functional})).toThrow(/deadline/);
});

it('a late drawing-buffer regression keeps the combined driver gate pending until a new full-size completed draw', async () => {
  draw(1); signal(1); api().arm({ allowUnchanged:true });
  state.dimensions.height = 60; draw(2); signal(2);
  let done=false; const waiting=wait().then(()=>done=true);
  await vi.advanceTimersByTimeAsync(1000); expect(done).toBe(false);
  state.dimensions.height = 100; draw(3);
  await vi.advanceTimersByTimeAsync(100); expect(done).toBe(false);
  signal(3); await vi.advanceTimersByTimeAsync(100); await waiting;
  expect(done).toBe(true);
  expect(api().snapshot().certificate).toMatchObject({mainDrawId:3, fenceId:3});
});
it('physical capture does not spend the 90s model allowance on an enabled scene with a pending notice', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile('scripts/capture-environments.mjs', 'utf8');
  const body = source.slice(source.indexOf('  async function settled() {'), source.indexOf('  async function graphicsHealth()'));
  document.querySelector('main').insertAdjacentHTML('beforeend', '<div role="status" aria-live="polite" class="scene-notice"><p>Rendering is taking longer than usual. You can keep waiting or retry the viewer.</p><button>Retry viewer</button></div>');
  draw(1); signal(1);
  const run = new Function('expect', 'canvas', 'page', 'waitForEnvironmentReady', 'waitForExteriorCapture', 'expectedEnvironment', 'expectedPreset', 'captureArmed', 'armCapture', `${body}; return settled();`);
  const matcher = value => ({ toHaveCount: async () => {}, toBeEnabled: async options => { expect(options).toEqual({timeout:90000}); expect(value.disabled).toBe(false); } });
  const browserPage = { ...page, evaluate:async(fn,arg)=>fn(arg), getByRole:()=>document.querySelector('[aria-label="Ultimate Silver"]') };
  let outcome;
  const waiting = run(matcher, document.querySelector('canvas'), browserPage, waitForEnvironmentReady, waitForExteriorCapture, 'coast', 'hero', true, ()=>api().arm()).then(()=>outcome='passed',error=>outcome=error);
  await vi.advanceTimersByTimeAsync(14999); expect(outcome).toBeUndefined();
  await vi.advanceTimersByTimeAsync(17);
  expect(outcome).toBeInstanceOf(Error);
  expect(outcome.message).toMatch(/15000|deadline/);
  await waiting;
});

it('failure evidence captures the stalled request without changing it or retrying', async () => {
  draw(1); const before=api().snapshot();
  expect(await readFunctionalCaptureFailure({evaluate:async fn=>fn()})).toEqual(before);
  expect(api().snapshot()).toEqual(before);
  const evaluate=vi.fn(async()=>{throw new Error('Page crashed');});
  expect(await readFunctionalCaptureFailure({evaluate})).toBeNull();
  expect(evaluate).toHaveBeenCalledOnce();
});

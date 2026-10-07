// @vitest-environment jsdom
/** Node-only diagnostic. Real installed R3F, AdaptiveDpr, OrbitControls and CameraRig.
 * Only the WebGL device and browser RAF scheduling are substituted.
 * No server, socket, browser or screenshot is created.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import { act, advance, createRoot, extend, _roots } from "@react-three/fiber";
import { AdaptiveDpr } from "@react-three/drei/core/AdaptiveDpr";
import { CameraRig } from "../src/components/three/CameraRig";
// @ts-expect-error The Node capture helper is serialized into the page by Playwright.
import { waitForFullResolutionFrames } from "../scripts/environment-capture-readiness.mjs";
import type { WebGLRenderer } from "three";
const THREE = createRequire(import.meta.url)("three");
extend({ PerspectiveCamera: THREE.PerspectiveCamera });
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
async function fixture() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("devicePixelRatio", 1);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const stage = document.createElement("div");
  stage.className = "scene-stage";
  const canvas = document.createElement("canvas");
  stage.append(canvas);
  document.body.append(stage);
  Object.defineProperty(canvas, "clientWidth", { value: 390 });
  Object.defineProperty(canvas, "clientHeight", { value: 392 });
  let dpr = 1;
  const renders: number[] = [];
  const renderer = {
    isWebGLRenderer: true,
    domElement: canvas,
    coordinateSystem: THREE.WebGLCoordinateSystem,
    shadowMap: { enabled: false },
    xr: {
      enabled: false,
      isPresenting: false,
      addEventListener() {},
      removeEventListener() {},
    },
    setPixelRatio(value: number) {
      dpr = value;
    },
    getPixelRatio: () => dpr,
    setSize(w: number, h: number) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    },
    render() {
      renders.push(dpr);
    },
    renderLists: { dispose() {} },
    forceContextLoss() {},
  };
  const root = createRoot(canvas);
  roots.push(root);
  await root.configure({
    gl: renderer as unknown as WebGLRenderer,
    frameloop: "never",
    dpr: 1,
    performance: { min: 0.6 },
    size: { width: 390, height: 392, top: 0, left: 0 },
    camera: { position: [4.275, 1.8675, 5.1], fov: 34, near: 0.02, far: 700 },
  });
  await act(async () =>
    root.render(
      <>
        <AdaptiveDpr />
        <CameraRig
          preset="hero"
          autoRotate={false}
          reducedMotion
          onManual={() => {}}
        />
      </>,
    ),
  );
  const store = _roots.get(canvas)!.store;
  let timestamp = 0;
  const frame = () =>
    act(async () => advance((timestamp += 1 / 60), false, store.getState()));
  const recover = () => act(async () => vi.advanceTimersByTimeAsync(200));
  await frame();
  await frame();
  await recover();
  await frame();
  return { canvas, store, frame, recover, renders };
}

it("settled does not release the late AdaptiveDpr regression triggered by Home", async () => {
  const f = await fixture();
  const key = (key: string) =>
    act(async () =>
      f.canvas.dispatchEvent(
        new KeyboardEvent("keydown", { key, cancelable: true }),
      ),
    );
  // A previous completed zoom capture is at full DPR. Home queues reset work;
  // its first renderer frame, rather than the key event itself, fires change.
  for (let n = 0; n < 12; n++) await key("-");
  await f.recover();
  await f.frame();
  await f.recover();
  expect(f.canvas.width).toBe(390);
  await key("Home");
  expect(f.canvas.width).toBe(390);
  const observations: unknown[] = [];
  let scheduled = Promise.resolve();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    scheduled = scheduled.then(async () => {
      await act(async () => vi.advanceTimersByTimeAsync(16));
      await f.frame();
      observations.push({
        phase: "raf",
        width: f.canvas.width,
        current: f.store.getState().performance.current,
      });
      callback(0);
    });
    return 1;
  });
  const source = await readFile("scripts/capture-environments.mjs", "utf8");
  const body = source.slice(
    source.indexOf("  async function settled() {"),
    source.indexOf("  async function graphicsHealth()"),
  );
  const assertion = () => ({
    toHaveCount: async () => {},
    toBeEnabled: async () => {},
  });
  const page = {
    getByRole: () => ({}),
    locator: () => ({}),
    waitForFunction: async (
      fn: (options?: unknown) => unknown,
      argument: unknown,
      opts: { timeout: number },
    ) => {
      expect(opts.timeout).toBe(15000);
      if (fn === waitForFullResolutionFrames) {
        expect(argument).toEqual({ timeoutMs: 15000 });
        const result = await fn(argument);
        return { jsonValue: async () => result, dispose: async () => {} };
      }
      for (let n = 0; n < 15_000 / 16; n++) {
        const full = fn();
        observations.push({ phase: "dpr-check", width: f.canvas.width, full });
        if (full) return;
        await act(async () => vi.advanceTimersByTimeAsync(16));
        await f.frame();
      }
      throw new Error("Readiness exceeded its existing budget");
    },
    evaluate: async (fn: (options: unknown) => unknown, options: unknown) =>
      fn(options),
  };
  const run = new Function(
    "expect",
    "canvas",
    "page",
    "waitForFullResolutionFrames",
    `${body};return settled();`,
  );
  const result = await run(
    assertion,
    f.canvas,
    page,
    waitForFullResolutionFrames,
  );
  expect(result).toMatchObject({ drawingBuffer: [390, 392], fullFrames: 3 });
  expect(result.regressedFrames).toBeGreaterThan(0);
  console.log("REAL_DPR_TRACE", JSON.stringify(observations));
  // The same real Home regression is now withheld until recovery is stable.
  expect(
    f.canvas.width,
    "settled() released a 60% DPR canvas after accepting full DPR",
  ).toBe(390);
});

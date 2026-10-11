// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { act, createRoot, useFrame, _roots } from "@react-three/fiber";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WebGLRenderer } from "three";
import { DemandRenderBackpressure } from "../src/components/three/DemandRenderBackpressure";
import { vehiclePixelRatio } from "../src/components/three/VehiclePixelDensity";
const require = createRequire(import.meta.url);
const THREE: typeof import("three") = require("three");
// Execute the installed Three sizing methods without creating a WebGL device.
// Preserve closure state, nested setPixelRatio -> setSize and native writes.
const rendererSource = readFileSync(
  join(dirname(require.resolve("three")), "../src/renderers/WebGLRenderer.js"),
  "utf8",
);
const sizingMethods = rendererSource.slice(
  rendererSource.indexOf("this.getPixelRatio = function"),
  rendererSource.indexOf("this.getCurrentViewport = function"),
);
const installSizingMethods = new Function(
  "canvas",
  "xr",
  "let _width = canvas.width, _height = canvas.height, _pixelRatio = 1;\n" +
    sizingMethods,
);
let rafs: Map<number, FrameRequestCallback>;
let nextRaf: number;
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  rafs = new Map();
  nextRaf = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    rafs.set(++nextRaf, callback);
    return nextRaf;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => rafs.delete(id));
});
async function frame() {
  await act(async () => {
    const callbacks = [...rafs.values()];
    rafs.clear();
    callbacks.forEach((callback) => callback(performance.now()));
  });
}
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  await frame();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function fixture(
  width: number,
  height: number,
  nativeDpr: number,
  step: () => void = () => {},
) {
  const order: string[] = [];
  let viewport: number[] = [];
  let painted = false;
  let lost = false;
  const syncs: { status: number }[] = [];
  const context = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    ALREADY_SIGNALED: 0x911a,
    TIMEOUT_EXPIRED: 0x911b,
    CONDITION_SATISFIED: 0x911c,
    WAIT_FAILED: 0x911d,
    fenceSync: () => {
      const sync = { status: 0x911b };
      syncs.push(sync);
      order.push("fence");
      return sync;
    },
    flush() {},
    clientWaitSync: (sync: { status: number }) => sync.status,
    deleteSync() {},
    isContextLost: () => lost,
  };
  const canvas = document.createElement("canvas");
  for (const axis of ["width", "height"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      axis,
    )!;
    Object.defineProperty(canvas, axis, {
      configurable: true,
      get() {
        return descriptor.get!.call(canvas);
      },
      set(value: number) {
        order.push(`${axis}:${value}`);
        painted = false;
        descriptor.set!.call(canvas, value);
      },
    });
  }
  const renderer = {
    isWebGLRenderer: true,
    domElement: canvas,
    getContext: () => context,
    shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap },
    xr: {
      enabled: false,
      isPresenting: false,
      addEventListener() {},
      removeEventListener() {},
    },
    render() {
      painted = true;
      order.push("render");
    },
    setViewport(...values: number[]) {
      viewport = values;
    },
    renderLists: { dispose() {} },
    dispose() {},
    forceContextLoss() {},
  } as unknown as WebGLRenderer;
  installSizingMethods.call(renderer, canvas, renderer.xr);
  const originalSetSize = renderer.setSize;
  const originalSetPixelRatio = renderer.setPixelRatio;
  const root = createRoot(canvas);
  roots.push(root);
  const errors = vi.fn();
  await root.configure({
    gl: renderer,
    frameloop: "demand",
    dpr: vehiclePixelRatio(width, height, nativeDpr),
    size: { width, height, top: 0, left: 0 },
  });
  function Work() {
    useFrame(() => {
      order.push("tick");
      step();
    });
    return <DemandRenderBackpressure onError={errors} />;
  }
  await act(async () => root.render(<Work />));
  const store = _roots.get(canvas)!.store;
  const complete = () =>
    syncs.forEach((sync) => {
      sync.status = context.ALREADY_SIGNALED;
    });
  complete();
  await frame();
  expect(painted).toBe(true);
  order.length = 0;
  return {
    canvas,
    renderer,
    order,
    store,
    complete,
    errors,
    originalSetSize,
    originalSetPixelRatio,
    viewport: () => viewport,
    remount: async () => act(async () => root.render(<Work />)),
    painted: () => painted,
    release: async () => act(async () => root.render(null)),
    resize: async (nextWidth: number, nextHeight: number, dpr = nativeDpr) => {
      await act(async () => {
        store.getState().setSize(nextWidth, nextHeight);
        store.getState().setDpr(vehiclePixelRatio(nextWidth, nextHeight, dpr));
      });
    },
    lose: () => {
      lost = true;
      canvas.dispatchEvent(new Event("webglcontextlost"));
    },
    restore: () => {
      lost = false;
      canvas.dispatchEvent(new Event("webglcontextrestored"));
    },
  };
}
it.each([
  [1440, 744, 1280, 644, 2, 1920, 966],
  [390, 372, 430, 428, 3, 645, 642],
])(
  "retains the painted %sx%s buffer until an admitted full %sx%s resize tick at DPR%s",
  async (
    width,
    height,
    nextWidth,
    nextHeight,
    nativeDpr,
    bufferWidth,
    bufferHeight,
  ) => {
    const f = await fixture(width, height, nativeDpr);
    const oldBuffer = [f.canvas.width, f.canvas.height];
    await f.resize(nextWidth, nextHeight);
    expect(f.painted()).toBe(true);
    expect([f.canvas.width, f.canvas.height]).toEqual(oldBuffer);
    expect(f.order).toEqual([]);
    await frame();
    expect(f.order).toEqual([]);
    expect(f.store.getState().internal.frames).toBe(1);
    f.complete();
    await act(async () => vi.advanceTimersByTimeAsync(16));
    await frame();
    expect(f.order).toEqual([
      `width:${bufferWidth}`,
      `height:${bufferHeight}`,
      "tick",
      "render",
      "fence",
    ]);
    expect(f.painted()).toBe(true);
    expect([f.canvas.width, f.canvas.height]).toEqual([
      bufferWidth,
      bufferHeight,
    ]);
    expect(f.renderer.getPixelRatio()).toBe(
      vehiclePixelRatio(nextWidth, nextHeight, nativeDpr),
    );
    expect(f.renderer.getSize(new THREE.Vector2()).toArray()).toEqual([
      nextWidth,
      nextHeight,
    ]);
    expect(
      f.renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(),
    ).toEqual([bufferWidth, bufferHeight]);
    expect(f.viewport()).toEqual([0, 0, nextWidth, nextHeight]);
    expect(f.errors).not.toHaveBeenCalled();
  },
);

it("coalesces repeated same-value requests without resetting the native buffer", async () => {
  const f = await fixture(390, 372, 3);
  for (let i = 0; i < 5; i++) await f.resize(390, 372);
  f.complete();
  await frame();
  expect(f.order).toEqual(["tick", "render", "fence"]);
  expect(f.canvas.width).toBe(585);
});

it("coalesces multiple viewport and native-density changes to the latest exact buffer", async () => {
  const f = await fixture(1440, 744, 2);
  await f.resize(1280, 644);
  await f.resize(390, 372, 3);
  await f.resize(430, 428, 1);
  await frame();
  expect(f.order).toEqual([]);
  expect(f.renderer.getPixelRatio()).toBe(vehiclePixelRatio(1440, 744, 2));
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(16));
  await frame();
  expect(f.order).toEqual([
    "width:430",
    "height:428",
    "tick",
    "render",
    "fence",
  ]);
  expect(f.renderer.getPixelRatio()).toBe(1);
  expect(f.renderer.getSize(new THREE.Vector2()).toArray()).toEqual([430, 428]);
});

it("updates requested CSS immediately and respects updateStyle=false while deferring native reset", async () => {
  const f = await fixture(390, 372, 3);
  f.renderer.setSize(430, 428);
  expect([f.canvas.style.width, f.canvas.style.height]).toEqual([
    "430px",
    "428px",
  ]);
  f.renderer.setSize(640, 360, false);
  f.renderer.setPixelRatio(1);
  expect([f.canvas.style.width, f.canvas.style.height]).toEqual([
    "430px",
    "428px",
  ]);
  expect(f.painted()).toBe(true);
  expect(f.renderer.getSize(new THREE.Vector2()).toArray()).toEqual([390, 372]);
  f.store.getState().invalidate();
  f.complete();
  await frame();
  expect(f.order).toEqual([
    "width:640",
    "height:360",
    "tick",
    "render",
    "fence",
  ]);
  expect([f.canvas.style.width, f.canvas.style.height]).toEqual([
    "430px",
    "428px",
  ]);
  expect(
    f.renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(),
  ).toEqual([640, 360]);
});

it("does not reset a buffer merely because its fence completes without root demand", async () => {
  const f = await fixture(390, 372, 3);
  f.renderer.setSize(430, 428);
  expect(f.store.getState().internal.frames).toBe(0);
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(16));
  await frame();
  expect(f.order).toEqual([]);
  expect(f.painted()).toBe(true);
  expect(f.canvas.width).toBe(585);
  f.store.getState().invalidate();
  await frame();
  expect(f.order).toEqual([
    "width:645",
    "height:642",
    "tick",
    "render",
    "fence",
  ]);
});

it("does not reset an inactive root, retaining the latest size for its next active tick", async () => {
  const f = await fixture(390, 372, 3);
  f.store.getState().internal.active = false;
  await f.resize(430, 428);
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(16));
  await frame();
  expect(f.order).toEqual([]);
  expect(f.painted()).toBe(true);
  f.store.getState().internal.active = true;
  f.store.getState().invalidate();
  await frame();
  expect(f.order).toEqual([
    "width:645",
    "height:642",
    "tick",
    "render",
    "fence",
  ]);
});

it("retains pending resize through context loss until the restored owner admits a tick", async () => {
  const f = await fixture(390, 372, 3);
  await f.resize(430, 428);
  f.lose();
  f.complete();
  await frame();
  expect(f.order).toEqual([]);
  f.restore();
  await frame();
  expect(f.order).toEqual(["fence"]);
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(16));
  await frame();
  expect(f.order).toEqual([
    "fence",
    "width:645",
    "height:642",
    "tick",
    "render",
    "fence",
  ]);
});

it("retires a queued resize without writes and recovers latest store size on owner replacement", async () => {
  const f = await fixture(390, 372, 3);
  await f.resize(430, 428);
  await f.release();
  expect(f.order).toEqual([]);
  expect(f.renderer.setSize).toBe(f.originalSetSize);
  expect(f.renderer.setPixelRatio).toBe(f.originalSetPixelRatio);
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(100));
  await frame();
  // No scene owner remains to apply the discarded resize.
  expect(
    f.order.filter(
      (event) => event.startsWith("width:") || event.startsWith("height:"),
    ),
  ).toEqual([]);
  f.order.length = 0;
  await f.remount();
  await frame();
  expect(f.order).toEqual(["fence"]);
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(16));
  await frame();
  expect(f.order).toEqual([
    "fence",
    "width:645",
    "height:642",
    "tick",
    "render",
    "fence",
  ]);
});

it("does not reset a later root if a sibling throws before its admitted subscriber tick", async () => {
  let throws = false;
  const sibling = await fixture(100, 100, 1, () => {
    if (throws) throw new Error("sibling failure");
  });
  const f = await fixture(390, 372, 3);
  await f.resize(430, 428);
  f.complete();
  sibling.complete();
  sibling.store.getState().invalidate();
  throws = true;
  await expect(frame()).rejects.toThrow("sibling failure");
  expect(f.order).toEqual([]);
  expect(f.painted()).toBe(true);
  throws = false;
  await frame();
  expect(f.order).toEqual([
    "width:645",
    "height:642",
    "tick",
    "render",
    "fence",
  ]);
});

it("keeps retired request functions silent and cancels their pending native resize", async () => {
  const f = await fixture(390, 372, 3);
  const staleSize = f.renderer.setSize;
  const staleDpr = f.renderer.setPixelRatio;
  await f.resize(430, 428);
  await f.release();
  const style = [f.canvas.style.width, f.canvas.style.height];
  staleSize(999, 888);
  staleDpr(2);
  expect([f.canvas.style.width, f.canvas.style.height]).toEqual(style);
  expect([f.canvas.width, f.canvas.height]).toEqual([585, 558]);
  expect(f.order).toEqual([]);
});

it("keeps undefined DPR a no-op and does not add native resets on fast completed frames", async () => {
  const f = await fixture(390, 372, 3);
  for (let step = 0; step < 12; step++) {
    f.renderer.setPixelRatio(undefined as unknown as number);
    f.store.getState().invalidate();
    f.complete();
    await frame();
  }
  expect(f.order.filter((event) => event === "render")).toHaveLength(12);
  expect(
    f.order.filter(
      (event) => event.startsWith("width:") || event.startsWith("height:"),
    ),
  ).toEqual([]);
  expect(f.renderer.getPixelRatio()).toBe(1.5);
});

it("keeps the painted Standard buffer while Reduced waits for the existing fence, then changes once", async () => {
  const f = await fixture(1440, 744, 2);
  await act(async () =>
    f.store.getState().setDpr(vehiclePixelRatio(1440, 744, 2, "reduced")),
  );
  await frame();
  expect(f.painted()).toBe(true);
  expect([f.canvas.width, f.canvas.height]).toEqual([1967, 1016]);
  expect(f.order).toEqual([]);
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(16));
  await frame();
  expect(f.order).toEqual([
    "width:1391",
    "height:718",
    "tick",
    "render",
    "fence",
  ]);
  expect(f.painted()).toBe(true);
  expect(f.errors).not.toHaveBeenCalled();
});

it("reverses an uncommitted quality choice without a redundant buffer reset", async () => {
  const f = await fixture(1440, 744, 2);
  for (const quality of ["reduced", "standard"] as const)
    await act(async () =>
      f.store.getState().setDpr(vehiclePixelRatio(1440, 744, 2, quality)),
    );
  expect(f.order).toEqual([]);
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(16));
  await frame();
  expect(f.order).toEqual(["tick", "render", "fence"]);
  expect([f.canvas.width, f.canvas.height]).toEqual([1967, 1016]);
});

it("retires an unapplied quality choice on owner release without a native write", async () => {
  const f = await fixture(1440, 744, 2);
  await act(async () =>
    f.store.getState().setDpr(vehiclePixelRatio(1440, 744, 2, "reduced")),
  );
  await f.release();
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(100));
  await frame();
  // Removing the owner leaves a live empty R3F root, which may redraw. The
  // retired resize must not change either native dimension.
  expect(
    f.order.filter(
      (event) => event.startsWith("width:") || event.startsWith("height:"),
    ),
  ).toEqual([]);
  expect([f.canvas.width, f.canvas.height]).toEqual([1967, 1016]);
});

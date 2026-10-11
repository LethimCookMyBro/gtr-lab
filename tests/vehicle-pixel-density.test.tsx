// @vitest-environment jsdom
import { createRequire } from "node:module";
import { act as domAct, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createRoot, extend, _roots } from "@react-three/fiber";
import type { Vector2, WebGLRenderer } from "three";
import VehicleScene from "../src/components/three/VehicleScene";
import {
  initialVehiclePixelRatio,
  vehiclePixelRatio,
} from "../src/components/three/VehiclePixelDensity";
import type { VehicleSceneProps } from "../src/components/three/types";

const host = vi.hoisted(() => ({ canvas: {} as any }));
vi.mock("@react-three/fiber", async (original) => ({
  ...(await original<typeof import("@react-three/fiber")>()),
  Canvas: (props: any) => {
    host.canvas = props;
    return null;
  },
}));
vi.mock("../src/components/three/useVehicleAsset", () => ({
  useVehicleAsset: () => null,
}));
vi.mock("../src/components/three/CameraRig", () => ({ CameraRig: () => null }));

// The installed R3F store/configure and scene hooks are real. Substitute only
// the WebGL device and outer Canvas DOM measurement; no browser/server runs.
const THREE: typeof import("three") = createRequire(import.meta.url)("three");
extend({ Color: THREE.Color });
const roots: ReturnType<typeof createRoot>[] = [];
let rafs: Map<number, FrameRequestCallback>;
let nextRaf: number;
async function frame() {
  // Let the fake device complete its submitted prefix before the real RAF loop.
  await act(async () => vi.advanceTimersByTimeAsync(0));
  await act(async () => {
    const callbacks = [...rafs.values()];
    rafs.clear();
    callbacks.forEach((callback) => callback(performance.now()));
  });
}
const props: VehicleSceneProps = {
  url: "/exterior.glb",
  paint: "#aaaaaa",
  environment: "studio",
  preset: "hero",
  autoRotate: true,
  lights: false,
  reducedMotion: false,
  materialRoles: { paint: [], headlights: [], taillights: [] },
  onReady() {},
  onError() {},
  onProgress() {},
  onManual() {},
};

beforeEach(() => {
  vi.useFakeTimers();
  rafs = new Map();
  nextRaf = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    rafs.set(++nextRaf, callback);
    return nextRaf;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => rafs.delete(id));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("devicePixelRatio", 2);
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("innerHeight", 900);
});
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots.length = 0;
  cleanup();
  await frame();
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function setup(
  width = 1440,
  height = 900,
  renderQuality: "standard" | "reduced" = "standard",
) {
  const view = render(
    <VehicleScene {...props} renderQuality={renderQuality} />,
  );
  const canvas = document.createElement("canvas");
  let rendererWidth = canvas.width;
  let rendererHeight = canvas.height;
  let pixelRatio = 1;
  // Keep the real admission owner mounted. Each device fence completes only
  // after flush returns control to another task, and deleted handles are invalid.
  const syncs = new Set<{ signaled: boolean }>();
  const context = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    ALREADY_SIGNALED: 0x911a,
    TIMEOUT_EXPIRED: 0x911b,
    CONDITION_SATISFIED: 0x911c,
    WAIT_FAILED: 0x911d,
    fenceSync: vi.fn(() => {
      const sync = { signaled: false };
      syncs.add(sync);
      return sync;
    }),
    flush: vi.fn(() => {
      const submitted = [...syncs];
      setTimeout(() => {
        for (const sync of submitted) {
          if (syncs.has(sync)) sync.signaled = true;
        }
      }, 0);
    }),
    clientWaitSync: vi.fn((sync: { signaled: boolean }): number =>
      !syncs.has(sync)
        ? context.WAIT_FAILED
        : sync.signaled
          ? context.ALREADY_SIGNALED
          : context.TIMEOUT_EXPIRED,
    ),
    deleteSync: vi.fn((sync: { signaled: boolean }) => {
      syncs.delete(sync);
    }),
    isContextLost: () => false,
    get drawingBufferWidth() {
      return canvas.width;
    },
    get drawingBufferHeight() {
      return canvas.height;
    },
  };
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
    getSize: (target: Vector2) => target.set(rendererWidth, rendererHeight),
    getPixelRatio: () => pixelRatio,
    getDrawingBufferSize: (target: Vector2) =>
      target
        .set(rendererWidth * pixelRatio, rendererHeight * pixelRatio)
        .floor(),
    // Match Three's nested DPR resize and independent atomic buffer setter.
    setPixelRatio: vi.fn((value: number | undefined): void => {
      if (value === undefined) return;
      pixelRatio = value;
      renderer.setSize(rendererWidth, rendererHeight, false);
    }),
    setSize: vi.fn(
      (nextWidth: number, nextHeight: number, updateStyle = true): void => {
        if (renderer.xr.isPresenting) return;
        rendererWidth = nextWidth;
        rendererHeight = nextHeight;
        canvas.width = Math.floor(nextWidth * pixelRatio);
        canvas.height = Math.floor(nextHeight * pixelRatio);
        if (updateStyle) {
          canvas.style.width = `${nextWidth}px`;
          canvas.style.height = `${nextHeight}px`;
        }
      },
    ),
    setDrawingBufferSize: vi.fn(
      (nextWidth: number, nextHeight: number, nextPixelRatio: number): void => {
        rendererWidth = nextWidth;
        rendererHeight = nextHeight;
        pixelRatio = nextPixelRatio;
        canvas.width = Math.floor(nextWidth * pixelRatio);
        canvas.height = Math.floor(nextHeight * pixelRatio);
      },
    ),
    render() {},
    renderLists: { dispose() {} },
    forceContextLoss() {},
    dispose() {},
  };
  // Keep the actual native sizing spies after production wraps the requests.
  const deviceSizing = {
    setPixelRatio: renderer.setPixelRatio,
    setSize: renderer.setSize,
    setDrawingBufferSize: renderer.setDrawingBufferSize,
  };
  const root = createRoot(canvas);
  roots.push(root);
  const configure = (nextWidth = width, nextHeight = height) => {
    width = nextWidth;
    height = nextHeight;
    return root.configure({
      ...host.canvas,
      onCreated: undefined,
      gl: renderer as unknown as WebGLRenderer,
      frameloop: "demand",
      size: { width, height, top: 0, left: 0 },
    });
  };
  await configure();
  const store = _roots.get(canvas)!.store;
  await act(async () => root.render(host.canvas.children));
  // A measured scene size can update Canvas's controlled DPR once.
  await configure();
  await frame();
  return { view, root, store, renderer, deviceSizing, configure };
}

it.each([
  [1440, 744, 2, "standard"],
  [390, 372, 3, "standard"],
  [1440, 744, 2, "reduced"],
  [390, 372, 3, "reduced"],
] as const)(
  "does not resize the %sx%s drawing buffer at native DPR%s in %s quality on orbit regression, recovery, or unchanged Canvas configure",
  async (width, height, nativeDpr, renderQuality) => {
    vi.stubGlobal("devicePixelRatio", nativeDpr);
    const { view, root, store, renderer, deviceSizing, configure } =
      await setup(width, height, renderQuality);
    const stableDpr = store.getState().viewport.dpr;
    const initialRenderer = store.getState().gl;
    deviceSizing.setPixelRatio.mockClear();
    deviceSizing.setSize.mockClear();
    deviceSizing.setDrawingBufferSize.mockClear();
    for (let step = 0; step < 3; step++) {
      await act(async () => store.getState().performance.regress());
      expect(store.getState().viewport.dpr).toBe(stableDpr);
      view.rerender(
        <VehicleScene
          {...props}
          renderQuality={renderQuality}
          paint={step ? "#222222" : "#ffffff"}
          lights={step % 2 === 0}
          autoRotate={step % 2 !== 0}
          cameraRequest={step}
        />,
      );
      await configure();
      await act(async () => root.render(host.canvas.children));
      await act(async () => vi.advanceTimersByTimeAsync(250));
      await frame();
      expect(store.getState().viewport.dpr).toBe(stableDpr);
    }
    expect(deviceSizing.setPixelRatio).not.toHaveBeenCalled();
    expect(deviceSizing.setSize).not.toHaveBeenCalled();
    expect(deviceSizing.setDrawingBufferSize).not.toHaveBeenCalled();
    expect([renderer.domElement.width, renderer.domElement.height]).toEqual([
      Math.floor(width * stableDpr),
      Math.floor(height * stableDpr),
    ]);
    expect(store.getState().gl).toBe(initialRenderer);
  },
);

it.each([
  [390, 844, 3],
  [1440, 900, 2],
  [3840, 2160, 2],
  [390, 844, 1],
])(
  "bounds the %sx%s viewport at native DPR %s",
  async (width, height, nativeDpr) => {
    vi.stubGlobal("devicePixelRatio", nativeDpr);
    const { store } = await setup(width, height);
    const dpr = store.getState().viewport.dpr;
    expect(dpr).toBeLessThanOrEqual(Math.min(nativeDpr, 1.5));
    expect(width * height * dpr * dpr).toBeLessThanOrEqual(2_000_001);
    if (width === 390) expect(dpr).toBe(Math.min(nativeDpr, 1.5));
  },
);

it("updates only when the measured viewport or native DPR changes", async () => {
  const { store, renderer, deviceSizing, configure } = await setup();
  deviceSizing.setPixelRatio.mockClear();
  await act(async () => store.getState().setSize(390, 844));
  expect(host.canvas.dpr).toBe(1.5);
  // Native DPR can change on zoom or moving between screens without a CSS resize.
  vi.stubGlobal("devicePixelRatio", 1);
  await domAct(async () => window.dispatchEvent(new Event("resize")));
  expect(host.canvas.dpr).toBe(1);
  await configure();
  expect(store.getState().viewport.dpr).toBe(1);
});

it("tracks display-density media changes without a resize and detaches listeners on unmount", async () => {
  const queries: {
    query: string;
    target: EventTarget;
    remove: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal("matchMedia", (query: string) => {
    const target = new EventTarget();
    const remove = vi.fn(target.removeEventListener.bind(target));
    queries.push({ query, target, remove });
    return {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: remove,
    };
  });
  const { root } = await setup(390, 844);
  expect(queries[0].query).toBe("(resolution: 2dppx)");
  vi.stubGlobal("devicePixelRatio", 1);
  await act(async () => queries[0].target.dispatchEvent(new Event("change")));
  expect(host.canvas.dpr).toBe(1);
  expect(queries[0].remove).toHaveBeenCalledTimes(1);
  expect(queries[1].query).toBe("(resolution: 1dppx)");
  await act(async () => root.unmount());
  expect(queries[1].remove).toHaveBeenCalledTimes(1);
});

// Golden dimensions use the installed renderer's floor-per-axis contract.
// These are CPU/store regressions; browser buffer observations remain required.
it.each([
  [1440, 744, 2, 1967, 1016],
  [1280, 644, 2, 1920, 966],
  [390, 372, 3, 585, 558],
  [430, 428, 3, 645, 642],
  [390, 844, 3, 585, 1266],
  [390, 372, 1, 390, 372],
  [640, 360, 1, 640, 360],
  [1280, 720, 0.75, 960, 540],
  [1920, 1080, 1, 1885, 1060],
  [3840, 2160, 2, 1885, 1060],
])(
  "sets exact %sx%s native DPR%s backing dimensions %sx%s",
  async (width, height, nativeDpr, bufferWidth, bufferHeight) => {
    vi.stubGlobal("devicePixelRatio", nativeDpr);
    const { store, renderer } = await setup(width, height);
    const ratio = store.getState().viewport.dpr;
    expect(ratio).toBe(vehiclePixelRatio(width, height, nativeDpr));
    expect([Math.floor(width * ratio), Math.floor(height * ratio)]).toEqual([
      bufferWidth,
      bufferHeight,
    ]);
    expect([renderer.domElement.width, renderer.domElement.height]).toEqual([
      bufferWidth,
      bufferHeight,
    ]);
    expect(bufferWidth * bufferHeight).toBeLessThanOrEqual(2_000_000);
    expect(ratio).toBeLessThanOrEqual(Math.min(nativeDpr, 1.5));
    expect(host.canvas.gl.antialias).toBe(true);
  },
);
it("starts with the original 2M cap before the actual canvas is measured", () => {
  const ratio = initialVehiclePixelRatio();
  expect(ratio).toBe(Math.sqrt(2_000_000 / (1440 * 900)));
  expect([Math.floor(1440 * ratio), Math.floor(900 * ratio)]).toEqual([
    1788, 1118,
  ]);
});

it.each([
  [1440, 744, 1280, 644, 2, 1920, 966],
  [390, 372, 430, 428, 3, 645, 642],
])(
  "resizes %sx%s to %sx%s at native DPR%s once, then keeps the %sx%s backing size stable",
  async (
    width,
    height,
    nextWidth,
    nextHeight,
    nativeDpr,
    bufferWidth,
    bufferHeight,
  ) => {
    vi.stubGlobal("devicePixelRatio", nativeDpr);
    const { view, root, store, renderer, deviceSizing, configure } =
      await setup(width, height);
    deviceSizing.setSize.mockClear();
    deviceSizing.setDrawingBufferSize.mockClear();
    await act(async () => store.getState().setSize(nextWidth, nextHeight));
    await act(async () => {
      await configure(nextWidth, nextHeight);
    });
    await act(async () => root.render(host.canvas.children));
    await act(async () => {
      await configure();
    });
    const dpr = store.getState().viewport.dpr;
    expect(dpr).toBe(vehiclePixelRatio(nextWidth, nextHeight, nativeDpr));
    expect([Math.floor(nextWidth * dpr), Math.floor(nextHeight * dpr)]).toEqual(
      [bufferWidth, bufferHeight],
    );
    await frame();
    expect(deviceSizing.setDrawingBufferSize).toHaveBeenCalledExactlyOnceWith(
      nextWidth,
      nextHeight,
      dpr,
    );
    expect(deviceSizing.setSize).not.toHaveBeenCalled();
    expect([renderer.domElement.width, renderer.domElement.height]).toEqual([
      bufferWidth,
      bufferHeight,
    ]);
    deviceSizing.setDrawingBufferSize.mockClear();
    deviceSizing.setSize.mockClear();
    deviceSizing.setPixelRatio.mockClear();
    view.rerender(
      <VehicleScene {...props} paint="#222222" lights autoRotate={false} />,
    );
    await act(async () => store.getState().performance.regress());
    await act(async () => {
      await configure();
    });
    await act(async () => root.render(host.canvas.children));
    await act(async () => vi.advanceTimersByTimeAsync(250));
    await act(async () => {
      await configure();
    });
    await frame();
    expect(store.getState().viewport.dpr).toBe(dpr);
    expect(deviceSizing.setPixelRatio).not.toHaveBeenCalled();
    expect(deviceSizing.setSize).not.toHaveBeenCalled();
    expect(deviceSizing.setDrawingBufferSize).not.toHaveBeenCalled();
  },
);

it("starts Reduced at its chosen budget before actual canvas measurement", () => {
  expect(initialVehiclePixelRatio("reduced")).toBe(
    Math.sqrt(1_000_000 / (1440 * 900)),
  );
});

it.each([
  [1440, 744, 2, 1391, 718],
  [1280, 644, 2, 1409, 709],
  [390, 372, 3, 585, 558],
  [430, 428, 3, 645, 642],
  [3840, 2160, 2, 1333, 750],
])(
  "starts Reduced %sx%s at DPR%s with exact %sx%s pixels and antialiasing",
  async (width, height, nativeDpr, bufferWidth, bufferHeight) => {
    vi.stubGlobal("devicePixelRatio", nativeDpr);
    const { store, renderer } = await setup(width, height, "reduced");
    expect(store.getState().viewport.dpr).toBe(
      vehiclePixelRatio(width, height, nativeDpr, "reduced"),
    );
    expect([renderer.domElement.width, renderer.domElement.height]).toEqual([
      bufferWidth,
      bufferHeight,
    ]);
    expect(bufferWidth * bufferHeight).toBeLessThanOrEqual(1_000_000);
    expect(host.canvas.gl.antialias).toBe(true);
  },
);

it("changes and reverses quality through the same admitted DPR owner", async () => {
  const { view, root, store, renderer, deviceSizing, configure } = await setup(
    1440,
    744,
  );
  const originalRenderer = store.getState().gl;
  const initialSize = [renderer.domElement.width, renderer.domElement.height];
  const setChoice = async (renderQuality: "standard" | "reduced") => {
    view.rerender(<VehicleScene {...props} renderQuality={renderQuality} />);
    await act(async () => root.render(host.canvas.children));
    await configure();
  };
  deviceSizing.setDrawingBufferSize.mockClear();
  deviceSizing.setPixelRatio.mockClear();
  deviceSizing.setSize.mockClear();
  await setChoice("reduced");
  expect(host.canvas.dpr).toBe(vehiclePixelRatio(1440, 744, 2, "reduced"));
  expect([renderer.domElement.width, renderer.domElement.height]).toEqual(
    initialSize,
  );
  expect(deviceSizing.setDrawingBufferSize).not.toHaveBeenCalled();
  await frame();
  expect([renderer.domElement.width, renderer.domElement.height]).toEqual([
    1391, 718,
  ]);
  expect(deviceSizing.setDrawingBufferSize).toHaveBeenCalledTimes(1);
  await setChoice("standard");
  await frame();
  expect([renderer.domElement.width, renderer.domElement.height]).toEqual(
    initialSize,
  );
  expect(deviceSizing.setDrawingBufferSize).toHaveBeenCalledTimes(2);
  expect(deviceSizing.setPixelRatio).not.toHaveBeenCalled();
  expect(deviceSizing.setSize).not.toHaveBeenCalled();
  expect(store.getState().gl).toBe(originalRenderer);
});

it("coalesces rapid quality choices to the final requested buffer", async () => {
  const { view, root, renderer, deviceSizing, configure } = await setup(
    1440,
    744,
  );
  deviceSizing.setDrawingBufferSize.mockClear();
  for (const renderQuality of ["reduced", "standard", "reduced"] as const) {
    view.rerender(<VehicleScene {...props} renderQuality={renderQuality} />);
    await act(async () => root.render(host.canvas.children));
    await configure();
  }
  expect(deviceSizing.setDrawingBufferSize).not.toHaveBeenCalled();
  await frame();
  expect(deviceSizing.setDrawingBufferSize).toHaveBeenCalledTimes(1);
  expect([renderer.domElement.width, renderer.domElement.height]).toEqual([
    1391, 718,
  ]);
});

it("does not reset mobile buffers when both choices produce the same ratio", async () => {
  const { view, root, renderer, deviceSizing, configure } = await setup(
    390,
    372,
  );
  deviceSizing.setDrawingBufferSize.mockClear();
  view.rerender(<VehicleScene {...props} renderQuality="reduced" />);
  await act(async () => root.render(host.canvas.children));
  await configure();
  await frame();
  expect(deviceSizing.setDrawingBufferSize).not.toHaveBeenCalled();
  expect([renderer.domElement.width, renderer.domElement.height]).toEqual([
    585, 558,
  ]);
});

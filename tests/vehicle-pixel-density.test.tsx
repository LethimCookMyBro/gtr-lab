// @vitest-environment jsdom
import { createRequire } from "node:module";
import { act as domAct, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createRoot, extend, _roots } from "@react-three/fiber";
import type { WebGLRenderer } from "three";
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
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("devicePixelRatio", 2);
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("innerHeight", 900);
});
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots.length = 0;
  cleanup();
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function setup(width = 1440, height = 900) {
  const view = render(<VehicleScene {...props} />);
  const canvas = document.createElement("canvas");
  const renderer = {
    isWebGLRenderer: true,
    domElement: canvas,
    shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap },
    xr: {
      enabled: false,
      isPresenting: false,
      addEventListener() {},
      removeEventListener() {},
    },
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render() {},
    renderLists: { dispose() {} },
    forceContextLoss() {},
    dispose() {},
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
      frameloop: "never",
      size: { width, height, top: 0, left: 0 },
    });
  };
  await configure();
  const store = _roots.get(canvas)!.store;
  await act(async () => root.render(host.canvas.children));
  // A measured scene size can update Canvas's controlled DPR once.
  await configure();
  return { view, root, store, renderer, configure };
}

it.each([
  [1440, 744, 2],
  [390, 372, 3],
])(
  "does not resize the %sx%s drawing buffer at native DPR%s on orbit regression, recovery, or unchanged Canvas configure",
  async (width, height, nativeDpr) => {
    vi.stubGlobal("devicePixelRatio", nativeDpr);
    const { view, root, store, renderer, configure } = await setup(
      width,
      height,
    );
    const stableDpr = store.getState().viewport.dpr;
    const initialRenderer = store.getState().gl;
    renderer.setPixelRatio.mockClear();
    renderer.setSize.mockClear();
    for (let step = 0; step < 3; step++) {
      await act(async () => store.getState().performance.regress());
      expect(store.getState().viewport.dpr).toBe(stableDpr);
      view.rerender(
        <VehicleScene
          {...props}
          paint={step ? "#222222" : "#ffffff"}
          lights={step % 2 === 0}
          autoRotate={step % 2 !== 0}
          cameraRequest={step}
        />,
      );
      await configure();
      await act(async () => root.render(host.canvas.children));
      await act(async () => vi.advanceTimersByTimeAsync(250));
      expect(store.getState().viewport.dpr).toBe(stableDpr);
    }
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(renderer.setSize).not.toHaveBeenCalled();
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
  const { store, renderer, configure } = await setup();
  renderer.setPixelRatio.mockClear();
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
    const { store } = await setup(width, height);
    const ratio = store.getState().viewport.dpr;
    expect(ratio).toBe(vehiclePixelRatio(width, height, nativeDpr));
    expect([Math.floor(width * ratio), Math.floor(height * ratio)]).toEqual([
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
    const { view, root, store, renderer, configure } = await setup(
      width,
      height,
    );
    renderer.setSize.mockClear();
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
    expect(renderer.setSize).toHaveBeenCalled();
    renderer.setSize.mockClear();
    renderer.setPixelRatio.mockClear();
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
    expect(store.getState().viewport.dpr).toBe(dpr);
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(renderer.setSize).not.toHaveBeenCalled();
  },
);

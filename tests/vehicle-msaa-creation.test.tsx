// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { act, createRoot, _roots } from "@react-three/fiber";
import type { CanvasProps } from "@react-three/fiber";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import VehicleScene from "../src/components/three/VehicleScene";
import type { VehicleSceneProps } from "../src/components/three/types";

const host = vi.hoisted(() => ({ canvas: {} as CanvasProps }));
vi.mock("@react-three/fiber", async (original) => ({
  ...(await original<typeof import("@react-three/fiber")>()),
  Canvas: (props: CanvasProps) => {
    host.canvas = props;
    return null;
  },
}));
vi.mock("../src/components/three/useVehicleAsset", () => ({
  useVehicleAsset: () => null,
}));

const require = createRequire(import.meta.url);
const THREE: typeof import("three") = require("three");
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * Only the WebGL device is synthetic. Installed Three's entire renderer
 * constructor and installed R3F's renderer factory/configuration run unchanged.
 * No scene draw, native GPU, shader compilation, browser, or socket is involved.
 * Context attributes below are observed at canvas.getContext, not inferred from
 * a mutable renderer.antialias property or echoed mock constructor parameters.
 */
function recordingWebGLCanvas() {
  const canvas = document.createElement("canvas");
  let requestedAttributes: WebGLContextAttributes = {};
  const enums = new Map<string, number>();
  const names = new Map<number, string>();
  const device: Record<string, unknown> = {
    canvas,
    getContextAttributes: () => ({ ...requestedAttributes }),
    getExtension: (name: string) =>
      name === "WEBGL_lose_context"
        ? { loseContext() {}, restoreContext() {} }
        : null,
    getShaderPrecisionFormat: () => ({
      rangeMin: 127,
      rangeMax: 127,
      precision: 23,
    }),
    getParameter: (parameter: number) => {
      switch (names.get(parameter)) {
        case "VERSION":
          return "WebGL 2.0 (socket-free test double)";
        case "SCISSOR_BOX":
        case "VIEWPORT":
          return [0, 0, canvas.width, canvas.height];
        default:
          return 16;
      }
    },
  };
  const context = new Proxy(device, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
        if (!enums.has(key)) {
          const value = enums.size + 1;
          enums.set(key, value);
          names.set(value, key);
        }
        return enums.get(key);
      }
      // Bootstrap/disposal calls are inert. No rendering is tested here.
      return (target[key] = key.startsWith("create")
        ? () => ({})
        : () => undefined);
    },
  }) as unknown as WebGL2RenderingContext;
  const getContext = vi.fn(
    (kind: string, attributes?: WebGLContextAttributes) => {
      if (kind !== "webgl2") throw new Error(`Unexpected context: ${kind}`);
      requestedAttributes = { ...attributes };
      return context;
    },
  );
  Object.defineProperty(canvas, "getContext", { value: getContext });
  return { canvas, context, getContext };
}

async function setup() {
  const view = render(<VehicleScene {...props} />);
  const { canvas, context, getContext } = recordingWebGLCanvas();
  const root = createRoot(canvas);
  roots.push(root);
  const configure = () =>
    root.configure({
      ...host.canvas,
      // Canvas's DOM measurement is replaced by a fixed size. Its renderer
      // option object and demand frameloop are passed through unchanged.
      size: { width: 1440, height: 900, top: 0, left: 0 },
      onCreated: undefined,
    });
  await configure();
  const store = _roots.get(canvas)!.store;
  return { view, root, store, context, getContext, configure };
}

it("exercises the installed R3F 9.8.1 and Three 0.180.0 creation path", () => {
  expect(require("@react-three/fiber/package.json").version).toBe("9.8.1");
  const threePackage = join(
    dirname(require.resolve("three")),
    "../package.json",
  );
  expect(JSON.parse(readFileSync(threePackage, "utf8")).version).toBe(
    "0.180.0",
  );
  expect(THREE.REVISION).toBe("180");
});

it("forwards VehicleScene antialias:false through R3F to native-context creation options", async () => {
  const { store, context, getContext } = await setup();
  const renderer = store.getState().gl;
  expect(renderer).toBeInstanceOf(THREE.WebGLRenderer);
  expect(renderer.getContext()).toBe(context);
  expect(host.canvas.gl).toEqual({
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: true,
  });
  expect(getContext).toHaveBeenCalledExactlyOnceWith("webgl2", {
    // Three 0.180.0 deliberately requests alpha:true even when its constructor
    // receives alpha:false. Do not misreport this as an opaque native context.
    alpha: true,
    depth: true,
    stencil: false,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: true,
  });
  expect(store.getState().frameloop).toBe("demand");
  expect(store.getState().viewport.dpr).toBeCloseTo(
    Math.sqrt(2_000_000 / (1440 * 900)),
  );
});

it("does not recreate the renderer, re-request context, or rewrite antialias on equal inline options", async () => {
  const { view, store, getContext, configure } = await setup();
  const renderer = store.getState().gl;
  const initialOptions = host.canvas.gl;
  const initialDpr = renderer.getPixelRatio();
  // Three's native context setting is immutable. R3F also applies gl option
  // properties onto the renderer once; catch subsequent cosmetic assignments.
  let antialias = (renderer as typeof renderer & { antialias: boolean })
    .antialias;
  const setAntialias = vi.fn((value: boolean) => {
    antialias = value;
  });
  Object.defineProperty(renderer, "antialias", {
    configurable: true,
    get: () => antialias,
    set: setAntialias,
  });
  const setPixelRatio = vi.spyOn(renderer, "setPixelRatio");
  const setSize = vi.spyOn(renderer, "setSize");
  for (let step = 0; step < 3; step++) {
    view.rerender(
      <VehicleScene
        {...props}
        paint={step ? "#222222" : "#ffffff"}
        lights={step % 2 === 0}
        autoRotate={step % 2 !== 0}
        cameraRequest={step}
      />,
    );
    expect(host.canvas.gl).not.toBe(initialOptions);
    expect(host.canvas.gl).toEqual(initialOptions);
    await configure();
    await configure();
    expect(store.getState().gl).toBe(renderer);
    expect(renderer.getPixelRatio()).toBe(initialDpr);
    expect(antialias).toBe(false);
  }
  expect(getContext).toHaveBeenCalledTimes(1);
  expect(setAntialias).not.toHaveBeenCalled();
  expect(setPixelRatio).not.toHaveBeenCalled();
  expect(setSize).not.toHaveBeenCalled();
});

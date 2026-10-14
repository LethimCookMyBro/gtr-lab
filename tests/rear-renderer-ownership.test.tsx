// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  Texture,
  type WebGLRenderer,
} from "three";
import RearVehicleScene from "../src/components/home/RearVehicleScene";
import {
  prepareVehicle,
  type PreparedVehicle,
} from "../src/components/three/materialAdapter";
import { registerRendererResourceOwner } from "../src/components/three/rendererResourceOwnership";
import { textureAllocation } from "./helpers/three-texture-allocation";

const host = vi.hoisted(() => ({
  onCreated: null as ((state: { gl: WebGLRenderer }) => void) | null,
  asset: null as PreparedVehicle | null,
  realCanvas: false,
  renderer: null as WebGLRenderer | null,
  creations: 0,
}));
vi.mock("@react-three/fiber", async (original) => {
  const actual = await original<typeof import("@react-three/fiber")>();
  return {
    ...actual,
    Canvas: (props: { onCreated: typeof host.onCreated }) => {
      host.onCreated = props.onCreated;
      if (!host.realCanvas) return null;
      // Keep the installed Canvas lifecycle and the homepage's real onCreated
      // callback. Scene painting is outside this CPU ownership regression.
      return (
        <actual.Canvas
          gl={() => host.renderer!}
          frameloop="never"
          onCreated={(state) => {
            host.creations++;
            props.onCreated?.(state);
          }}
        />
      );
    },
  };
});
vi.mock("../src/components/three/useVehicleAsset", () => ({
  useVehicleAsset: () => host.asset,
}));
afterEach(() => {
  cleanup();
  host.asset = null;
  host.onCreated = null;
  host.realCanvas = false;
  host.renderer = null;
  host.creations = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const view = (progress = 0, active = true) => (
  <RearVehicleScene
    progress={progress}
    active={active}
    reducedMotion={false}
    onReady={() => {}}
    onError={() => {}}
    onProgress={() => {}}
  />
);
function fixture() {
  const allocation = textureAllocation();
  const sync = {};
  let complete = false;
  const context = {
    SYNC_GPU_COMMANDS_COMPLETE: 1,
    ALREADY_SIGNALED: 2,
    TIMEOUT_EXPIRED: 3,
    CONDITION_SATISFIED: 4,
    WAIT_FAILED: 5,
    isContextLost: () => false,
    fenceSync: vi.fn(() => sync),
    flush: vi.fn(),
    deleteSync: vi.fn(),
    clientWaitSync: vi.fn(() => (complete ? 2 : 3)),
  };
  const nativeDispose = vi.fn(() => allocation.properties.dispose());
  const renderer = {
    isWebGLRenderer: true,
    domElement: document.createElement("canvas"),
    dispose: nativeDispose,
    forceContextLoss: vi.fn(),
    getContext: () => context,
    setClearAlpha: vi.fn(),
    compile: vi.fn(() => new Set()),
    info: { programs: [] },
    shadowMap: { enabled: false },
    xr: {
      enabled: false,
      isPresenting: false,
      addEventListener() {},
      removeEventListener() {},
    },
    render() {},
    setPixelRatio() {},
    setSize() {},
    getPixelRatio: () => 1,
    renderLists: { dispose: vi.fn() },
  } as unknown as WebGLRenderer;
  function asset() {
    const texture = new Texture(document.createElement("canvas"));
    const prepared = prepareVehicle(
      new Mesh(
        new BoxGeometry(),
        new MeshStandardMaterial({
          map: texture,
          roughnessMap: texture,
          metalnessMap: texture,
        }),
      ),
      { paint: [], headlights: [], taillights: [] },
    );
    allocation.upload(texture);
    const object = prepared.scene as Mesh;
    return {
      prepared,
      geometryDispose: vi.spyOn(object.geometry, "dispose"),
      materialDispose: vi.spyOn(
        object.material as MeshStandardMaterial,
        "dispose",
      ),
      textureDispose: vi.spyOn(texture, "dispose"),
    };
  }
  return {
    allocation,
    renderer,
    nativeDispose,
    context,
    sync,
    asset,
    complete: () => {
      complete = true;
    },
  };
}

it.each(["canvas-first", "loader-first"] as const)(
  "homepage onCreated retires latest resources before cache clear once (%s)",
  async (order) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const f = fixture();
    const result = render(view());
    // Canvas creation precedes the asynchronous load. Its disposer must read the
    // latest owned asset, not capture this initial null.
    host.onCreated!({ gl: f.renderer });
    const first = f.asset();
    host.asset = first.prepared;
    result.rerender(view());
    first.prepared.dispose();
    const latest = f.asset();
    host.asset = latest.prepared;
    result.rerender(view(0.8));
    result.rerender(view(0.2, false));
    expect(f.nativeDispose).not.toHaveBeenCalled();
    expect(latest.geometryDispose).not.toHaveBeenCalled();
    const helperRelease = vi.fn();
    const releaseHelper = registerRendererResourceOwner(
      f.renderer,
      helperRelease,
    );
    const clear = f.nativeDispose.getMockImplementation()!;
    f.nativeDispose.mockImplementation(() => {
      expect(helperRelease).toHaveBeenCalledTimes(1);
      expect(f.allocation.deleted).toEqual(f.allocation.allocated);
      expect(f.allocation.info.memory.textures).toBe(0);
      clear();
    });
    if (order === "loader-first") latest.prepared.dispose();
    const pending = f.renderer.dispose();
    expect(pending).toBeInstanceOf(Promise);
    expect(f.renderer.dispose()).toBe(pending);
    expect(f.nativeDispose).toHaveBeenCalledTimes(1);
    expect(f.context.clientWaitSync).not.toHaveBeenCalled();
    // Repeated outer passive/helper cleanup remains harmless in either order.
    latest.prepared.dispose();
    first.prepared.dispose();
    releaseHelper();
    releaseHelper();
    expect(helperRelease).toHaveBeenCalledTimes(1);
    for (const owned of [first, latest]) {
      expect(owned.geometryDispose).toHaveBeenCalledTimes(1);
      expect(owned.materialDispose).toHaveBeenCalledTimes(1);
      expect(owned.textureDispose).toHaveBeenCalledTimes(1);
    }
    expect(f.allocation.deleted).toEqual(f.allocation.allocated);
    await vi.advanceTimersByTimeAsync(16);
    expect(f.context.clientWaitSync).toHaveBeenCalledWith(f.sync, 0, 0);
    expect(f.context.deleteSync).not.toHaveBeenCalled();
    f.complete();
    await vi.advanceTimersByTimeAsync(16);
    await pending;
    expect(f.context.deleteSync).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("installed Canvas preserves the homepage owner through StrictMode/rerender and awaits drain on final retirement", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const resize = new Set<() => void>();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize.add(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 40,
    right: 40,
    width: 40,
    height: 40,
    toJSON() {},
  });
  const f = fixture();
  host.realCanvas = true;
  host.renderer = f.renderer;
  const result = render(<StrictMode>{view()}</StrictMode>);
  await act(async () => {
    resize.forEach((notify) => notify());
    await vi.advanceTimersByTimeAsync(50);
  });
  expect(host.creations).toBe(1);
  expect(f.nativeDispose).not.toHaveBeenCalled();
  const latest = f.asset();
  host.asset = latest.prepared;
  result.rerender(<StrictMode>{view(0.9)}</StrictMode>);
  expect(f.nativeDispose).not.toHaveBeenCalled();
  expect(latest.textureDispose).not.toHaveBeenCalled();
  await act(async () => result.unmount());
  expect(f.nativeDispose).toHaveBeenCalledTimes(1);
  expect(f.allocation.deleted).toEqual(f.allocation.allocated);
  expect(latest.textureDispose).toHaveBeenCalledTimes(1);
  expect(f.renderer.forceContextLoss).not.toHaveBeenCalled();
  latest.prepared.dispose();
  expect(latest.textureDispose).toHaveBeenCalledTimes(1);
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(16));
  expect(f.renderer.forceContextLoss).toHaveBeenCalledTimes(1);
  expect(f.context.deleteSync).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

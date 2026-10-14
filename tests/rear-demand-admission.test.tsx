// @vitest-environment jsdom
import { StrictMode, type ComponentProps } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector2,
  type WebGLRenderer,
} from "three";
import type { RootState } from "@react-three/fiber";
import RearVehicleScene from "../src/components/home/RearVehicleScene";
import {
  prepareVehicle,
  type PreparedVehicle,
} from "../src/components/three/materialAdapter";

const host = vi.hoisted(() => ({
  renderer: null as WebGLRenderer | null,
  state: null as RootState | null,
  asset: null as PreparedVehicle | null,
}));
vi.mock("@react-three/fiber", async (original) => {
  const actual = await original<typeof import("@react-three/fiber")>();
  return {
    ...actual,
    Canvas: (props: ComponentProps<typeof actual.Canvas>) => (
      <actual.Canvas
        {...props}
        gl={(defaults) => {
          host.renderer!.domElement = defaults.canvas as HTMLCanvasElement;
          return host.renderer!;
        }}
        onCreated={(state) => {
          host.state = state;
          props.onCreated?.(state);
        }}
      />
    ),
  };
});
vi.mock("../src/components/three/useVehicleAsset", () => ({
  useVehicleAsset: () => host.asset,
}));
// Real homepage camera, DPR, preparation and installed R3F/admission execute.
// Provider helper draws are separately covered by the existing adapter suite;
// no offscreen GPU capture or real WebGL context runs in this CPU regression.
vi.mock("@react-three/drei/core/Environment", () => ({
  Environment: () => null,
}));
vi.mock("@react-three/drei/core/Lightformer", () => ({
  Lightformer: () => null,
}));
vi.mock("@react-three/drei/core/ContactShadows", () => ({
  ContactShadows: () => null,
}));
let rafs: Map<number, FrameRequestCallback>;
let nextRaf: number;
let rectWidth: number, rectHeight: number;
let resize: Set<() => void>;
let retire: (() => Promise<void>) | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  rafs = new Map();
  nextRaf = 0;
  resize = new Set();
  rectWidth = 400;
  rectHeight = 300;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafs.set(++nextRaf, cb);
    return nextRaf;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => rafs.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        resize.add(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("innerWidth", 400);
  vi.stubGlobal("innerHeight", 300);
  vi.stubGlobal("devicePixelRatio", 2);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: rectWidth,
      bottom: rectHeight,
      width: rectWidth,
      height: rectHeight,
      toJSON() {},
    }),
  );
});
afterEach(async () => {
  cleanup();
  await retire?.();
  retire = undefined;
  host.asset = null;
  host.renderer = null;
  host.state = null;
  await frame();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function frame() {
  await act(async () => {
    const callbacks = [...rafs.values()];
    rafs.clear();
    callbacks.forEach((cb) => cb(performance.now()));
  });
}
async function fixture({ compiling = false, strict = false } = {}) {
  const syncs: { status: number; deleted: boolean }[] = [];
  let shadersReady = !compiling;
  let lost = false;
  const shaderDeletes = new Set<object>();
  const program = {
    program: {} as object | undefined,
    vertexShader: {},
    fragmentShader: {},
    destroy: vi.fn(() => {
      program.program = undefined;
    }),
  };
  const context = {
    SYNC_GPU_COMMANDS_COMPLETE: 1,
    ALREADY_SIGNALED: 2,
    TIMEOUT_EXPIRED: 3,
    CONDITION_SATISFIED: 4,
    WAIT_FAILED: 5,
    LINK_STATUS: 6,
    DELETE_STATUS: 7,
    DRAW_FRAMEBUFFER_BINDING: 8,
    isContextLost: () => lost,
    getExtension: (name: string) =>
      name === "KHR_parallel_shader_compile"
        ? { COMPLETION_STATUS_KHR: 9 }
        : null,
    getProgramParameter: vi.fn((_handle: object, parameter: number) =>
      parameter === 9 ? shadersReady : true,
    ),
    getParameter: () => null,
    isShader: () => true,
    getShaderParameter: (shader: object) => shaderDeletes.has(shader),
    deleteShader: (shader: object) => {
      shaderDeletes.add(shader);
    },
    fenceSync: vi.fn(() => {
      const sync = { status: 3, deleted: false };
      syncs.push(sync);
      return sync;
    }),
    flush: vi.fn(),
    deleteSync: vi.fn((sync: { deleted: boolean }) => {
      expect(sync.deleted).toBe(false);
      sync.deleted = true;
    }),
    clientWaitSync: vi.fn((sync: { status: number }) => sync.status),
  };
  let width = 400,
    height = 300,
    dpr = 2;
  const draws: {
    progress: string | undefined;
    dpr: number;
    position: number[];
    exposure: number;
  }[] = [];
  const bufferCommits: { width: number; height: number; dpr: number }[] = [];
  const nativeDispose = vi.fn();
  const nativeCompile = vi.fn(() => new Set());
  const renderer = {
    isWebGLRenderer: true,
    domElement: document.createElement("canvas"),
    getContext: () => context,
    setClearAlpha() {},
    info: { programs: [program], render: { frame: 0 } },
    shadowMap: { enabled: false },
    xr: {
      enabled: false,
      isPresenting: false,
      addEventListener() {},
      removeEventListener() {},
    },
    render(_scene: unknown, camera: import("three").Camera) {
      renderer.info.render.frame++;
      draws.push({
        progress: renderer.domElement.dataset.rearProgress,
        dpr,
        position: camera.position.toArray(),
        exposure: renderer.toneMappingExposure,
      });
    },
    getRenderTarget: () => null,
    compile: nativeCompile,
    setPixelRatio(value: number) {
      dpr = value;
    },
    setSize(w: number, h: number) {
      width = w;
      height = h;
    },
    getPixelRatio: () => dpr,
    getSize: (target: Vector2) => target.set(width, height),
    setDrawingBufferSize(w: number, h: number, ratio: number) {
      width = w;
      height = h;
      dpr = ratio;
      bufferCommits.push({ width, height, dpr });
    },
    renderLists: { dispose() {} },
    dispose: nativeDispose,
    forceContextLoss: vi.fn(),
    toneMappingExposure: 1,
  };
  host.renderer = renderer as unknown as WebGLRenderer;
  host.asset = prepareVehicle(
    new Mesh(new BoxGeometry(), new MeshStandardMaterial()),
    { paint: [], headlights: [], taillights: [] },
  );
  const onReady = vi.fn(),
    onError = vi.fn(),
    onProgress = vi.fn();
  const show = (progress = 0, active = true) => {
    const content = (
      <RearVehicleScene
        progress={progress}
        active={active}
        reducedMotion={false}
        onReady={onReady}
        onError={onError}
        onProgress={onProgress}
      />
    );
    return strict ? <StrictMode>{content}</StrictMode> : content;
  };
  const result = render(show());
  const complete = () =>
    syncs.forEach((sync) => {
      sync.status = 2;
    });
  retire = async () => {
    complete();
    await act(async () => vi.advanceTimersByTimeAsync(32));
  };
  await act(async () => {
    resize.forEach((cb) => cb());
    await vi.advanceTimersByTimeAsync(50);
  });
  const update = async (progress: number, active = true) =>
    act(async () => result.rerender(show(progress, active)));
  const advance = (ms: number) =>
    act(async () => vi.advanceTimersByTimeAsync(ms));
  const admit = async () => {
    complete();
    await advance(16);
    await frame();
  };
  return {
    renderer,
    nativeDispose,
    nativeCompile,
    context,
    syncs,
    draws,
    bufferCommits,
    onReady,
    onError,
    update,
    advance,
    admit,
    complete,
    resize: async (width: number, height: number) => {
      rectWidth = width;
      rectHeight = height;
      await act(async () => {
        resize.forEach((cb) => cb());
        await vi.advanceTimersByTimeAsync(50);
      });
    },
    shadersReady: () => {
      shadersReady = true;
    },
    unmount: () => act(async () => result.unmount()),
    lose: () => {
      lost = true;
      renderer.domElement.dispatchEvent(
        new Event("webglcontextlost", { cancelable: true }),
      );
    },
  };
}

it("coalesces rapid rear scroll demand and eventually draws the latest authored pose", async () => {
  const f = await fixture();
  await f.admit();
  expect(f.draws).toHaveLength(1);
  const first = f.draws[0];
  for (const progress of [1, 0.8, 0.5, 0.2, 0]) {
    await f.update(progress);
    await frame();
  }
  expect(f.draws).toHaveLength(1);
  expect(host.state!.get().internal.frames).toBe(1);
  await f.admit();
  expect(f.draws).toHaveLength(2);
  expect(f.draws.at(-1)?.progress).toBe("0.0000");
  expect(f.draws.at(-1)?.position).toEqual(first.position);
  expect(f.draws.every((draw) => draw.exposure === 1.05)).toBe(true);
  expect(f.onError).not.toHaveBeenCalled();
});

it("keeps actual rear compile/readiness pending until shader completion and an admitted completed frame", async () => {
  const f = await fixture({ compiling: true });
  expect(f.nativeCompile).toHaveBeenCalled();
  expect(f.context.fenceSync).toHaveBeenCalled();
  await frame();
  expect(f.draws).toHaveLength(0);
  expect(f.onReady).not.toHaveBeenCalled();
  f.shadersReady();
  await f.advance(10);
  await frame();
  expect(f.draws).toHaveLength(0);
  await f.admit();
  expect(f.draws).toHaveLength(1);
  expect(f.onReady).not.toHaveBeenCalled();
  await frame();
  expect(f.onReady).not.toHaveBeenCalled();
  await f.admit();
  expect(f.onReady).toHaveBeenCalledTimes(1);
  expect(f.onError).not.toHaveBeenCalled();
});

it("defers authored moving/rest DPR until admission and resumes latest pose after never/demand visibility", async () => {
  const f = await fixture();
  await f.admit();
  await f.update(0.5);
  expect(f.renderer.getPixelRatio()).toBe(2);
  const commits = f.bufferCommits.length;
  await frame();
  expect(f.bufferCommits).toHaveLength(commits);
  await f.admit();
  expect(f.draws.at(-1)?.dpr).toBe(1.25);
  await f.advance(160);
  expect(f.renderer.getPixelRatio()).toBe(1.25);
  await f.update(0.7, false);
  expect(host.state!.get().frameloop).toBe("never");
  const count = f.draws.length;
  f.complete();
  await f.advance(32);
  await frame();
  expect(f.draws).toHaveLength(count);
  await f.update(0.7, true);
  await f.admit();
  expect(f.draws).toHaveLength(count + 1);
  expect(f.draws.at(-1)?.progress).toBe("0.7000");
  expect(f.draws.at(-1)?.dpr).toBe(2);
  expect(f.onError).not.toHaveBeenCalled();
});

it("holds actual buffer resizing behind the fence and commits only the latest measured dimensions", async () => {
  const f = await fixture();
  await f.admit();
  const commits = f.bufferCommits.length;
  await f.resize(800, 600);
  await f.resize(600, 400);
  await frame();
  expect(f.renderer.getSize(new Vector2()).toArray()).toEqual([400, 300]);
  expect(f.bufferCommits).toHaveLength(commits);
  expect(f.draws).toHaveLength(1);
  await f.admit();
  expect(f.renderer.getSize(new Vector2()).toArray()).toEqual([600, 400]);
  expect(f.bufferCommits).toHaveLength(commits + 1);
  expect(f.bufferCommits.at(-1)).toEqual({ width: 600, height: 400, dpr: 2 });
  expect(f.draws).toHaveLength(2);
  expect(f.onError).not.toHaveBeenCalled();
});

it("cancels pending admission/compile lifetimes before asynchronous disposal under StrictMode", async () => {
  const f = await fixture({ compiling: true, strict: true });
  expect(f.context.fenceSync).toHaveBeenCalled();
  expect(f.draws).toHaveLength(0);
  expect(f.nativeDispose).not.toHaveBeenCalled();
  await f.update(0.9, false);
  expect(host.state!.get().frameloop).toBe("never");
  await frame();
  expect(f.draws).toHaveLength(0);
  await f.unmount();
  const queries = f.context.getProgramParameter.mock.calls.length;
  expect(f.renderer.forceContextLoss).not.toHaveBeenCalled();
  const admissionFences = f.syncs.slice(0, -1);
  expect(admissionFences.length).toBeGreaterThan(0);
  expect(admissionFences.every((sync) => sync.deleted)).toBe(true);
  f.complete();
  await f.advance(32);
  await frame();
  expect(f.renderer.forceContextLoss).toHaveBeenCalledTimes(1);
  expect(f.syncs.every((sync) => sync.deleted)).toBe(true);
  expect(f.context.getProgramParameter).toHaveBeenCalledTimes(queries);
  expect(f.onReady).not.toHaveBeenCalled();
  expect(f.onError).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

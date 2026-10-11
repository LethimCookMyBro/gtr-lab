// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { CameraRig } from "../src/components/three/CameraRig";
import { cabinCameraView } from "../src/components/three/cabinPreview";
import orientationFixture from "./fixtures/mobile-seat-terminal-orientation.json";
import { createCabinOracle } from "./fixtures/mobile-seat-oracle.mjs";
import { createRequire } from "node:module";
import { OrbitControls } from "three-stdlib";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createRoot, useFrame, _roots } from "@react-three/fiber";
import type { RootState } from "@react-three/fiber";
import { PerspectiveCamera, type WebGLRenderer } from "three";
import { installDemandRenderBackpressure } from "../src/components/three/demandFrameAdmission";

import { DemandRenderBackpressure } from "../src/components/three/DemandRenderBackpressure";

const THREE: typeof import("three") = createRequire(import.meta.url)("three");
let rafs: Map<number, FrameRequestCallback>;
let nextRaf: number;
const roots: ReturnType<typeof createRoot>[] = [];
const releases: (() => void)[] = [];
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
  releases.splice(0).forEach((release) => release());
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  await frame();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function fixture(
  options: {
    component?: boolean;
    size?: { width: number; height: number };
    paced?: boolean;
    step?: (state: RootState, delta: number) => void;
  } = {},
) {
  let lost = false;
  const syncs: { status: number }[] = [];
  const order: string[] = [];
  const context = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    ALREADY_SIGNALED: 0x911a,
    TIMEOUT_EXPIRED: 0x911b,
    CONDITION_SATISFIED: 0x911c,
    WAIT_FAILED: 0x911d,
    fenceSync: vi.fn(() => {
      const sync = { status: 0x911b };
      syncs.push(sync);
      order.push("fence");
      return sync;
    }),
    flush: vi.fn(),
    clientWaitSync: vi.fn(
      (sync: { status: number }, _flags: number, _timeout: number) =>
        sync.status,
    ),
    deleteSync: vi.fn(),
    isContextLost: () => lost,
  };
  const canvas = document.createElement("canvas");
  const draws: number[] = [];
  const deltas: number[] = [];
  const positions: number[][] = [];
  const poses: unknown[] = [];
  let latestInput = 0;
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
    render(_scene: unknown, camera: import("three").Camera) {
      positions.push(camera.position.toArray());
      poses.push({
        position: camera.position.toArray(),
        quaternion: camera.quaternion.toArray(),
        projection: camera.projectionMatrix.toArray(),
      });
      order.push("render");
      draws.push(latestInput);
    },
    setPixelRatio() {},
    setSize() {},
    getPixelRatio: () => 1,
    getSize: (target: import("three").Vector2) => target.set(100, 100),
    setDrawingBufferSize() {},
    renderLists: { dispose() {} },
    dispose() {},
    forceContextLoss() {},
  } as unknown as WebGLRenderer;
  const errors = vi.fn();
  const pending = vi.fn();
  const root = createRoot(canvas);
  roots.push(root);
  await root.configure({
    gl: () => renderer,
    frameloop: "demand",
    size: {
      ...(options.size ?? { width: 1920, height: 924 }),
      top: 0,
      left: 0,
    },
    camera: { near: 0.02, far: 700, fov: 34, position: [4.275, 1.8675, 5.1] },
    onCreated: (state) => {
      if (options.paced !== false && !options.component)
        releases.push(
          installDemandRenderBackpressure(state.get, errors, pending),
        );
    },
  });
  function Work({ children }: { children?: ReactNode }) {
    useFrame((state, delta) => {
      deltas.push(delta);
      order.push("tick");
      options.step?.(state, delta);
    });
    return (
      <>
        {options.component && (
          <DemandRenderBackpressure
            onError={errors}
            onPendingChange={pending}
          />
        )}
        {children}
      </>
    );
  }
  await act(async () =>
    root.render(
      <StrictMode>
        <Work />
      </StrictMode>,
    ),
  );
  const state = _roots.get(canvas)!.store.getState();
  return {
    root,
    state,
    renderer,
    context,
    errors,
    pending,
    order,
    draws,
    positions,
    poses,
    mount: async (child: ReactNode) =>
      act(async () =>
        root.render(
          <StrictMode>
            <Work>{child}</Work>
          </StrictMode>,
        ),
      ),
    deltas,
    syncs,
    input: (value: number) => {
      latestInput = value;
      state.invalidate();
    },
    complete: () =>
      syncs.forEach((sync) => {
        sync.status = context.ALREADY_SIGNALED;
      }),
    loseSilently: () => {
      lost = true;
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

const rig = (requestId: number, preset = "hero", reducedMotion = true) => (
  <CameraRig
    preset={preset}
    requestId={requestId}
    autoRotate={false}
    reducedMotion={reducedMotion}
    onManual={() => {}}
  />
);
async function drain(f: Awaited<ReturnType<typeof fixture>>) {
  for (let index = 0; index < 5; index++) {
    f.complete();
    await act(async () => vi.advanceTimersByTimeAsync(16));
    await frame();
  }
  expect(f.state.internal.frames).toBe(0);
}
it("a settled same-preset request consumes exactly its one required main draw", async () => {
  const f = await fixture();
  await f.mount(rig(0));
  await drain(f);
  const canonical = f.poses.at(-1);
  const count = f.draws.length;
  await f.mount(rig(1));
  f.complete();
  await frame();
  expect(f.poses.at(-1)).toEqual(canonical);
  expect(f.draws.length).toBe(count + 1);
  // Real CameraRig + installed Drei/native controls + R3F. No scheduler counter
  // is reset and no native controls callback is mocked.
  expect(f.state.internal.frames).toBe(0);
  await drain(f);
  expect(f.draws.length).toBe(count + 1);
});
it("unrelated requested follow-on work remains pending after the same-preset frame", async () => {
  let requestUnrelated = false;
  const f = await fixture({
    step: (state) => {
      if (requestUnrelated) {
        requestUnrelated = false;
        state.invalidate();
      }
    },
  });
  await f.mount(rig(0));
  await drain(f);
  const count = f.draws.length;
  await f.mount(rig(1));
  requestUnrelated = true;
  f.complete();
  await frame();
  expect(f.state.internal.frames).toBe(1);
  await frame();
  expect(f.draws.length).toBe(count + 1);
  await drain(f);
  expect(f.draws.length).toBe(count + 2);
});
it.each(["front", "rear", "side", "top"])(
  "preserves the exact settled %s pose through native final control updates",
  async (preset) => {
    const f = await fixture();
    await f.mount(rig(0));
    await drain(f);
    await f.mount(rig(1, preset));
    f.complete();
    await frame();
    await drain(f);
    expect(f.poses.at(-1)).toMatchSnapshot();
  },
);

it.each([
  [1920, 924],
  [1440, 744],
  [390, 602],
])(
  "preserves exact same-preset completion at %s by %s",
  async (width, height) => {
    const f = await fixture({ size: { width, height } });
    await f.mount(rig(0));
    await drain(f);
    await f.mount(rig(1));
    await drain(f);
    expect(f.poses.at(-1)).toMatchSnapshot();
  },
);
it.each(["front", "top"])(
  "preserves a sparse normal-motion %s completion",
  async (preset) => {
    const f = await fixture();
    await f.mount(rig(0));
    await drain(f);
    await f.mount(rig(1, preset, false));
    f.complete();
    await act(async () => vi.advanceTimersByTimeAsync(3500));
    await frame();
    await drain(f);
    expect(f.poses.at(-1)).toMatchSnapshot();
  },
);
it("preserves exact cabin entry, sparse seat retarget and exterior restoration", async () => {
  const f = await fixture();
  const view = (seat: "driver" | "passenger") =>
    cabinCameraView(seat, { scale: 1.12, position: [0, -0.04, 0] });
  const cabin = (seat: "driver" | "passenger") => (
    <CameraRig
      preset="hero"
      requestId={0}
      cabinView={view(seat)}
      autoRotate={false}
      reducedMotion={false}
      onManual={() => {}}
    />
  );
  await f.mount(rig(0));
  await drain(f);
  await f.mount(cabin("driver"));
  await drain(f);
  expect(f.poses.at(-1)).toMatchSnapshot("driver");
  await f.mount(cabin("passenger"));
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(3500));
  await frame();
  await drain(f);
  // This expectation is derived from the committed view, not the old residual
  // quaternion. The independent mathematical oracle below remains unchanged.
  const passenger = view("passenger");
  const reference = new THREE.PerspectiveCamera(
    passenger.fov,
    1920 / 924,
    passenger.near,
    passenger.far,
  );
  const referenceControls = new OrbitControls(reference);
  referenceControls.enableDamping = false;
  referenceControls.minDistance = passenger.minDistance;
  referenceControls.maxDistance = passenger.maxDistance;
  referenceControls.minPolarAngle = 0.005;
  referenceControls.maxPolarAngle = Math.PI / 2 - 0.025;
  reference.position.fromArray(passenger.position);
  referenceControls.target.fromArray(passenger.target);
  referenceControls.update();
  reference.position.fromArray(passenger.position);
  expect(f.poses.at(-1)).toEqual({
    position: reference.position.toArray(),
    quaternion: reference.quaternion.toArray(),
    projection: reference.projectionMatrix.toArray(),
  });
  referenceControls.dispose();
  expect(f.poses.at(-1)).toMatchSnapshot("passenger");
  await f.mount(rig(0));
  await drain(f);
  expect(f.poses.at(-1)).toMatchSnapshot("restored-exterior");
});

it.each(
  ["driver", "passenger", "rear"].flatMap((seat) =>
    [false, true].map((reducedMotion) => ({
      seat: seat as "driver" | "passenger" | "rear",
      reducedMotion,
    })),
  ),
)(
  "settles the recorded mobile retarget to $seat exactly on its first final main, reduced motion $reducedMotion",
  async ({ seat, reducedMotion }) => {
    const f = await fixture({ size: { width: 390, height: 372 } });
    const transform = {
      scale: orientationFixture.transform.scale,
      position: orientationFixture.transform.position as [
        number,
        number,
        number,
      ],
    };
    const views = {
      passenger: cabinCameraView("passenger", transform),
      driver: cabinCameraView("driver", transform),
      rear: cabinCameraView("rear", transform),
    };
    const cabin = (selected: "passenger" | "driver" | "rear", request = 0) => (
      <CameraRig
        preset="hero"
        requestId={request}
        cabinView={views[selected]}
        autoRotate={false}
        reducedMotion={reducedMotion}
        onManual={() => {}}
      />
    );
    await f.mount(rig(0));
    await drain(f);
    await f.mount(cabin(seat === "passenger" ? "rear" : "passenger"));
    await drain(f);
    // Replay the last admitted passenger pose. Real layout effects derive the
    // retarget's initial orbit target from this actual look, just as production.
    const prior = orientationFixture.frames[0].snapshot.pose;
    f.state.camera.position.fromArray(prior.position);
    f.state.camera.quaternion.fromArray(prior.quaternion);
    await f.mount(cabin(seat));
    f.complete();
    const elapsed =
      orientationFixture.frames[1].at - orientationFixture.driverCommit.at;
    await act(async () => vi.advanceTimersByTimeAsync(elapsed));
    await frame();
    const oracle = createCabinOracle(transform);
    oracle.reset(seat);
    const actual = f.poses.at(-1) as {
      position: number[];
      quaternion: number[];
      projection: number[];
    };
    const want = oracle.expected(390, 372)!.pose;
    // Match CameraRig's committed destination arithmetic exactly; its existing
    // Vector3 subtract/add normalization can differ from raw GLB math by an ULP.
    const target = new THREE.Vector3(...views[seat].target);
    const committedEye = new THREE.Vector3(...views[seat].position)
      .sub(target)
      .multiplyScalar(1)
      .add(target);
    expect(actual.position).toEqual(committedEye.toArray());
    const error = Math.min(
      ...[1, -1].map((sign) =>
        Math.max(
          ...actual.quaternion.map((value, index) =>
            Math.abs(value - sign * want.quaternion[index]),
          ),
        ),
      ),
    );
    expect(error).toBeLessThan(1e-12);
    expect(oracle.compare({ pose: actual }, 390, 372)).toBe(true);
    await drain(f);
    expect(f.poses.at(-1)).toEqual(actual);
  },
);

it.each([false, true])(
  "an exact driver entry consumes one admitted target draw without a replay, reduced=%s",
  async (reducedMotion) => {
    const f = await fixture();
    await f.mount(rig(0));
    await drain(f);
    const count = f.draws.length;
    await f.mount(
      <CameraRig
        preset="hero"
        requestId={0}
        cabinView={cabinCameraView("driver", { scale: 1, position: [0, 0, 0] })}
        autoRotate={false}
        reducedMotion={reducedMotion}
        onManual={() => {}}
      />,
    );
    f.complete();
    await frame();
    expect(f.draws.length).toBe(count + 1);
    const presented = f.poses.at(-1);
    expect(f.state.internal.frames).toBe(0);
    await drain(f);
    expect(f.draws.length).toBe(count + 1);
    expect(f.poses.at(-1)).toEqual(presented);
  },
);
it("unmasking settled exterior controls and motion policy creates no render demand", async () => {
  const f = await fixture();
  const outside = (interactive: boolean, reducedMotion: boolean) => (
    <CameraRig
      preset="hero"
      requestId={0}
      interactive={interactive}
      autoRotate={false}
      reducedMotion={reducedMotion}
      onManual={() => {}}
    />
  );
  await f.mount(outside(false, true));
  await drain(f);
  const count = f.draws.length;
  await f.mount(outside(true, false));
  expect(f.state.internal.frames).toBe(0);
  await drain(f);
  expect(f.draws.length).toBe(count);
});
it("keeps independently requested work while the same entry frame updates its controls", async () => {
  let next = false;
  const f = await fixture({
    step: (state) => {
      if (next) {
        next = false;
        state.invalidate();
      }
    },
  });
  await f.mount(rig(0));
  await drain(f);
  const count = f.draws.length;
  await f.mount(
    <CameraRig
      preset="hero"
      cabinView={cabinCameraView("driver", { scale: 1, position: [0, 0, 0] })}
      autoRotate={false}
      reducedMotion
      onManual={() => {}}
    />,
  );
  next = true;
  f.complete();
  await frame();
  expect(f.state.internal.frames).toBe(1);
  await drain(f);
  expect(f.draws.length).toBe(count + 2);
});

it("completes the masked exterior return once and then unmasks without replay", async () => {
  const f = await fixture();
  const view = cabinCameraView("driver", { scale: 1, position: [0, 0, 0] });
  const target = (
    inside: boolean,
    interactive = false,
    reducedMotion = true,
  ) => (
    <CameraRig
      preset="hero"
      requestId={0}
      cabinView={inside ? view : undefined}
      interactive={interactive}
      autoRotate={false}
      reducedMotion={reducedMotion}
      onManual={() => {}}
    />
  );
  await f.mount(target(false));
  await drain(f);
  const outside = f.poses.at(-1);
  await f.mount(target(true));
  await drain(f);
  const count = f.draws.length;
  await f.mount(target(false));
  f.complete();
  await frame();
  expect(f.state.internal.frames).toBe(0);
  expect(f.poses.at(-1)).toEqual(outside);
  await drain(f);
  expect(f.draws.length).toBe(count + 1);
  await f.mount(target(false, true, false));
  expect(f.state.internal.frames).toBe(0);
  await drain(f);
  expect(f.draws.length).toBe(count + 1);
});

it("reconnects native input under StrictMode and restores only its own default controls", async () => {
  const f = await fixture();
  // Native controls import ESM Three; the installed R3F fixture uses CJS Three.
  // Use the native module's real class for instanceof-based wheel handling.
  const camera = new PerspectiveCamera(34, 1920 / 924, 0.02, 700);
  camera.position.set(4.275, 1.8675, 5.1);
  await act(async () => f.state.set({ camera }));
  const prior = new OrbitControls(camera);
  await act(async () => f.state.set({ controls: prior }));
  await f.mount(rig(0));
  await drain(f);
  const owned = f.state.get().controls as OrbitControls;
  expect(owned).not.toBe(prior);
  const before = camera.position.clone();
  f.renderer.domElement.dispatchEvent(
    new WheelEvent("wheel", { deltaY: -100, cancelable: true }),
  );
  expect(camera.position.distanceTo(before)).toBeGreaterThan(0);
  expect(f.state.internal.frames).toBeGreaterThan(0);
  await drain(f);
  await f.mount(null);
  expect(f.state.get().controls).toBe(prior);
  await drain(f);
  const retiredPose = camera.position.clone();
  f.renderer.domElement.dispatchEvent(
    new WheelEvent("wheel", { deltaY: -100, cancelable: true }),
  );
  expect(camera.position).toEqual(retiredPose);
  expect(f.state.internal.frames).toBe(0);
  await f.mount(rig(0));
  await drain(f);
  const replacement = new OrbitControls(camera);
  await act(async () => f.state.set({ controls: replacement }));
  await f.mount(null);
  expect(f.state.get().controls).toBe(replacement);
  prior.dispose();
  replacement.dispose();
});
it("replaces a native camera owner without reusing options or old element listeners", async () => {
  const f = await fixture();
  await f.mount(rig(0));
  await drain(f);
  const first = f.state.get().controls as OrbitControls;
  const dispose = vi.spyOn(first, "dispose");
  const camera = new PerspectiveCamera(34, 1920 / 924, 0.02, 700);
  camera.position.set(4.275, 1.8675, 5.1);
  await act(async () => f.state.set({ camera }));
  await drain(f);
  const next = f.state.get().controls as OrbitControls;
  expect(next).not.toBe(first);
  expect(next.object).toBe(camera);
  expect(next.enablePan).toBe(false);
  expect(next.dampingFactor).toBe(0.09);
  expect(dispose).toHaveBeenCalledTimes(1);
  const oldPose = first.object.position.clone();
  const pose = camera.position.clone();
  f.renderer.domElement.dispatchEvent(
    new WheelEvent("wheel", { deltaY: -100, cancelable: true }),
  );
  expect(camera.position.distanceTo(pose)).toBeGreaterThan(0);
  expect(first.object.position).toEqual(oldPose);
  dispose.mockRestore();
});
it("does not restore exterior limits on an unrelated rerender during a cabin exit", async () => {
  const f = await fixture();
  const view = cabinCameraView("driver", { scale: 1, position: [0, 0, 0] });
  await f.mount(
    <CameraRig
      preset="hero"
      cabinView={view}
      autoRotate={false}
      reducedMotion={false}
      onManual={() => {}}
    />,
  );
  await drain(f);
  const outside = () => (
    <CameraRig
      preset="hero"
      autoRotate={false}
      reducedMotion={false}
      onManual={() => {}}
    />
  );
  await f.mount(outside());
  const controls = f.state.get().controls as OrbitControls;
  expect(controls.minPolarAngle).toBe(0);
  expect(controls.maxPolarAngle).toBe(Math.PI);
  await f.mount(outside());
  expect(controls.minPolarAngle).toBe(0);
  expect(controls.maxPolarAngle).toBe(Math.PI);
});

function pointer(type: string, id: number, x = 10, y = 10) {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
  });
  Object.defineProperties(event, {
    pointerId: { value: id },
    pointerType: { value: "mouse" },
  });
  return event;
}
it("retires a held native gesture on camera replacement and accepts fresh pointer/keyboard input", async () => {
  const f = await fixture();
  Object.defineProperty(f.renderer.domElement, "clientHeight", { value: 924 });
  f.renderer.domElement.releasePointerCapture = vi.fn();
  await f.mount(rig(0));
  await drain(f);
  const first = f.state.get().controls as OrbitControls;
  f.renderer.domElement.dispatchEvent(pointer("pointerdown", 1));
  const camera = new PerspectiveCamera(34, 1920 / 924, 0.02, 700);
  camera.position.set(4.275, 1.8675, 5.1);
  await act(async () => f.state.set({ camera }));
  await drain(f);
  const next = f.state.get().controls as OrbitControls;
  const retired = first.object.position.clone();
  const stable = camera.position.clone();
  document.dispatchEvent(pointer("pointermove", 1, 90, 90));
  expect(camera.position).toEqual(stable);
  expect(first.object.position).toEqual(retired);
  f.renderer.domElement.dispatchEvent(pointer("pointerdown", 2));
  document.dispatchEvent(pointer("pointermove", 2, 100, 80));
  expect(camera.position.distanceTo(stable)).toBeGreaterThan(0);
  document.dispatchEvent(pointer("pointerup", 2));
  await drain(f);
  const beforeKey = camera.position.clone();
  f.renderer.domElement.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }),
  );
  expect(camera.position.distanceTo(beforeKey)).toBeGreaterThan(0);
  expect(next.object).toBe(camera);
  expect(first.object.position).toEqual(retired);
});
it("stops rotating on reduced-motion policy while retaining an independently pending draw", async () => {
  const f = await fixture();
  const target = (reducedMotion: boolean) => (
    <CameraRig
      preset="hero"
      autoRotate
      reducedMotion={reducedMotion}
      onManual={() => {}}
    />
  );
  await f.mount(target(false));
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(3500));
  await frame();
  const controls = f.state.get().controls as OrbitControls;
  expect(controls.autoRotate).toBe(true);
  const position = f.state.camera.position.clone();
  const count = f.draws.length;
  f.input(77);
  await f.mount(target(true));
  expect(f.state.internal.frames).toBeGreaterThan(0);
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(16));
  await frame();
  expect(controls.autoRotate).toBe(false);
  // Native damping drains its pre-existing residual once when disabled.
  // Preserve that necessary movement and its existing follow-on demand.
  expect(f.state.camera.position.distanceTo(position)).toBeGreaterThan(0);
  expect(f.draws.at(-1)).toBe(77);
  await drain(f);
  expect(f.draws.length).toBeGreaterThanOrEqual(count + 1);
  const settled = f.state.camera.position.clone();
  const completed = f.draws.length;
  await drain(f);
  expect(f.draws.length).toBe(completed);
  expect(f.state.camera.position).toEqual(settled);
  expect({
    pose: f.poses.at(-1),
    finalDraws: f.draws.length - count,
  }).toMatchSnapshot("native-reduced-motion-drain");
});
it("keeps the legacy non-cabin interior terminal orientation update", async () => {
  const f = await fixture();
  await f.mount(rig(0));
  await drain(f);
  await f.mount(rig(1, "interior", false));
  for (let index = 0; index < 30; index++) {
    f.complete();
    await act(async () => vi.advanceTimersByTimeAsync(100));
    await frame();
  }
  await drain(f);
  const controls = f.state.get().controls as OrbitControls;
  const reference = new THREE.PerspectiveCamera();
  reference.position.copy(f.state.camera.position);
  reference.lookAt(controls.target);
  expect(
    Math.max(
      ...f.state.camera.quaternion
        .toArray()
        .map((value, index) =>
          Math.abs(value - reference.quaternion.toArray()[index]),
        ),
    ),
  ).toBeLessThan(1e-14);
});

it("replaces the canvas-owned viewer during a held gesture without old pointer or keyboard listeners", async () => {
  const first = await fixture();
  Object.defineProperty(first.renderer.domElement, "clientHeight", {
    value: 924,
  });
  first.renderer.domElement.releasePointerCapture = vi.fn();
  await first.mount(rig(0));
  await drain(first);
  const retiredControls = first.state.get().controls as OrbitControls;
  first.renderer.domElement.dispatchEvent(pointer("pointerdown", 1));
  await first.mount(null);
  await drain(first);
  const retiredPose = first.state.camera.position.clone();
  const next = await fixture();
  Object.defineProperty(next.renderer.domElement, "clientHeight", {
    value: 924,
  });
  next.renderer.domElement.releasePointerCapture = vi.fn();
  await next.mount(rig(0));
  await drain(next);
  expect(next.state.get().controls).not.toBe(retiredControls);
  const initial = next.state.camera.position.clone();
  document.dispatchEvent(pointer("pointermove", 1, 100, 80));
  first.renderer.domElement.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight" }),
  );
  expect(first.state.camera.position).toEqual(retiredPose);
  expect(next.state.camera.position).toEqual(initial);
  next.renderer.domElement.dispatchEvent(pointer("pointerdown", 2));
  document.dispatchEvent(pointer("pointermove", 2, 100, 80));
  expect(next.state.camera.position.distanceTo(initial)).toBeGreaterThan(0);
  document.dispatchEvent(pointer("pointerup", 2));
  await drain(next);
  const beforeKey = next.state.camera.position.clone();
  next.renderer.domElement.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight" }),
  );
  expect(next.state.camera.position.distanceTo(beforeKey)).toBeGreaterThan(0);
  expect(first.state.camera.position).toEqual(retiredPose);
});

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
import type { WebGLRenderer } from "three";
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

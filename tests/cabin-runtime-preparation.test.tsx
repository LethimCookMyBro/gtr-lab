// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import {
  Group,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
} from "three";
import type { PreparedVehicle } from "../src/components/three/materialAdapter";
import type { VehicleSceneProps } from "../src/components/three/types";
const host = vi.hoisted(() => ({
  state: {} as any,
  jobs: [] as any[],
  mains: [] as any[],
  proxyVisible: true,
  brokenWindows: false,
  stepBuilds: 0,
  lastRig: null as any,
}));
vi.mock("@react-three/fiber", () => ({
  useThree: (select: any) => select(host.state),
}));
vi.mock("../src/components/three/cabinPreparationSteps", () => ({
  createCabinPreparationSteps: () => {
    host.stepBuilds++;
    return [{ run() {} }, { run() {} }];
  },
}));
vi.mock("../src/components/three/rendererPreparation", () => ({
  enqueueRendererPreparation: (_gl: unknown, request: any) =>
    new Promise<void>((resolve, reject) => {
      host.jobs.push({ ...request, resolve, reject });
      request.signal.addEventListener(
        "abort",
        () => reject(new DOMException("cancelled", "AbortError")),
        { once: true },
      );
    }),
  awaitCompletedMain: (_gl: unknown, request: any) =>
    new Promise((resolve, reject) => {
      host.mains.push({ ...request, resolve, reject });
      request.signal.addEventListener(
        "abort",
        () => reject(new DOMException("cancelled", "AbortError")),
        { once: true },
      );
    }),
}));
vi.mock("../src/components/three/CameraRig", async () => {
  const { useLayoutEffect, useRef } = await import("react");
  return {
    CameraRig: (props: any) => {
      const saved = useRef<PerspectiveCamera | null>(null),
        previous = useRef(false);
      host.lastRig = props;
      useLayoutEffect(() => {
        const camera = host.state.camera as PerspectiveCamera;
        if (props.cabinView) {
          if (!previous.current) saved.current = camera.clone();
          camera.position.fromArray(props.cabinView.position);
          camera.lookAt(new Vector3(...props.cabinView.target));
          camera.fov = props.cabinView.fov;
          camera.near = props.cabinView.near;
          camera.far = props.cabinView.far;
        } else if (previous.current && saved.current) {
          const aspect = camera.aspect;
          camera.copy(saved.current);
          camera.aspect = aspect;
        }
        camera.updateProjectionMatrix();
        previous.current = !!props.cabinView;
        if (props.appliedState)
          props.appliedState.current = { key: props.appliedKey, settled: true };
      }, [props.cabinView, props.appliedKey]);
      return null;
    },
  };
});
vi.mock("../src/components/three/CabinAttachment", async () => {
  const { useLayoutEffect } = await import("react");
  return {
    CabinAttachment: (props: any) => {
      const selected = host.brokenWindows
        ? null
        : props.active && props.prepared
          ? props.asset
          : host.proxyVisible
            ? props.proxy
            : null;
      useLayoutEffect(() => {
        if (host.brokenWindows)
          props.onOwnerError?.("The cabin window roles could not be verified.");
      }, [props.onOwnerError]);
      useLayoutEffect(() => {
        if (!selected) return;
        host.state.scene.add(selected.scene);
        return () => host.state.scene.remove(selected.scene);
      }, [selected]);
      return null;
    },
  };
});
import { CabinRuntime } from "../src/components/three/CabinRuntime";
const asset = (): PreparedVehicle => {
  const scene = new Group();
  scene.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  return {
    scene,
    scale: 1,
    position: [0, 0, 0],
    bindings: [],
    dispose: vi.fn(),
  };
};
beforeEach(() => {
  host.jobs = [];
  host.mains = [];
  host.proxyVisible = true;
  host.brokenWindows = false;
  host.stepBuilds = 0;
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 100);
  camera.position.set(0, 2, 6);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  host.state = {
    gl: { domElement: canvas, getPixelRatio: () => 1 },
    scene: new Scene(),
    camera,
    size: { width: 800, height: 600 },
    viewport: { dpr: 1 },
    invalidate: vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function fixture({
  strict = false,
  initialReady = false,
  missingAsset = false,
  loadFailure = undefined as string | undefined,
} = {}) {
  const full = asset(),
    exterior = asset(),
    proxy = asset();
  host.state.scene.add(exterior.scene);
  let props = {
    url: "/car.glb",
    paint: "#eee",
    environment: "studio",
    environmentRequest: 0,
    preset: "hero",
    autoRotate: false,
    lights: false,
    reducedMotion: false,
    materialRoles: { paint: [], headlights: [], taillights: [] },
    onReady() {},
    onProgress() {},
    onManual() {},
    onError: vi.fn(),
    cabin: { phase: "closed" },
    cabinPreparation: initialReady
      ? { phase: "ready", request: 1 }
      : { phase: "loading", request: 1, progress: { phase: "preparing" } },
    cabinPreparationAllowed: true,
    onCabinReady: vi.fn(),
    onCabinError: vi.fn(),
  } as VehicleSceneProps;
  let request = 1,
    key = 1;
  const view = () => {
    const child = (
      <CabinRuntime
        key={key}
        asset={missingAsset ? null : full}
        loadFailure={loadFailure}
        exterior={exterior}
        proxy={proxy}
        proxyFailed={false}
        onProxyError={() => {}}
        request={request}
        props={props}
      />
    );
    return strict ? <StrictMode>{child}</StrictMode> : child;
  };
  const rendered = render(view());
  return {
    full,
    exterior,
    proxy,
    get props() {
      return props;
    },
    rendered,
    update(
      next: Partial<VehicleSceneProps> = {},
      nextRequest = request,
      nextKey = key,
    ) {
      props = { ...props, ...next };
      request = nextRequest;
      key = nextKey;
      rendered.rerender(view());
    },
  };
}
async function resources() {
  await waitFor(() => expect(host.jobs.length).toBeGreaterThanOrEqual(1));
  await act(async () => host.jobs[0].resolve());
  await waitFor(() => expect(host.jobs.length).toBeGreaterThanOrEqual(2));
  await act(async () => host.jobs[1].resolve());
  await waitFor(() => expect(host.mains.length).toBeGreaterThanOrEqual(1));
}
async function complete(index: number) {
  expect(host.mains[index].stamp()).not.toBeNull();
  await act(async () =>
    host.mains[index].resolve({
      stamp: host.mains[index].stamp(),
      submittedAt: 1,
      completedAt: 2,
    }),
  );
}
async function ready(f: ReturnType<typeof fixture>) {
  await resources();
  expect(f.props.onCabinReady).not.toHaveBeenCalled();
  await complete(0);
  expect(f.props.onCabinReady).not.toHaveBeenCalled();
  await complete(1);
  expect(f.props.onCabinReady).toHaveBeenCalledTimes(1);
  f.update({ cabinPreparation: { phase: "ready", request: 1 } });
}
it("publishes ready only after actual driver and restored exterior certificates", async () => {
  const f = fixture();
  await resources();
  expect(f.full.scene.parent).toBe(host.state.scene);
  expect(host.lastRig.interactive).toBe(false);
  await complete(0);
  expect(f.full.scene.parent).toBeNull();
  expect(f.props.onCabinReady).not.toHaveBeenCalled();
  await complete(1);
  expect(f.props.onCabinReady).toHaveBeenCalledWith(1);
  expect(f.props.onCabinError).not.toHaveBeenCalled();
});
it("retains the prepared asset and makes exit/reentry and later environment changes skip preparation", async () => {
  const f = fixture();
  await ready(f);
  f.update({ environment: "gallery", environmentRequest: 1 });
  f.update({
    cabin: {
      phase: "active",
      request: 1,
      seat: "driver",
      resumeRotation: false,
    },
  });
  expect(f.full.scene.parent).toBe(host.state.scene);
  host.state.camera.rotateY(0.2);
  const look = host.state.camera.quaternion.clone();
  f.update({ environment: "night", environmentRequest: 2 });
  expect(f.full.scene.parent).toBe(host.state.scene);
  expect(host.state.camera.quaternion.equals(look)).toBe(true);
  f.update({ cabin: { phase: "closed" } });
  expect(f.full.scene.parent).toBeNull();
  f.update({
    cabin: {
      phase: "active",
      request: 1,
      seat: "driver",
      resumeRotation: false,
    },
  });
  expect(f.full.scene.parent).toBe(host.state.scene);
  expect(host.stepBuilds).toBe(1);
  expect(host.jobs).toHaveLength(2);
  expect(f.full.dispose).not.toHaveBeenCalled();
});
it("keeps the mask contract through driver-proof failure and completed exterior recovery", async () => {
  const f = fixture();
  await resources();
  await act(async () =>
    host.mains[0].reject(new Error("Driver presentation failed")),
  );
  expect(f.full.scene.parent).toBeNull();
  expect(f.props.onCabinError).not.toHaveBeenCalled();
  await complete(1);
  expect(f.props.onCabinError).toHaveBeenCalledWith(
    1,
    "Driver presentation failed",
  );
  expect(f.props.onCabinReady).not.toHaveBeenCalled();
});
it("restores exterior after a resource error before showing its scoped failure", async () => {
  const f = fixture();
  host.state.camera.position.set(1, 3, 5);
  host.state.camera.lookAt(0, 0, 0);
  await act(async () => host.jobs[0].reject(new Error("Shader link failed")));
  expect(f.props.onCabinError).not.toHaveBeenCalled();
  await complete(0);
  expect(f.props.onCabinError).toHaveBeenCalledWith(1, "Shader link failed");
});
it("keeps shader preparation settled when retry begins with exterior rotation enabled", async () => {
  const f = fixture();
  f.update({ autoRotate: true });
  expect(host.lastRig.autoRotate).toBe(false);
  expect(host.lastRig.interactive).toBe(false);
  await ready(f);
  expect(host.lastRig.autoRotate).toBe(true);
});
it("rejects a stale projection and uses the latest exterior pose after resize during preparation", async () => {
  const f = fixture();
  host.state.size = { width: 600, height: 800 };
  host.state.gl.domElement.width = 600;
  host.state.gl.domElement.height = 800;
  host.state.camera.aspect = 0.75;
  host.state.camera.position.set(2, 2, 7);
  host.state.camera.lookAt(0, 0, 0);
  host.state.camera.updateProjectionMatrix();
  const outside = host.state.camera.position.clone();
  f.update();
  await resources();
  host.state.camera.projectionMatrix.elements[0] += 1;
  expect(host.mains[0].stamp()).toBeNull();
  host.state.camera.updateProjectionMatrix();
  await complete(0);
  expect(host.state.camera.position.equals(outside)).toBe(true);
  await complete(1);
  expect(f.props.onCabinReady).toHaveBeenCalledTimes(1);
});
it("includes a delayed proxy and actual glass material identity and requests fresh proof after supersession", async () => {
  host.proxyVisible = false;
  const f = fixture();
  await resources();
  await complete(0);
  const old = host.mains[1].stamp();
  host.proxyVisible = true;
  (f.exterior.scene.children[0] as Mesh).material = new MeshStandardMaterial();
  f.update();
  expect(host.mains[1].stamp()).not.toBe(old);
  await act(async () =>
    host.mains[1].reject(
      new Error("The main readiness stamp changed before native completion."),
    ),
  );
  expect(f.props.onCabinReady).not.toHaveBeenCalled();
  expect(f.props.onError).not.toHaveBeenCalled();
  await complete(2);
  expect(f.props.onCabinReady).toHaveBeenCalledTimes(1);
});
it("contains invalid window ownership as a scoped failure after real exterior recovery", async () => {
  host.brokenWindows = true;
  const f = fixture();
  await waitFor(() => expect(host.mains.length).toBe(1));
  expect(f.props.onCabinError).not.toHaveBeenCalled();
  expect(f.full.scene.parent).toBeNull();
  await complete(0);
  expect(f.props.onCabinError).toHaveBeenCalledWith(
    1,
    expect.stringMatching(/window roles/i),
  );
  expect(f.props.onCabinReady).not.toHaveBeenCalled();
});
it("aborts old work on navigation/context-owner replacement without a hidden late restart", async () => {
  const f = fixture(),
    oldReady = f.props.onCabinReady;
  const oldJob = host.jobs[0];
  f.rendered.unmount();
  expect(oldJob.signal.aborted).toBe(true);
  await act(async () => oldJob.resolve());
  expect(oldReady).not.toHaveBeenCalled();
  expect(host.jobs).toHaveLength(1);
  const next = fixture();
  await waitFor(() => expect(host.jobs).toHaveLength(2));
  expect(host.mains).toHaveLength(0);
  expect(next.props.onCabinReady).not.toHaveBeenCalled();
  expect(host.stepBuilds).toBe(2);
});

it("does not request a GPU frame solely for ready telemetry in reduced motion", async () => {
  const f = fixture();
  f.update({ reducedMotion: true });
  await resources();
  await complete(0);
  await complete(1);
  host.state.invalidate.mockClear();
  f.update({ cabinPreparation: { phase: "ready", request: 1 } });
  expect(host.state.invalidate).not.toHaveBeenCalled();
});

it("keeps readiness telemetry passive through StrictMode replay and entry/exit", () => {
  const f = fixture({ strict: true, initialReady: true });
  expect(host.state.invalidate).not.toHaveBeenCalled();
  f.update({
    cabin: {
      phase: "active",
      request: 1,
      seat: "driver",
      resumeRotation: false,
    },
  });
  f.update({ cabin: { phase: "closed" } });
  expect(host.state.invalidate).not.toHaveBeenCalled();
  expect(host.stepBuilds).toBe(0);
});

it.each(["HTTP 404", "Embedded texture decode failed"])(
  "keeps a fast loader error masked until exterior main completion: %s",
  async (message) => {
    const f = fixture({ missingAsset: true, loadFailure: message });
    await waitFor(() => expect(host.mains).toHaveLength(1));
    expect(host.jobs).toHaveLength(0);
    expect(host.lastRig.interactive).toBe(false);
    expect(f.props.onCabinError).not.toHaveBeenCalled();
    await complete(0);
    expect(f.props.onCabinError).toHaveBeenCalledWith(1, message);
    expect(f.props.onCabinReady).not.toHaveBeenCalled();
  },
);

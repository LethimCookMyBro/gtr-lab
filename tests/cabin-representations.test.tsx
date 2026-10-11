// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from "three";
import { CabinAttachment } from "../src/components/three/CabinAttachment";
import { CABIN_WINDOW_NAMES } from "../src/components/three/cabinPreview";
import {
  prepareVehicle,
  type PreparedVehicle,
} from "../src/components/three/materialAdapter";
const host = vi.hoisted(() => ({
  state: {} as any,
  pending: new Map<
    string,
    { resolve: () => void; reject: (e: Error) => void; signal: AbortSignal }
  >(),
  compile: vi.fn(),
  shadows: vi.fn(),
}));
vi.mock("@react-three/fiber", () => ({
  useThree: (select: (s: any) => any) => select(host.state),
}));
vi.mock("../src/components/three/staticShadowPolicy", () => ({
  invalidateSceneShadows: (...args: any[]) => host.shadows(...args),
}));
vi.mock("../src/components/home/compileRearScene", () => ({
  compileRearScene: (
    _gl: unknown,
    scene: Group,
    _camera: unknown,
    signal: AbortSignal,
  ) => {
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        expect(object.castShadow).toBe(false);
        expect(object.receiveShadow).toBe(false);
      }
    });
    host.compile(scene);
    return new Promise<void>((resolve, reject) =>
      host.pending.set(scene.uuid, { resolve, reject, signal }),
    );
  },
}));
// Render declarative Three elements as inspectable DOM only in this CPU test.
vi.mock("react/jsx-runtime", async (original) => {
  const runtime = await original<any>();
  const wrap = (factory: any) => (type: any, props: any, key: any) =>
    type === "primitive"
      ? factory("span", { "data-asset": props.object.uuid }, key)
      : type === "group"
        ? factory(
            "div",
            {
              "data-scale": props.scale,
              "data-position": JSON.stringify(props.position),
              children: props.children,
            },
            key,
          )
        : factory(type, props, key);
  return { ...runtime, jsx: wrap(runtime.jsx), jsxs: wrap(runtime.jsxs) };
});
vi.mock("react/jsx-dev-runtime", async (original) => {
  const runtime = await original<any>();
  return {
    ...runtime,
    jsxDEV: (type: any, props: any, ...rest: any[]) =>
      type === "primitive"
        ? runtime.jsxDEV("span", { "data-asset": props.object.uuid }, ...rest)
        : type === "group"
          ? runtime.jsxDEV(
              "div",
              {
                "data-scale": props.scale,
                "data-position": JSON.stringify(props.position),
                children: props.children,
              },
              ...rest,
            )
          : runtime.jsxDEV(type, props, ...rest),
  };
});
const asset = (windows = false): PreparedVehicle => {
  const scene = new Group();
  for (const name of windows ? CABIN_WINDOW_NAMES : ["cabin"]) {
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    mesh.userData.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return {
    scene,
    scale: windows ? 2 : 200,
    position: windows ? [1, 2, 3] : [100, 200, 300],
    bindings: [],
    dispose: vi.fn(),
  };
};
const materials = (exterior: PreparedVehicle) =>
  exterior.scene.children.map((m) => (m as Mesh).material);
const finish = async (candidate: PreparedVehicle) =>
  act(async () => host.pending.get(candidate.scene.uuid)!.resolve());
beforeEach(() => {
  host.pending.clear();
  host.compile.mockClear();
  host.shadows.mockClear();
  host.state = {
    gl: {},
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    invalidate: vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("waits for proxy compilation, switches exactly one representation atomically and retains one glass owner", async () => {
  const exterior = asset(true),
    proxy = asset(),
    full = asset();
  const originals = materials(exterior),
    ready = vi.fn(),
    failed = vi.fn(),
    status = vi.fn();
  const view = (fullAsset: PreparedVehicle | null, active = false) => (
    <CabinAttachment
      exterior={exterior}
      proxy={proxy}
      asset={fullAsset}
      active={active}
      request={1}
      onReady={ready}
      onError={failed}
      onWindowStatus={status}
    />
  );
  const result = render(view(null));
  expect(result.container.querySelectorAll("[data-asset]")).toHaveLength(0);
  expect(materials(exterior)).toEqual(originals);
  expect(status).toHaveBeenLastCalledWith("loading");
  await finish(proxy);
  const thin = materials(exterior) as MeshStandardMaterial[];
  const disposals = thin.map((m) => vi.spyOn(m, "dispose"));
  expect(status).toHaveBeenLastCalledWith("ready");
  expect(
    result.container.querySelector("[data-asset]")?.getAttribute("data-asset"),
  ).toBe(proxy.scene.uuid);
  expect(
    result.container.querySelector("[data-scale]")?.getAttribute("data-scale"),
  ).toBe("2");
  expect(
    result.container
      .querySelector("[data-position]")
      ?.getAttribute("data-position"),
  ).toBe("[1,2,3]");
  result.rerender(view(full));
  await finish(full);
  expect(ready).toHaveBeenCalledWith(1);
  expect(
    result.container.querySelector("[data-asset]")?.getAttribute("data-asset"),
  ).toBe(proxy.scene.uuid);
  result.rerender(view(full, true));
  expect(result.container.querySelectorAll("[data-asset]")).toHaveLength(1);
  expect(
    result.container.querySelector("[data-asset]")?.getAttribute("data-asset"),
  ).toBe(full.scene.uuid);
  result.rerender(view(null));
  expect(result.container.querySelectorAll("[data-asset]")).toHaveLength(1);
  expect(
    result.container.querySelector("[data-asset]")?.getAttribute("data-asset"),
  ).toBe(proxy.scene.uuid);
  materials(exterior).forEach((m, i) => expect(m).toBe(thin[i]));
  expect(host.compile).toHaveBeenCalledTimes(2);
  expect(host.shadows).toHaveBeenCalledTimes(1);
  expect(proxy.dispose).not.toHaveBeenCalled();
  expect(failed).not.toHaveBeenCalled();
  disposals.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  result.unmount();
  expect(materials(exterior)).toEqual(originals);
  disposals.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
});

it("keeps full cabin selected if proxy completes later, and opaque glass returns when neither is usable", async () => {
  const exterior = asset(true),
    proxy = asset(),
    full = asset();
  const original = materials(exterior);
  const view = (active: boolean, failed = false) => (
    <CabinAttachment
      exterior={exterior}
      proxy={proxy}
      proxyFailed={failed}
      asset={full}
      active={active}
      request={3}
      onReady={() => {}}
      onError={() => {}}
    />
  );
  const result = render(view(true));
  expect(materials(exterior)).toEqual(original);
  await finish(full);
  expect(
    result.container.querySelector("[data-asset]")?.getAttribute("data-asset"),
  ).toBe(full.scene.uuid);
  const thin = materials(exterior);
  await finish(proxy);
  expect(result.container.querySelectorAll("[data-asset]")).toHaveLength(1);
  expect(
    result.container.querySelector("[data-asset]")?.getAttribute("data-asset"),
  ).toBe(full.scene.uuid);
  result.rerender(view(true, true));
  expect(materials(exterior)).toEqual(thin);
  result.rerender(view(false, true));
  expect(result.container.querySelectorAll("[data-asset]")).toHaveLength(0);
  expect(materials(exterior)).toEqual(original);
});

it("ignores cancelled and out-of-order full completions without discarding the ready proxy", async () => {
  const exterior = asset(true),
    proxy = asset(),
    full1 = asset(),
    full2 = asset();
  const ready = vi.fn(),
    failed = vi.fn();
  const view = (candidate: PreparedVehicle | null, request: number) => (
    <CabinAttachment
      exterior={exterior}
      proxy={proxy}
      asset={candidate}
      active={false}
      request={request}
      onReady={ready}
      onError={failed}
    />
  );
  const result = render(view(full1, 1));
  await finish(proxy);
  result.rerender(view(null, 0));
  expect(host.pending.get(full1.scene.uuid)!.signal.aborted).toBe(true);
  result.rerender(view(full2, 2));
  await finish(full1);
  expect(ready).not.toHaveBeenCalled();
  await act(async () =>
    host.pending
      .get(full2.scene.uuid)!
      .reject(new Error("Full compile failed")),
  );
  expect(failed).toHaveBeenCalledWith(2, "Full compile failed");
  expect(
    result.container.querySelector("[data-asset]")?.getAttribute("data-asset"),
  ).toBe(proxy.scene.uuid);
});

it("contains proxy failure, permits a full cabin, and cancels proxy compilation on teardown", async () => {
  const exterior = asset(true),
    proxy = asset(),
    full = asset();
  const failed = vi.fn(),
    proxyError = vi.fn();
  const view = (failedProxy = false) => (
    <CabinAttachment
      exterior={exterior}
      proxy={proxy}
      proxyFailed={failedProxy}
      asset={full}
      active
      request={4}
      onReady={() => {}}
      onError={failed}
      onProxyError={proxyError}
    />
  );
  const result = render(view());
  await act(async () =>
    host.pending
      .get(proxy.scene.uuid)!
      .reject(new Error("Proxy compile failed")),
  );
  expect(proxyError).toHaveBeenCalledTimes(1);
  expect(failed).not.toHaveBeenCalled();
  result.rerender(view(true));
  await finish(full);
  expect(
    result.container.querySelector("[data-asset]")?.getAttribute("data-asset"),
  ).toBe(full.scene.uuid);
  result.unmount();
  expect(host.pending.get(proxy.scene.uuid)!.signal.aborted).toBe(true);
  expect(host.pending.get(full.scene.uuid)!.signal.aborted).toBe(true);
});

it("requires a newly compiled exact asset for a new full request even if the caller marks it active", async () => {
  const exterior = asset(true),
    proxy = asset(),
    full = asset();
  const view = (request: number) => (
    <CabinAttachment
      exterior={exterior}
      proxy={proxy}
      asset={full}
      active
      request={request}
      onReady={() => {}}
      onError={() => {}}
    />
  );
  const result = render(view(1));
  await finish(proxy);
  await finish(full);
  result.rerender(view(2));
  expect(
    result.container.querySelector("[data-asset]")?.getAttribute("data-asset"),
  ).toBe(proxy.scene.uuid);
  await finish(full);
  expect(
    result.container.querySelector("[data-asset]")?.getAttribute("data-asset"),
  ).toBe(full.scene.uuid);
});

it("aborts timed-out proxy/full barriers and ignores their late completions", async () => {
  vi.useFakeTimers();
  const exterior = asset(true),
    proxy = asset(),
    full = asset();
  const failed = vi.fn(),
    proxyError = vi.fn(),
    ready = vi.fn();
  const result = render(
    <CabinAttachment
      exterior={exterior}
      proxy={proxy}
      asset={full}
      active
      request={9}
      onReady={ready}
      onError={failed}
      onProxyError={proxyError}
    />,
  );
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(failed).toHaveBeenCalledWith(9, expect.stringMatching(/too long/));
  expect(proxyError).toHaveBeenCalledTimes(1);
  expect(host.pending.get(proxy.scene.uuid)!.signal.aborted).toBe(true);
  expect(host.pending.get(full.scene.uuid)!.signal.aborted).toBe(true);
  await finish(proxy);
  await finish(full);
  expect(ready).not.toHaveBeenCalled();
  expect(result.container.querySelectorAll("[data-asset]")).toHaveLength(0);
  result.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("fails closed if window roles are missing, without reporting full cabin ready", async () => {
  const exterior = asset(),
    proxy = asset(),
    full = asset();
  const ready = vi.fn(),
    failed = vi.fn(),
    proxyError = vi.fn();
  const result = render(
    <CabinAttachment
      exterior={exterior}
      proxy={proxy}
      asset={full}
      active
      request={11}
      onReady={ready}
      onError={failed}
      onProxyError={proxyError}
    />,
  );
  await finish(full);
  await finish(proxy);
  expect(ready).not.toHaveBeenCalled();
  expect(failed).toHaveBeenCalledWith(
    11,
    expect.stringMatching(/window roles/),
  );
  expect(proxyError).toHaveBeenCalledTimes(1);
  expect(result.container.querySelectorAll("[data-asset]")).toHaveLength(0);
});

it("restores glass before an early outer loader disposal and never double-disposes thin or source materials", async () => {
  const source = asset(true);
  const exterior = prepareVehicle(source.scene, {
    paint: [],
    headlights: [],
    taillights: [],
  });
  const proxy = asset();
  const originals = materials(exterior) as MeshStandardMaterial[];
  const originalDisposed = originals.map((m) => vi.spyOn(m, "dispose"));
  const result = render(
    <CabinAttachment
      exterior={exterior}
      proxy={proxy}
      asset={null}
      active={false}
      request={0}
      onReady={() => {}}
      onError={() => {}}
    />,
  );
  await finish(proxy);
  const thin = materials(exterior) as MeshStandardMaterial[];
  const thinDisposed = thin.map((m) => vi.spyOn(m, "dispose"));
  exterior.dispose();
  expect(materials(exterior)).toEqual(originals);
  result.unmount();
  exterior.dispose();
  for (const dispose of [...originalDisposed, ...thinDisposed])
    expect(dispose).toHaveBeenCalledTimes(1);
});

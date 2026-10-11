// @vitest-environment jsdom
import {
  Children,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from "react";
import { cleanup, render } from "@testing-library/react";
import { act, createRoot, _roots, extend } from "@react-three/fiber";
import type { CanvasProps } from "@react-three/fiber";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Group, Color, MeshStandardMaterial } from "three";
import type { WebGLRenderer } from "three";
import VehicleScene from "../src/components/three/VehicleScene";
import type { PreparedVehicle } from "../src/components/three/materialAdapter";
import type { VehicleSceneProps } from "../src/components/three/types";

const host = vi.hoisted(() => ({
  canvas: {} as CanvasProps,
  asset: null as PreparedVehicle | null,
}));
vi.mock("@react-three/fiber", async (original) => ({
  ...(await original<typeof import("@react-three/fiber")>()),
  Canvas: (props: CanvasProps) => {
    host.canvas = props;
    return null;
  },
}));
vi.mock("../src/components/three/useVehicleAsset", () => ({
  useVehicleAsset: (url: string | null) =>
    url === "/exterior.glb" ? host.asset : null,
}));

let now = 0;
const roots: ReturnType<typeof createRoot>[] = [];
const props: VehicleSceneProps = {
  url: "/exterior.glb",
  paint: "#000000",
  environment: "studio",
  preset: "hero",
  autoRotate: false,
  lights: false,
  reducedMotion: false,
  materialRoles: { paint: [], headlights: [], taillights: [] },
  onReady() {},
  onError() {},
  onProgress() {},
  onManual() {},
};

beforeEach(() => {
  now = 0;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  extend({ Group });
  host.asset = {
    scene: new Group(),
    scale: 1,
    position: [0, 0, 0],
    dispose() {},
    bindings: [
      {
        role: "paint",
        material: new MeshStandardMaterial({ color: "#000000" }),
      },
      { role: "headlights", material: new MeshStandardMaterial() },
    ],
  };
});
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  cleanup();
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  host.asset?.bindings.forEach(({ material }) => material.dispose());
});

// Render the real private Vehicle child through installed R3F. Only its native
// GPU renderer and outer DOM Canvas are replaced; no WebGL, browser or socket.
function vehicleChild(children: ReactNode): ReactElement | undefined {
  let found: ReactElement | undefined;
  Children.forEach(children, (child) => {
    if (
      !isValidElement<{ asset?: PreparedVehicle; children?: ReactNode }>(child)
    )
      return;
    if (
      child.props.asset === host.asset &&
      typeof child.type === "function" &&
      child.type.name === "Vehicle"
    )
      found = child;
    else found ??= vehicleChild(child.props.children);
  });
  return found;
}
async function fixture() {
  const view = render(<VehicleScene {...props} />);
  const canvas = document.createElement("canvas");
  const renderer = {
    isWebGLRenderer: true,
    domElement: canvas,
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
    renderLists: { dispose() {} },
    dispose() {},
    forceContextLoss() {},
  } as unknown as WebGLRenderer;
  const root = createRoot(canvas);
  roots.push(root);
  await root.configure({
    gl: () => renderer,
    frameloop: "never",
    size: { width: 100, height: 100, top: 0, left: 0 },
  });
  const rerender = async (overrides: Partial<VehicleSceneProps> = {}) => {
    view.rerender(<VehicleScene {...props} {...overrides} />);
    const vehicle = vehicleChild(host.canvas.children);
    expect(vehicle).toBeTruthy();
    await act(async () => root.render(vehicle!));
  };
  await rerender();
  const state = _roots.get(canvas)!.store.getState();
  return {
    rerender,
    root,
    color: host.asset!.bindings[0].material.color,
    light: host.asset!.bindings[1].material,
    async frame(elapsed: number) {
      now += elapsed * 1000;
      await act(async () => state.advance(now / 1000));
    },
  };
}

it("excludes long pre-request idle and applies the normal paint curve on the first sample", async () => {
  const f = await fixture();
  await f.frame(1 / 60);
  now += 60_000;
  await f.rerender({ paint: "#ffffff" });
  await f.frame(1 / 60);
  expect(f.color.r).toBeCloseTo(1 - Math.exp(-7 / 60), 12);
  expect(f.color.g).toBe(f.color.r);
  expect(f.color.b).toBe(f.color.r);
});

it("settles paint exactly on a sparse sample and retains immediate light switching", async () => {
  const f = await fixture();
  await f.rerender({ paint: "#ffffff", lights: true });
  await f.frame(1 / 60);
  expect(f.light.emissiveIntensity).toBe(3);
  await f.frame(3.5);
  expect(f.color.toArray()).toEqual(new Color("#ffffff").toArray());
  await f.rerender({ paint: "#ffffff", lights: false });
  await f.frame(0);
  expect(f.light.emissiveIntensity).toBe(0);
});

it("retargets pending paint from the displayed color without inheriting elapsed target age", async () => {
  const f = await fixture();
  await f.rerender({ paint: "#ffffff" });
  await f.frame(0.05);
  now += 3500;
  const initial = f.color.clone();
  await f.rerender({ paint: "#ff0000" });
  await f.frame(1 / 60);
  const expected = initial.lerp(new Color("#ff0000"), 1 - Math.exp(-7 / 60));
  expect(f.color.r).toBeCloseTo(expected.r, 12);
  expect(f.color.g).toBeCloseTo(expected.g, 12);
  await f.frame(3.5);
  expect(f.color.toArray()).toEqual(new Color("#ff0000").toArray());
});

it("does not restart a pending paint transition when only lights change", async () => {
  const f = await fixture();
  await f.rerender({ paint: "#ffffff" });
  await f.frame(0.05);
  now += 3500;
  await f.rerender({ paint: "#ffffff", lights: true });
  await f.frame(0);
  expect(f.color.toArray()).toEqual(new Color("#ffffff").toArray());
  expect(f.light.emissiveIntensity).toBe(3);
});

it("preserves immediate reduced-motion and fresh appearance initialization after remount", async () => {
  const f = await fixture();
  await f.rerender({ paint: "#ffffff" });
  await f.frame(0.05);
  await f.rerender({ paint: "#ff0000", lights: true, reducedMotion: true });
  expect(f.color.toArray()).toEqual(new Color("#ff0000").toArray());
  expect(f.light.emissiveIntensity).toBe(3);
  await act(async () => f.root.render(null));
  now += 60_000;
  await f.rerender({ paint: "#00ff00" });
  expect(f.color.toArray()).toEqual(new Color("#00ff00").toArray());
  await f.rerender({ paint: "#ffffff" });
  await f.frame(1 / 60);
  expect(f.color.r).toBeCloseTo(1 - Math.exp(-7 / 60), 12);
});

// @vitest-environment jsdom
import { useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Group, PerspectiveCamera, Scene, MeshStandardMaterial } from "three";
import RearVehicleScene from "../src/components/home/RearVehicleScene";

const runtime = vi.hoisted(() => ({
  state: {} as any,
  asset: null as any,
  environmentBuilds: 0,
  shadowRenders: 0,
  lights: [] as Record<string, any>[],
  fog: {} as any,
  environment: {} as any,
  floor: {} as any,
}));
// DOM tests do not render Three hosts. Keep the real React component boundaries,
// which determine whether the static studio sends new work to Drei.
vi.mock("react/jsx-runtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("react/jsx-runtime")>();
  const react = await import("react");
  const host = (type: unknown, props: any) => {
    if (type === "rectAreaLight" || type === "pointLight")
      runtime.lights.push(props);
    if (type === "fog") runtime.fog = props;
    if (type === "meshPhysicalMaterial") runtime.floor = props;
    return typeof type === "string";
  };
  return {
    ...original,
    jsx: (type: any, props: any, key: any) =>
      original.jsx(
        host(type, props) ? react.Fragment : type,
        host(type, props) ? { children: props.children } : props,
        key,
      ),
    jsxs: (type: any, props: any, key: any) =>
      original.jsxs(
        host(type, props) ? react.Fragment : type,
        host(type, props) ? { children: props.children } : props,
        key,
      ),
  };
});
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("react/jsx-dev-runtime")>();
  const react = await import("react");
  return {
    ...original,
    jsxDEV: (type: any, props: any, ...rest: any[]) => {
      if (type === "rectAreaLight" || type === "pointLight")
        runtime.lights.push(props);
      if (type === "fog") runtime.fog = props;
      if (type === "meshPhysicalMaterial") runtime.floor = props;
      return (original.jsxDEV as any)(
        typeof type === "string" ? react.Fragment : type,
        typeof type === "string" ? { children: props.children } : props,
        ...rest,
      );
    },
  };
});
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: ReactNode }) => children,
  useThree: (select: (state: any) => unknown) => select(runtime.state),
  useFrame: () => {},
}));
vi.mock("../src/components/three/useVehicleAsset", () => ({
  useVehicleAsset: () => runtime.asset,
}));
vi.mock("../src/components/three/StageGeometry", () => ({
  StageGeometry: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@react-three/drei/core/Environment", () => ({
  Environment: (props: { children: ReactNode }) => {
    const { children } = props;
    runtime.environment = props;
    // Installed Drei EnvironmentPortal rebuilds its cubemap when children changes.
    useLayoutEffect(() => {
      runtime.environmentBuilds++;
    }, [children]);
    return null;
  },
}));
vi.mock("@react-three/drei/core/ContactShadows", () => ({
  ContactShadows: () => {
    // Installed Drei resets its one-frame counter on component render.
    runtime.shadowRenders++;
    return null;
  },
}));
vi.mock("@react-three/drei/core/Lightformer", () => ({
  Lightformer: () => null,
}));

beforeEach(() => {
  runtime.environmentBuilds = 0;
  runtime.shadowRenders = 0;
  runtime.lights = [];
  runtime.fog = {};
  runtime.environment = {};
  runtime.floor = {};
  runtime.asset = {
    scene: new Group(),
    bindings: [],
    scale: 1,
    position: [0, 0, 0],
  };
  runtime.state = {
    camera: new PerspectiveCamera(),
    scene: new Scene(),
    size: { width: 1440, height: 900 },
    gl: { domElement: document.createElement("canvas") },
    invalidate: () => {},
  };
});
afterEach(cleanup);

it("keeps the static studio resource boundaries stable across scroll progress updates", () => {
  const callbacks = {
    onReady: () => {},
    onError: () => {},
    onProgress: () => {},
  };
  const { rerender } = render(
    <RearVehicleScene {...callbacks} progress={0} reducedMotion={false} />,
  );
  expect(runtime.environmentBuilds).toBe(1);
  expect(runtime.shadowRenders).toBe(1);
  for (const progress of [0.2, 0.5, 0.9, 0.1]) {
    rerender(
      <RearVehicleScene
        {...callbacks}
        progress={progress}
        reducedMotion={false}
      />,
    );
  }
  expect(runtime.environmentBuilds).toBe(1);
  expect(runtime.shadowRenders).toBe(1);
});

it("keeps the actual taillight emission saturated red instead of passing it through the desaturating studio tone map", () => {
  const lamp = new MeshStandardMaterial({ color: "#000000" });
  runtime.asset.bindings = [{ material: lamp, role: "taillights" }];
  render(
    <RearVehicleScene
      progress={0}
      reducedMotion={false}
      onReady={() => {}}
      onError={() => {}}
      onProgress={() => {}}
    />,
  );
  expect(lamp.emissive.r).toBeGreaterThan(0.9);
  expect(lamp.emissive.g).toBeLessThan(lamp.emissive.r * 0.02);
  expect(lamp.emissive.b).toBeLessThan(lamp.emissive.r * 0.02);
  expect(lamp.toneMapped).toBe(false);
});

it("mounts a broad white overhead source instead of another frontal hotspot", () => {
  render(
    <RearVehicleScene
      progress={1}
      reducedMotion
      onReady={() => {}}
      onError={() => {}}
      onProgress={() => {}}
    />,
  );
  const roof = runtime.lights.find((light) => light.name === "rear-roof");
  expect(roof).toBeDefined();
  expect(roof!.color).toBe("#ffffff");
  expect(roof!.width).toBeGreaterThanOrEqual(5);
  expect(roof!.height).toBeGreaterThanOrEqual(2);
  expect(roof!.position[1]).toBeGreaterThanOrEqual(3);
  expect(roof!.position[2]).toBeGreaterThanOrEqual(0);
});

it("keeps four restrained short-range red spill sources at the measured rear lens positions", () => {
  render(
    <RearVehicleScene
      progress={1}
      reducedMotion
      onReady={() => {}}
      onError={() => {}}
      onProgress={() => {}}
    />,
  );
  const spill = runtime.lights.filter((light) =>
    light.name?.startsWith("rear-lens-spill"),
  );
  expect(spill).toHaveLength(4);
  for (const light of spill) {
    expect(light.color).toBe("#ff170b");
    expect(light.distance).toBeLessThanOrEqual(0.4);
    expect(light.intensity).toBeLessThanOrEqual(0.025);
    expect(light.position[2]).toBeLessThan(-2.2);
  }
});

it("initializes fog, cached environment influence, and local spill dark before the first demand frame", () => {
  render(
    <RearVehicleScene
      progress={0}
      reducedMotion={false}
      onReady={() => {}}
      onError={() => {}}
      onProgress={() => {}}
    />,
  );
  expect(runtime.fog.args[0]).toBe("#000000");
  expect(runtime.environment.environmentIntensity).toBe(0);
  expect(runtime.floor.emissive ?? "#000000").toBe("#000000");
  for (const light of runtime.lights) expect(light.intensity).toBe(0);
});

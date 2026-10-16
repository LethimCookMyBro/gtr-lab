// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { Group } from "three";
import type { VehicleSceneProps } from "../src/components/three/types";
const host = vi.hoisted(() => ({
  calls: [] as any[][],
  canvas: null as any,
  asset: null as any,
}));
vi.mock("@react-three/fiber", async (original) => ({
  ...(await original<any>()),
  Canvas: (props: any) => {
    host.canvas = props;
    return null;
  },
}));
// Scene boundary contract only: real decode/disposal is exercised separately on the pinned GLB.
vi.mock("../src/components/three/useVehicleAsset", () => ({
  useVehicleAsset: (...args: any[]) => {
    host.calls.push(args);
    return args[0] ? host.asset : null;
  },
}));
import VehicleScene from "../src/components/three/VehicleScene";
import { R35_STUDY } from "../src/data/r35IntegratedStudy";
function elements(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object") return [];
  return [node, ...elements(node.props?.children)];
}
afterEach(() => {
  cleanup();
  host.calls = [];
});
it("loads and mounts one owner and requests no detached cabin or proxy across every integrated view", async () => {
  host.asset = {
    scene: new Group(),
    scale: 1,
    position: [0, 0, 0],
    bindings: [],
    dispose: vi.fn(),
  };
  let props: VehicleSceneProps = {
    url: R35_STUDY.asset.url!,
    materialRoles: R35_STUDY.asset.materialRoles,
    cabinLayout: R35_STUDY.asset.cabinLayout,
    cabin: { phase: "closed" },
    cabinPreparation: {
      phase: "loading",
      request: 2,
      progress: { phase: "preparing" },
    },
    paint: "#ffffff",
    lights: false,
    environment: "studio",
    preset: "hero",
    reducedMotion: true,
    autoRotate: false,
    onReady() {},
    onError() {},
    onProgress() {},
    onManual() {},
  };
  const page = render(<VehicleScene {...props} />);
  for (const seat of [
    null,
    "driver",
    "passenger",
    "rear",
    null,
    "driver",
  ] as const) {
    props = {
      ...props,
      cabin: seat
        ? { phase: "active", request: 2, seat, resumeRotation: false }
        : { phase: "closed" },
    };
    page.rerender(<VehicleScene {...props} />);
    await waitFor(() => expect(host.canvas).not.toBeNull());
    const children = elements(host.canvas.children);
    const vehicle = children.filter((child) => child.type?.name === "Vehicle"),
      cabin = children.find((child) => child.type?.name === "CabinRuntime");
    expect(vehicle).toHaveLength(1);
    expect(vehicle[0].props.asset).toBe(host.asset);
    expect(cabin.props.asset).toBe(host.asset);
    expect(cabin.props.exterior).toBe(host.asset);
    expect(cabin.props.proxy).toBeNull();
  }
  const requested = host.calls.filter((args) => args[0] !== null);
  expect(requested.length).toBeGreaterThan(0);
  expect(new Set(requested.map((args) => args[0]))).toEqual(
    new Set([R35_STUDY.asset.url]),
  );
  expect(requested.every((args) => args[8] === true)).toBe(true);
});

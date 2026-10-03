// @vitest-environment jsdom
import { useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Group, PerspectiveCamera, Scene } from "three";
import RearVehicleScene from "../src/components/home/RearVehicleScene";

const runtime = vi.hoisted(() => ({
  state: {} as any,
  asset: null as any,
  environmentBuilds: 0,
  shadowRenders: 0,
}));
// DOM tests do not render Three hosts. Keep the real React component boundaries,
// which determine whether the static studio sends new work to Drei.
vi.mock("react/jsx-runtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("react/jsx-runtime")>();
  const react = await import("react");
  const host = (type: unknown) => typeof type === "string";
  return {
    ...original,
    jsx: (type: any, props: any, key: any) =>
      original.jsx(
        host(type) ? react.Fragment : type,
        host(type) ? { children: props.children } : props,
        key,
      ),
    jsxs: (type: any, props: any, key: any) =>
      original.jsxs(
        host(type) ? react.Fragment : type,
        host(type) ? { children: props.children } : props,
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
    jsxDEV: (type: any, props: any, ...rest: any[]) =>
      (original.jsxDEV as any)(
        typeof type === "string" ? react.Fragment : type,
        typeof type === "string" ? { children: props.children } : props,
        ...rest,
      ),
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
  Environment: ({ children }: { children: ReactNode }) => {
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

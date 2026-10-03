// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  Group,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
} from "three";
import RearVehicleScene from "../src/components/home/RearVehicleScene";

const runtime = vi.hoisted(() => ({
  state: {} as any,
  asset: null as any,
  contact: {} as any,
  floorY: Number.NaN,
}));
// Observe the values sent to Three/Drei without pretending a DOM test can
// render WebGL. The regression below exercises the real camera/plane maths.
vi.mock("react/jsx-runtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("react/jsx-runtime")>();
  const react = await import("react");
  const host = (type: unknown, props: any) => {
    if (type === "mesh" && props.rotation?.[0] === -Math.PI / 2)
      runtime.floorY = props.position[1];
    return typeof type === "string";
  };
  return {
    ...original,
    jsx: (type: any, props: any, key: any) =>
      original.jsx(
        host(type, props) ? react.Fragment : type,
        typeof type === "string" ? { children: props.children } : props,
        key,
      ),
    jsxs: (type: any, props: any, key: any) =>
      original.jsxs(
        host(type, props) ? react.Fragment : type,
        typeof type === "string" ? { children: props.children } : props,
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
      if (type === "mesh" && props.rotation?.[0] === -Math.PI / 2)
        runtime.floorY = props.position[1];
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
  Environment: () => null,
}));
vi.mock("@react-three/drei/core/Lightformer", () => ({
  Lightformer: () => null,
}));
vi.mock("@react-three/drei/core/ContactShadows", () => ({
  ContactShadows: (props: any) => {
    runtime.contact = props;
    return null;
  },
}));

beforeEach(() => {
  runtime.floorY = Number.NaN;
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
  render(
    <RearVehicleScene
      progress={1}
      reducedMotion
      onReady={() => {}}
      onError={() => {}}
      onProgress={() => {}}
    />,
  );
});
afterEach(cleanup);

it("keeps Drei's world-origin blur plane in the rear contact camera frustum", () => {
  const { scale, position, near = 0, far } = runtime.contact;
  const width = Array.isArray(scale) ? scale[0] : scale;
  const height = Array.isArray(scale) ? scale[1] : scale;
  // Installed Drei ContactShadows gives its camera the receiver group's
  // transform, but renders an unparented blur plane at world Y=0. A receiver
  // above Y=0 therefore clips the whole blur pass when near=0, clearing away
  // its captured vehicle depth even though the displayed receiver is visible.
  const group = new Group();
  group.position.fromArray(position);
  group.rotation.x = Math.PI / 2;
  const camera = new OrthographicCamera(
    -width / 2,
    width / 2,
    height / 2,
    -height / 2,
    near,
    far,
  );
  group.add(camera);
  group.updateMatrixWorld(true);
  const blurPlane = new PlaneGeometry(width, height).rotateX(Math.PI / 2);
  for (let i = 0; i < blurPlane.attributes.position.count; i++) {
    const point = new Vector3()
      .fromBufferAttribute(blurPlane.attributes.position, i)
      .project(camera);
    expect(point.z).toBeGreaterThanOrEqual(-1);
    expect(point.z).toBeLessThanOrEqual(1);
  }
  blurPlane.dispose();
});

it("places the shadow receiver above its floor and within millimetres of the normalized tyres", () => {
  const receiverY = runtime.contact.position[1];
  expect(runtime.floorY).toBeLessThan(receiverY);
  expect(receiverY).toBeLessThanOrEqual(0);
  expect(runtime.floorY).toBeGreaterThanOrEqual(-0.005);
  expect(runtime.contact.frames).toBe(1);
});

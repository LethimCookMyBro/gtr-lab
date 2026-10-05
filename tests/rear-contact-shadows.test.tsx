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
  floorMaterial: {} as any,
}));
// Observe the values sent to Three/Drei without pretending a DOM test can
// render WebGL. The regression below exercises the real camera/plane maths.
vi.mock("react/jsx-runtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("react/jsx-runtime")>();
  const react = await import("react");
  const host = (type: unknown, props: any) => {
    if (type === "mesh" && props.rotation?.[0] === -Math.PI / 2)
      runtime.floorY = props.position[1];
    if (type === "meshPhysicalMaterial") runtime.floorMaterial = props;
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
      if (type === "meshPhysicalMaterial") runtime.floorMaterial = props;
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

it("retains a high-resolution tight contact shadow instead of a broad floating blur", () => {
  expect(runtime.contact.resolution).toBeGreaterThanOrEqual(512);
  expect(runtime.contact.blur).toBeLessThanOrEqual(0.45);
  expect(runtime.contact.opacity).toBeGreaterThanOrEqual(0.85);
  expect(runtime.contact.far).toBeLessThanOrEqual(0.4);
  expect(runtime.asset.position).toEqual([0, 0, 0]);
});

it("clips elevated bodywork out of the depth pass while retaining the tyre contact zone", () => {
  const camera = new OrthographicCamera(-2, 2, 3, -3, 0, runtime.contact.far);
  camera.position.fromArray(runtime.contact.position);
  camera.rotation.x = Math.PI / 2;
  camera.updateMatrixWorld(true);
  expect(new Vector3(0.85, 0.02, -1.5).project(camera).z).toBeLessThan(1);
  expect(new Vector3(0, 0.8, -1.5).project(camera).z).toBeGreaterThan(1);
});

it("uses a low-specular matte floor instead of a bright grazing environment reflection", () => {
  expect(runtime.floorMaterial.specularIntensity).toBeLessThanOrEqual(0.1);
  expect(runtime.floorMaterial.roughness).toBeGreaterThanOrEqual(0.92);
});

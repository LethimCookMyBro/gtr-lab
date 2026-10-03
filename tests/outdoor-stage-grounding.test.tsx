// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  Group,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Texture,
  Vector3,
} from "three";
import { GroundProjectedEnv } from "three-stdlib";
import { StudioLighting } from "../src/components/three/StudioLighting";

const runtime = vi.hoisted(() => ({
  state: {} as any,
  contact: {} as any,
  floorY: NaN,
  ground: null as any,
  texture: null as any,
}));
function host(type: unknown, props: any) {
  if (type === "mesh" && props.rotation?.[0] === -Math.PI / 2)
    runtime.floorY = props.position[1];
  if (type === "primitive" && props.object instanceof Mesh)
    runtime.ground = props.object;
  return typeof type === "string";
}
vi.mock("react/jsx-runtime", async (original) => {
  const jsx = await original<typeof import("react/jsx-runtime")>();
  const react = await import("react");
  return {
    ...jsx,
    jsx: (type: any, props: any, key: any) =>
      jsx.jsx(
        host(type, props) ? react.Fragment : type,
        typeof type === "string" ? { children: props.children } : props,
        key,
      ),
    jsxs: (type: any, props: any, key: any) =>
      jsx.jsxs(
        host(type, props) ? react.Fragment : type,
        typeof type === "string" ? { children: props.children } : props,
        key,
      ),
  };
});
vi.mock("react/jsx-dev-runtime", async (original) => {
  const jsx = await original<typeof import("react/jsx-dev-runtime")>();
  const react = await import("react");
  return {
    ...jsx,
    jsxDEV: (type: any, props: any, ...rest: any[]) =>
      (jsx.jsxDEV as any)(
        host(type, props) ? react.Fragment : type,
        typeof type === "string" ? { children: props.children } : props,
        ...rest,
      ),
  };
});
vi.mock("@react-three/fiber", () => ({
  useThree: (select: any) => select(runtime.state),
  useFrame: () => {},
}));
vi.mock("../src/components/three/StageGeometry", () => ({
  StageGeometry: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@react-three/drei/core/useEnvironment", () => ({
  useEnvironment: () => runtime.texture,
}));
vi.mock("@react-three/drei/core/Lightformer", () => ({
  Lightformer: () => null,
}));
vi.mock("@react-three/drei/core/Environment", () => ({
  Environment: (props: any) => {
    // Exercise installed legacy projection geometry, not a made-up substitute.
    if (props.ground) {
      runtime.ground = new GroundProjectedEnv(runtime.texture, props.ground);
      runtime.ground.scale.setScalar(props.ground.scale);
    }
    return null;
  },
}));
vi.mock("@react-three/drei/core/ContactShadows", () => ({
  ContactShadows: (props: any) => {
    runtime.contact = props;
    return null;
  },
}));
beforeEach(() => {
  runtime.floorY = NaN;
  runtime.ground = null;
  runtime.texture = new Texture({ width: 2048, height: 1024 } as any);
  runtime.state = {
    camera: new PerspectiveCamera(),
    scene: new Scene(),
    size: { width: 1440, height: 900 },
    invalidate: () => {},
  };
});
afterEach(cleanup);

it.each(["studio", "gallery", "night", "forest", "coast"] as const)(
  "keeps %s contact blur plane inside the real shadow camera frustum",
  (environment) => {
    render(<StudioLighting environment={environment} reducedMotion />);
    const { scale, position, near = 0, far } = runtime.contact;
    const group = new Group();
    group.position.fromArray(position);
    group.rotation.x = Math.PI / 2;
    const camera = new OrthographicCamera(
      -scale / 2,
      scale / 2,
      scale / 2,
      -scale / 2,
      near,
      far,
    );
    group.add(camera);
    group.updateMatrixWorld(true);
    const blurPlane = new PlaneGeometry(scale, scale).rotateX(Math.PI / 2);
    for (let i = 0; i < blurPlane.attributes.position.count; i++) {
      const p = new Vector3()
        .fromBufferAttribute(blurPlane.attributes.position, i)
        .project(camera);
      expect(p.z).toBeGreaterThanOrEqual(-1);
      expect(p.z).toBeLessThanOrEqual(1);
    }
    expect(runtime.floorY).toBeLessThan(position[1]);
    expect(position[1]).toBeLessThanOrEqual(0);
    expect(runtime.contact.frames).toBe(1);
  },
);

it.each(["forest", "coast"] as const)(
  "keeps %s photographic ground geometrically registered under the tyres and shadows",
  (environment) => {
    render(<StudioLighting environment={environment} reducedMotion />);
    const ground = runtime.ground as Mesh;
    expect(ground).not.toBeNull();
    ground.updateMatrixWorld(true);
    // The old 80m shader shell only LOOKED like a floor; its apparent position
    // drifted with the camera. Actual world-space ground must intersect Y≈0.
    for (const [x, z] of [
      [0.01, 0.01],
      [1, 2],
      [-1, -2],
      [8, 0],
      [-8, 0],
      [0, 8],
    ]) {
      const hits = new Raycaster(
        new Vector3(x, 3, z),
        new Vector3(0, -1, 0),
      ).intersectObject(ground);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].point.y).toBeCloseTo(-0.003, 3);
    }
    expect((ground.material as any).depthWrite).toBe(false);
  },
);

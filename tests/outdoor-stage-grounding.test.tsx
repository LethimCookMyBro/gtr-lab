// @vitest-environment jsdom
import { StrictMode } from "react";
import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  Box3,
  Group,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Texture,
  Vector3,
  MeshStandardMaterial,
} from "three";
import { GroundProjectedEnv } from "three-stdlib";
import { StudioLighting } from "../src/components/three/StudioLighting";

const runtime = vi.hoisted(() => ({
  state: {} as any,
  contact: {} as any,
  floorY: NaN,
  ground: null as any,
  venue: null as any,
  texture: null as any,
  environments: [] as any[],
}));
function host(type: unknown, props: any) {
  if (type === "mesh" && props.rotation?.[0] === -Math.PI / 2)
    runtime.floorY = props.position[1];
  if (
    type === "primitive" &&
    props.object instanceof Group &&
    props.object.position.y === 0
  ) {
    runtime.venue = props.object;
    runtime.floorY =
      props.object.getObjectByName("driving-surface")?.position.y;
  }
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
vi.mock("@react-three/drei/core/Texture", () => ({
  useTexture: () => Array.from({ length: 12 }, () => runtime.texture),
}));
vi.mock("@react-three/drei/core/Lightformer", () => ({
  Lightformer: () => null,
}));
vi.mock("@react-three/drei/core/Environment", () => ({
  Environment: (props: any) => {
    runtime.environments.push(props);
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
  runtime.environments = [];
  runtime.floorY = NaN;
  runtime.ground = null;
  runtime.venue = null;
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

it.each(["studio", "gallery", "night", "forest", "coast"] as const)(
  "%s is a real world-space venue with a textured opaque receiving surface",
  (environment) => {
    render(<StudioLighting environment={environment} reducedMotion />);
    expect(
      runtime.venue,
      "Every selectable environment must contain real venue geometry",
    ).not.toBeNull();
    const venue = runtime.venue as Group;
    venue.updateMatrixWorld(true);
    const floor = venue.getObjectByName("driving-surface") as Mesh;
    expect(floor).toBeInstanceOf(Mesh);
    expect(floor.material).toBeInstanceOf(MeshStandardMaterial);
    expect((floor.material as MeshStandardMaterial).map).not.toBeNull();
    expect((floor.material as MeshStandardMaterial).normalMap).not.toBeNull();
    expect((floor.material as MeshStandardMaterial).transparent).toBe(false);
    expect(floor.receiveShadow).toBe(true);
    for (const [x, z] of [
      [0, 0],
      [1, 2],
      [-1, -2],
      [8, 0],
      [-8, 0],
    ]) {
      const hit = new Raycaster(
        new Vector3(x, 3, z),
        new Vector3(0, -1, 0),
      ).intersectObject(floor)[0];
      expect(hit?.point.y).toBeCloseTo(-0.002, 3);
    }
    const solids: Mesh[] = [];
    venue.traverse((object) => {
      if (object instanceof Mesh && object.position.y > 0.2)
        solids.push(object);
    });
    expect(
      solids.length,
      "Walls, buildings and roadside structures need positional parallax",
    ).toBeGreaterThan(15);
    expect(
      runtime.ground,
      "No projected panorama may impersonate nearby ground",
    ).toBeNull();
  },
);

it("disposes owned venue geometry and materials without destroying cached texture sources", () => {
  const { unmount } = render(
    <StudioLighting environment="forest" reducedMotion />,
  );
  expect(runtime.venue).not.toBeNull();
  const floor = runtime.venue.getObjectByName("driving-surface") as Mesh;
  const disposeGeometry = vi.spyOn(floor.geometry, "dispose");
  const disposeMaterial = vi.spyOn(
    floor.material as MeshStandardMaterial,
    "dispose",
  );
  unmount();
  expect(disposeGeometry).toHaveBeenCalledOnce();
  expect(disposeMaterial).toHaveBeenCalledOnce();
});

it("releases resources after StrictMode replays effects and the venue renders again", () => {
  const { unmount } = render(
    <StrictMode>
      <StudioLighting environment="studio" reducedMotion />
    </StrictMode>,
  );
  const floor = runtime.venue.getObjectByName("driving-surface") as Mesh;
  const disposeGeometry = vi.spyOn(floor.geometry, "dispose");
  const disposeMaterial = vi.spyOn(
    floor.material as MeshStandardMaterial,
    "dispose",
  );
  unmount();
  expect(disposeGeometry).toHaveBeenCalledOnce();
  expect(disposeMaterial).toHaveBeenCalledOnce();
});

it("offsets road paint and joints in depth so near-coplanar markings cannot flicker", () => {
  render(<StudioLighting environment="studio" reducedMotion />);
  for (const name of ["bay-line", "floor-expansion-joint"]) {
    const mark = runtime.venue.getObjectByName(name) as Mesh;
    const material = mark.material as MeshStandardMaterial;
    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBeLessThan(0);
    expect(material.polygonOffsetUnits).toBeLessThan(0);
  }
});

it("has continuous land where the paddock surface joins the modelled hills", () => {
  render(<StudioLighting environment="forest" reducedMotion />);
  runtime.venue.updateMatrixWorld(true);
  for (const x of [-88, -84, -81, 81, 84, 88]) {
    const hits = new Raycaster(
      new Vector3(x, 30, 0),
      new Vector3(0, -1, 0),
    ).intersectObject(runtime.venue, true);
    expect(hits.length, `land seam at x=${x}`).toBeGreaterThan(0);
  }
});

it("keeps the coastal sea wall outside the complete low Top-view orbit envelope", () => {
  render(<StudioLighting environment="coast" reducedMotion />);
  runtime.venue.updateMatrixWorld(true);
  runtime.venue.traverse((object: any) => {
    if (object.name === "sea-wall") {
      const bounds = new Box3().setFromObject(object);
      expect(bounds.distanceToPoint(new Vector3(0, 0.45, 0))).toBeGreaterThan(
        18.1,
      );
    }
  });
});

it.each(["forest", "coast"] as const)(
  "captures %s real geometry into the vehicle reflection map",
  (environment) => {
    render(<StudioLighting environment={environment} reducedMotion />);
    expect(
      runtime.environments.some(
        (props) => props.children && props.frames === 1,
      ),
    ).toBe(true);
  },
);

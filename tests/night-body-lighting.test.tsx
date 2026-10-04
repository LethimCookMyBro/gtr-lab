import { isValidElement } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Box3,
  Euler,
  Mesh,
  MeshStandardMaterial,
  Texture,
  Vector3,
} from "three";
import { Environment } from "@react-three/drei/core/Environment";
import { Lightformer } from "@react-three/drei/core/Lightformer";
import { StudioLighting } from "../src/components/three/StudioLighting";
import {
  createVenue,
  setVenueInspectionCutaway,
} from "../src/components/three/venueGeometry";

// Inspect the real scene declaration without starting a WebGL renderer or loading images.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: () => {},
}));
vi.mock("@react-three/fiber", async (original) => ({
  ...(await original<typeof import("@react-three/fiber")>()),
  useFrame: () => {},
}));
vi.mock("@react-three/drei/core/Texture", () => ({
  useTexture: () => Array.from({ length: 13 }, () => new Texture()),
}));

const textures = () => ({
  floor: [new Texture(), new Texture(), new Texture()] as [
    Texture,
    Texture,
    Texture,
  ],
  wall: [new Texture(), new Texture(), new Texture()] as [
    Texture,
    Texture,
    Texture,
  ],
  asphalt: [new Texture(), new Texture(), new Texture()] as [
    Texture,
    Texture,
    Texture,
  ],
  rock: [new Texture(), new Texture(), new Texture()] as [
    Texture,
    Texture,
    Texture,
  ],
});

type Element = { type: unknown; props: Record<string, any> };
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, any>>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function declaration() {
  const tree = StudioLighting({ environment: "night", reducedMotion: true });
  const all = elements(tree);
  const environment = all.find((element) => element.type === Environment)!;
  const reflected = elements(environment.props.children);
  const direct = all.filter((element) => !reflected.includes(element));
  return { direct, reflected };
}
function broadLights(declared: Element[]) {
  return declared.filter(
    (element) =>
      element.type === "rectAreaLight" &&
      element.props.width >= 4.5 &&
      element.props.height >= 2,
  );
}

describe("After hours body illumination", () => {
  it("lights both ends of the bay with broad downward emitters instead of relying on vehicle lamps", () => {
    const { direct } = declaration();
    const lights = broadLights(direct);
    expect(
      lights,
      "Front and rear black bodywork need broad source coverage",
    ).toHaveLength(2);
    expect(
      lights.map(({ props }) => Math.sign(props.position[2])).sort(),
    ).toEqual([-1, 1]);
    for (const { props } of lights) {
      expect(Math.abs(props.position[2])).toBeGreaterThan(5);
      expect(Math.abs(props.position[2])).toBeLessThan(9);
      expect(props.position[1]).toBeGreaterThan(4);
      const emission = new Vector3(0, 0, -1).applyEuler(
        new Euler(...props.rotation),
      );
      expect(emission.y).toBeLessThan(-0.99);
      expect(props.intensity * props.width * props.height).toBeGreaterThan(50);
    }
  });

  it("keeps direct lights and reflection sources on real luminous diffusers", () => {
    const venue = createVenue("night", textures());
    const { direct, reflected } = declaration();
    const lights = broadLights(direct);
    expect(lights).toHaveLength(2);
    const diffusers: Mesh[] = [];
    venue.group.traverse((object) => {
      if (
        object instanceof Mesh &&
        object.name.startsWith("luminaire-night-broad-diffuser")
      )
        diffusers.push(object);
    });
    expect(diffusers).toHaveLength(2);
    for (const { props } of lights) {
      const position = new Vector3(...props.position);
      const diffuser = diffusers.find(
        (mesh) => Math.sign(mesh.position.z) === Math.sign(position.z),
      )!;
      const bounds = new Box3().setFromObject(diffuser);
      const dimensions = bounds.getSize(new Vector3());
      expect(bounds.distanceToPoint(position)).toBeLessThan(0.03);
      expect(dimensions.x).toBeCloseTo(props.width, 2);
      expect(dimensions.z).toBeCloseTo(props.height, 2);
      expect(
        (diffuser.material as MeshStandardMaterial).emissiveIntensity,
      ).toBeGreaterThan(1);
      const reflectedLight = broadLights(reflected).find(
        ({ props: candidate }) => candidate.position[2] === position.z,
      )!;
      expect(reflectedLight).toBeDefined();
      expect(reflectedLight.props.position[1]).toBeCloseTo(position.y - 0.8);
      expect(reflectedLight.props.intensity).toBe(props.intensity);
      const card = reflected.find(
        (element) =>
          element.type === Lightformer &&
          element.props.position[2] === position.z,
      )!;
      expect(card).toBeDefined();
      expect(card.props.scale.slice(0, 2)).toEqual([props.width, props.height]);
      expect(card.props.position[1]).toBeCloseTo(position.y - 0.8, 1);
      expect(card.props.intensity).toBe(props.intensity);
    }
    venue.dispose();
  });

  it("cuts the additional overhead fixtures away for inspection and releases their geometry", () => {
    const venue = createVenue("night", textures());
    const fixtures: Mesh[] = [];
    venue.group.traverse((object) => {
      if (
        object instanceof Mesh &&
        object.name.startsWith("luminaire-night-broad")
      )
        fixtures.push(object);
    });
    expect(fixtures.length).toBeGreaterThanOrEqual(4);
    const disposed = fixtures.map((mesh) => vi.spyOn(mesh.geometry, "dispose"));
    setVenueInspectionCutaway(venue.group, 4);
    expect(fixtures.every((mesh) => !mesh.visible)).toBe(true);
    expect(venue.group.getObjectByName("driving-surface")!.visible).toBe(true);
    setVenueInspectionCutaway(venue.group, 2);
    expect(fixtures.every((mesh) => mesh.visible)).toBe(true);
    venue.dispose();
    disposed.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });

  it.each(["studio", "gallery", "forest", "coast"] as const)(
    "does not add night fixtures to %s",
    (environment) => {
      const venue = createVenue(environment, textures());
      const names: string[] = [];
      venue.group.traverse((object) => names.push(object.name));
      expect(
        names.some((name) => name.startsWith("luminaire-night-broad")),
      ).toBe(false);
      venue.dispose();
    },
  );
});

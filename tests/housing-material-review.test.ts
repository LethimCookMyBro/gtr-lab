import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
} from "three";
import { createHousingReview } from "../qa/renderer/housingReview";

function specimen(physical = false) {
  const root = new Group();
  const glass = physical
    ? new MeshPhysicalMaterial({ transmission: 0.5 })
    : new MeshStandardMaterial();
  glass.name = "Glass";
  glass.opacity = 0.888;
  glass.transparent = true;
  glass.metalness = 0.4;
  glass.roughness = 0;
  const geometry = new BoxGeometry();
  const housing = new Mesh(geometry, glass);
  housing.name = "Headlights001_Glass_0";
  housing.userData.name = "Headlights.001_Glass_0";
  const lens = new Mesh(geometry, glass);
  lens.name = "Headlights_Glass_0";
  root.add(housing, lens);
  return { root, glass, geometry, housing, lens };
}

describe("isolated housing-only material experiment", () => {
  it("changes only the exact housing to an independent opaque dark material", () => {
    const s = specimen();
    const review = createHousingReview(s.root);
    review.setCandidate(true);
    expect(s.housing.material.opacity).toBe(1);
    expect(s.housing.material.transparent).toBe(false);
    expect(s.housing.material.metalness).toBe(0);
    expect(s.housing.material.roughness).toBe(0.28);
    expect(s.housing.material.emissiveIntensity).toBe(0);
    expect(s.housing.material.color.r).toBeCloseTo(0.012);
    expect(s.housing.material).not.toBe(s.glass);
    expect(s.lens.material).toBe(s.glass);
    expect(s.glass.opacity).toBe(0.888);
    expect(s.housing.geometry).toBe(s.geometry);
    expect(review.count).toBe(1);
  });
  it("restores the exact shared baseline material on repeated A/B changes and disposal", () => {
    const s = specimen();
    const review = createHousingReview(s.root);
    review.setCandidate(true);
    const candidate = s.housing.material;
    review.setCandidate(false);
    expect(s.housing.material).toBe(s.glass);
    review.setCandidate(true);
    expect(s.housing.material).toBe(candidate);
    review.dispose();
    expect(s.housing.material).toBe(s.glass);
    expect(s.lens.material).toBe(s.glass);
  });
  it("does not apply the housing experiment to close names or unrelated materials", () => {
    const s = specimen();
    s.housing.name += "_other";
    delete s.housing.userData.name;
    const review = createHousingReview(s.root);
    review.setCandidate(true);
    expect(review.count).toBe(0);
    expect(s.housing.material).toBe(s.glass);
    s.housing.name = "Headlights001_Glass_0";
    s.glass.name = "Body";
    const other = createHousingReview(s.root);
    other.setCandidate(true);
    expect(other.count).toBe(0);
    expect(s.housing.material).toBe(s.glass);
  });
  it("removes transmission only on a physical housing clone and preserves culling", () => {
    const s = specimen(true);
    const review = createHousingReview(s.root);
    review.setCandidate(true);
    expect((s.housing.material as MeshPhysicalMaterial).transmission).toBe(0);
    expect((s.lens.material as MeshPhysicalMaterial).transmission).toBe(0.5);
    expect(s.housing.material.side).toBe(s.glass.side);
  });
});

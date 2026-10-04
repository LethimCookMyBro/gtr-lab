import { createCoastalWater } from "../src/components/three/CoastalWater";
import { expect, it } from "vitest";
import {
  coastBend,
  createCoastalOceanGeometry,
} from "../src/components/three/coastalGeometry";
it("ends the real ocean beneath the retaining wall instead of flooding scanned inland depressions", () => {
  const geometry = createCoastalOceanGeometry();
  const p = geometry.attributes.position;
  expect(p.count).toBeGreaterThan(500);
  for (let i = 0; i < p.count; i++) {
    const worldX = p.getX(i) - 650;
    const worldZ = -p.getY(i);
    expect(worldX).toBeLessThanOrEqual(-12.65 + coastBend(worldZ) + 0.001);
    expect(p.getZ(i)).toBe(0);
  }
  for (let i = 1; i < p.count; i += 2) {
    expect(p.getX(i) - 650).toBeCloseTo(-12.65 + coastBend(-p.getY(i)), 3);
  }
  expect(geometry.boundingBox).not.toBeNull();
  expect(geometry.boundingSphere).not.toBeNull();
  geometry.dispose();
});

it("uses the bounded geometry in the visible reflection surface", () => {
  const water = createCoastalWater(256);
  expect(water.water.geometry.attributes.position.count).toBeGreaterThan(500);
  water.dispose();
});

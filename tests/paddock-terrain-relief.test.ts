import { describe, expect, it, vi } from "vitest";
import {
  Box3,
  DataTexture,
  Mesh,
  Raycaster,
  RedFormat,
  Texture,
  Vector3,
} from "three";
import { createVenue } from "../src/components/three/venueGeometry";
import type { SurfaceTextures } from "../src/components/three/venueGeometry";

function source(value: number | ((x: number, y: number) => number)) {
  const data = new Uint8Array(16 * 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      data[y * 16 + x] = typeof value === "number" ? value : value(x, y);
  const texture = new DataTexture(data, 16, 16, RedFormat);
  texture.flipY = true;
  return texture;
}
function venue(height: Texture) {
  const maps = () =>
    [new Texture(), new Texture(), new Texture()] as [
      Texture,
      Texture,
      Texture,
    ];
  const surfaces: SurfaceTextures = {
    floor: maps(),
    wall: maps(),
    asphalt: maps(),
    rock: [...maps(), height],
  };
  const result = createVenue("forest", surfaces);
  const terrain = result.group.children.filter(
    (object) => object.name === "landscape-terrain",
  ) as Mesh[];
  return { ...result, terrain };
}

describe("scanned Test paddock land", () => {
  it("uses the calibrated 5 metre relief on both sides without duplicated geometry", () => {
    const low = venue(source(0)),
      high = venue(source(255));
    expect(low.terrain).toHaveLength(2);
    expect(low.terrain[0].geometry).toBe(low.terrain[1].geometry);
    for (let side = 0; side < 2; side++) {
      const a = low.terrain[side].geometry.attributes.position,
        b = high.terrain[side].geometry.attributes.position;
      expect(a.count).toBeGreaterThan(40000);
      expect(a.count).toBeLessThan(85000);
      let measured = 0;
      for (let i = 0; i < a.count; i += 43) {
        if (a.getX(i) > -78 && Math.abs(a.getZ(i)) < 70) {
          expect(b.getY(i) - a.getY(i)).toBeCloseTo(5, 5);
          measured++;
        }
      }
      expect(measured).toBeGreaterThan(500);
    }
    low.dispose();
    high.dispose();
  });
  it("starts at the actual 40 metre paved edges and keeps buildings and the 11 metre orbit clear", () => {
    const { group, terrain, dispose } = venue(
      source((x, y) => ((x + y) % 2 ? 0 : 255)),
    );
    expect(terrain.map((mesh) => mesh.position.x)).toEqual([-130, 130]);
    for (const mesh of terrain) {
      expect(mesh.position.z).toBe(0);
      const bounds = new Box3().setFromObject(mesh);
      expect(
        Math.min(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
      ).toBeCloseTo(39.975, 4);
      group.traverse((object) => {
        if (object instanceof Mesh && object.name === "pit-building")
          expect(bounds.intersectsBox(new Box3().setFromObject(object))).toBe(
            false,
          );
      });
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 113) {
        const world = new Vector3()
          .fromBufferAttribute(p, i)
          .applyMatrix4(mesh.matrixWorld);
        expect(Math.hypot(world.x, world.z)).toBeGreaterThan(39.9);
      }
    }
    dispose();
  });
  it("has no gaps or raised ridges where either side joins the full paved edge", () => {
    const { group, dispose } = venue(source((x, y) => (x * 19 + y * 31) % 256));
    for (const sign of [-1, 1])
      for (const z of [-575, -62.5, -22.5, 0, 22.5, 62.5, 575])
        for (const dx of [-0.03, -0.01, 0, 0.03, 0.3]) {
          const hits = new Raycaster(
            new Vector3(sign * (40 + dx), 30, z),
            new Vector3(0, -1, 0),
          ).intersectObject(group, true);
          expect(
            hits.length,
            `paddock seam ${sign},${z},${dx}`,
          ).toBeGreaterThan(0);
          expect(hits[0].point.y).toBeGreaterThan(-0.01);
          expect(hits[0].point.y).toBeLessThan(0.03);
        }
    dispose();
  });
  it("keeps source-aligned 50 metre UVs and upward normals when the second side is rotated", () => {
    const { terrain, dispose } = venue(
      source((x, y) => (x * 31 + y * 13) % 256),
    );
    for (const mesh of terrain) {
      const p = mesh.geometry.attributes.position,
        uv = mesh.geometry.attributes.uv,
        n = mesh.geometry.attributes.normal;
      let sloped = 0;
      for (let i = 0; i < p.count; i += 79) {
        expect(uv.getX(i)).toBeCloseTo(p.getX(i) / 50, 5);
        expect(uv.getY(i)).toBeCloseTo(p.getZ(i) / 50, 5);
        const worldNormal = new Vector3()
          .fromBufferAttribute(n, i)
          .transformDirection(mesh.matrixWorld);
        expect(worldNormal.y).toBeGreaterThan(0);
        if (worldNormal.y < 0.9) sloped++;
      }
      expect(sloped).toBeGreaterThan(20);
    }
    dispose();
  });
  it("disposes shared terrain geometry once while keeping cached source maps intact", () => {
    const height = source(145),
      { terrain, dispose } = venue(height);
    const geometryDispose = vi.spyOn(terrain[0].geometry, "dispose"),
      sourceDispose = vi.spyOn(height, "dispose");
    dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(sourceDispose).not.toHaveBeenCalled();
  });
  it("rejects an unreadable supplied height image instead of silently retaining flat paddock land", () => {
    expect(() => venue(new Texture())).toThrow(
      /displacement.*readable pixels/i,
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  DataTexture,
  Mesh,
  Raycaster,
  RedFormat,
  Texture,
  UnsignedByteType,
  Vector3,
} from "three";
import { createVenue } from "../src/components/three/venueGeometry";
import type { SurfaceTextures } from "../src/components/three/venueGeometry";

function heightTexture(value: number | ((x: number, y: number) => number)) {
  const data = new Uint8Array(16 * 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      data[y * 16 + x] = typeof value === "number" ? value : value(x, y);
  const texture = new DataTexture(data, 16, 16, RedFormat, UnsignedByteType);
  texture.flipY = true;
  return texture;
}
function makeVenue(height?: Texture) {
  const triple = () =>
    [new Texture(), new Texture(), new Texture()] as [
      Texture,
      Texture,
      Texture,
    ];
  const textures = {
    floor: triple(),
    wall: triple(),
    asphalt: triple(),
    rock: [...triple(), height],
  } as SurfaceTextures;
  const venue = createVenue("coast", textures);
  return {
    ...venue,
    terrain: venue.group.getObjectByName("landscape-terrain") as Mesh,
  };
}

describe("source-calibrated coastal terrain", () => {
  it("uses exactly the official 5 metre height range away from the protected road edge", () => {
    const low = makeVenue(heightTexture(0)),
      high = makeVenue(heightTexture(255));
    const a = low.terrain.geometry.attributes.position,
      b = high.terrain.geometry.attributes.position;
    let changed = 0;
    for (let i = 0; i < a.count; i++) {
      const inland =
        a.getX(i) +
        90 -
        Math.sign(a.getZ(i) - 10) *
          Math.min(80, Math.max(0, Math.abs(a.getZ(i) - 10) - 12) ** 2 * 0.003);
      expect(b.getX(i)).toBe(a.getX(i));
      expect(b.getZ(i)).toBe(a.getZ(i));
      if (inland > 12 && Math.abs(a.getZ(i)) < 70) {
        expect(b.getY(i) - a.getY(i)).toBeCloseTo(5, 5);
        changed++;
      }
      if (inland < 0.01) expect(b.getY(i) - a.getY(i)).toBe(0);
    }
    expect(changed).toBeGreaterThan(1000);
    low.dispose();
    high.dispose();
  });
  it("keeps one continuous 50 metre XZ UV chart even on steep real relief", () => {
    const { terrain, dispose } = makeVenue(
      heightTexture((x) => (x % 2 ? 255 : 0)),
    );
    const p = terrain.geometry.attributes.position,
      uv = terrain.geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(p.getX(i) / 50, 5);
      expect(uv.getY(i)).toBeCloseTo(p.getZ(i) / 50, 5);
    }
    dispose();
  });
  it("samples source features into bounded sub-metre near-ground geometry and correct physical normals", () => {
    const { terrain, dispose } = makeVenue(
      heightTexture((x, y) => (x * 31 + y * 13) % 256),
    );
    const g = terrain.geometry,
      p = g.attributes.position,
      n = g.attributes.normal;
    expect(p.count).toBeGreaterThan(40000);
    expect(p.count).toBeLessThan(85000);
    expect(g.index!.count / 3).toBeLessThan(170000);
    let slopes = 0;
    for (let i = 0; i < p.count; i++) {
      expect(Number.isFinite(n.getY(i))).toBe(true);
      if (n.getY(i) < 0.9) slopes++;
    }
    expect(slopes).toBeGreaterThan(200);
    expect(g.boundingBox).not.toBeNull();
    expect(g.boundingSphere).not.toBeNull();
    expect(terrain.castShadow).toBe(true);
    dispose();
  });
  it("does not move the road seam or intrude inside the 11 metre camera orbit", () => {
    const { group, terrain, dispose } = makeVenue(
      heightTexture((x, y) => ((x + y) % 2 ? 0 : 255)),
    );
    group.updateMatrixWorld(true);
    const p = terrain.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const world = new Vector3()
        .fromBufferAttribute(p, i)
        .applyMatrix4(terrain.matrixWorld);
      expect(Math.hypot(world.x, world.z)).toBeGreaterThan(13.9);
    }
    for (const z of [-175, -62.5, -22.5, 0, 22.5, 62.5, 175, 177.5]) {
      const edge =
        14 +
        Math.sign(z) * Math.min(80, Math.max(0, Math.abs(z) - 12) ** 2 * 0.003);
      for (const dx of [-0.03, -0.01, 0, 0.03, 0.3]) {
        const hits = new Raycaster(
          new Vector3(edge + dx, 30, z),
          new Vector3(0, -1, 0),
        ).intersectObject(group, true);
        expect(hits.length, `road/terrain seam ${z},${dx}`).toBeGreaterThan(0);
        expect(hits[0].point.y).toBeGreaterThan(-0.05);
        expect(hits[0].point.y).toBeLessThan(0.1);
      }
    }
    dispose();
  });
  it("does not mutate or dispose the cached source height texture", () => {
    const source = heightTexture(145);
    let disposed = false;
    source.addEventListener("dispose", () => {
      disposed = true;
    });
    const image = source.image;
    const { dispose } = makeVenue(source);
    dispose();
    expect(disposed).toBe(false);
    expect(source.image).toBe(image);
  });
  it("aligns top-origin height rows with flipY and repeats negative source UVs across the road bend", () => {
    const image = new DataTexture(
      new Uint8Array([255, 255, 0, 0]),
      2,
      2,
      RedFormat,
    );
    image.flipY = true;
    const flipped = makeVenue(image);
    image.flipY = false;
    const unflipped = makeVenue(image);
    function yAt(terrain: Mesh, z: number) {
      const p = terrain.geometry.attributes.position;
      const bend =
        Math.sign(z - 10) *
        Math.min(80, Math.max(0, Math.abs(z - 10) - 12) ** 2 * 0.003);
      for (let i = 0; i < p.count; i++)
        if (p.getZ(i) === z && Math.abs(p.getX(i) - (-60 + bend)) < 0.00001)
          return p.getY(i);
      throw new Error("Expected test grid point was absent");
    }
    // These are texel centres: V=.25 is the image's bottom row with flipY=true.
    // +/-50 m repeats and negative UVs must select exactly the same photographed row.
    for (const z of [12.5, 62.5]) {
      expect(yAt(flipped.terrain, z)).toBeCloseTo(2.6 + (0 - 0.57) * 5, 5);
      expect(yAt(unflipped.terrain, z)).toBeCloseTo(2.6 + (1 - 0.57) * 5, 5);
    }
    for (const z of [-12.5, -62.5]) {
      expect(yAt(flipped.terrain, z)).toBeCloseTo(2.6 + (1 - 0.57) * 5, 5);
      expect(yAt(unflipped.terrain, z)).toBeCloseTo(2.6 + (0 - 0.57) * 5, 5);
    }
    flipped.dispose();
    unflipped.dispose();
  });
  it("fails explicitly when a supplied height texture has no readable image", () => {
    expect(() => makeVenue(new Texture())).toThrow(
      /displacement.*readable pixels/i,
    );
  });
});

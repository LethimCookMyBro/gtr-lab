import assert from "node:assert/strict";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  DataTexture,
  Frustum,
  Group,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Vector3,
} from "three";
import { batchStaticStudioMeshes } from "../src/components/three/staticStudioBatching";
import {
  createVenue,
  setVenueInspectionCutaway,
} from "../src/components/three/venueGeometry";
import { configureStageLayers } from "../src/components/three/stageLayers";

const captured = vi.hoisted(() => ({
  before: null as Group | null,
  source: [] as BufferGeometry[],
  owned: null as Set<BufferGeometry> | null,
}));
vi.mock(
  "../src/components/three/staticStudioBatching",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../src/components/three/staticStudioBatching")
      >();
    return {
      ...actual,
      batchStaticStudioMeshes: (
        ...args: Parameters<typeof actual.batchStaticStudioMeshes>
      ) => {
        captured.before = args[0].clone(true);
        captured.source = [...args[1]];
        captured.owned = args[1];
        return actual.batchStaticStudioMeshes(...args);
      },
    };
  },
);
beforeEach(() => {
  captured.before = null;
  captured.source = [];
  captured.owned = null;
});
const maps = () => {
  const texture = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  const triple = [texture, texture, texture] as [
    DataTexture,
    DataTexture,
    DataTexture,
  ];
  return { floor: triple, wall: triple, asphalt: triple, rock: triple };
};
const meshes = (group: Group) => {
  const result: Mesh[] = [];
  group.traverse((object) => {
    if (object instanceof Mesh) result.push(object);
  });
  return result;
};
const triangles = (mesh: Mesh) =>
  (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
const overhead = (mesh: Mesh) =>
  /^(overhead-|luminaire-|perimeter-roof|gallery-skylight)/.test(mesh.name);
// Independent CPU expansion of every triangle and attribute after world transform.
// Keys use a coarse 0.1 mm position grid only to pair faces; paired numbers are
// then compared at 2 micrometres, normals at 1e-7, and UVs exactly.
function triangleMap(group: Group) {
  group.updateMatrixWorld(true);
  const result = new Map<
    string,
    {
      positions: number[];
      normals: number[];
      uv: number[];
      tangents: number[];
    }[]
  >();
  for (const mesh of meshes(group)) {
    const geometry = mesh.geometry;
    const p = geometry.attributes.position,
      n = geometry.attributes.normal,
      uv = geometry.attributes.uv;
    const normal = new Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (
      let start = 0;
      start < (geometry.index?.count ?? p.count);
      start += 3
    ) {
      const row = {
        positions: [] as number[],
        normals: [] as number[],
        uv: [] as number[],
        tangents: [] as number[],
      };
      for (let k = 0; k < 3; k++) {
        const i = geometry.index?.getX(start + k) ?? start + k;
        row.positions.push(
          ...new Vector3()
            .fromBufferAttribute(p, i)
            .applyMatrix4(mesh.matrixWorld)
            .toArray(),
        );
        row.normals.push(
          ...new Vector3()
            .fromBufferAttribute(n, i)
            .applyMatrix3(normal)
            .normalize()
            .toArray(),
        );
        row.uv.push(uv.getX(i), uv.getY(i));
        if (geometry.attributes.tangent) {
          const tangent = geometry.attributes.tangent;
          row.tangents.push(
            ...new Vector3()
              .fromBufferAttribute(tangent, i)
              .transformDirection(mesh.matrixWorld)
              .toArray(),
            tangent.getW(i),
          );
        }
      }
      const key = JSON.stringify([
        (mesh.material as MeshStandardMaterial).uuid,
        mesh.castShadow,
        mesh.receiveShadow,
        mesh.layers.mask,
        mesh.renderOrder,
        mesh.visible,
        overhead(mesh),
        row.positions.map((v) => Math.round(v * 1e4)),
        row.uv,
      ]);
      const entries = result.get(key) ?? [];
      entries.push(row);
      result.set(key, entries);
    }
  }
  return result;
}
function equivalent(before: Group, after: Group) {
  const a = triangleMap(before),
    b = triangleMap(after);
  assert.deepEqual([...b.keys()].sort(), [...a.keys()].sort());
  let positionError = 0,
    normalError = 0,
    tangentError = 0;
  for (const [key, rows] of a) {
    const actual = b.get(key)!;
    assert.equal(actual.length, rows.length);
    rows.forEach((row, i) => {
      row.positions.forEach((value, n) => {
        positionError = Math.max(
          positionError,
          Math.abs(actual[i].positions[n] - value),
        );
      });
      row.normals.forEach((value, n) => {
        normalError = Math.max(
          normalError,
          Math.abs(actual[i].normals[n] - value),
        );
      });
      assert.deepEqual(actual[i].uv, row.uv);
      assert.equal(actual[i].tangents.length, row.tangents.length);
      row.tangents.forEach((value, n) => {
        tangentError = Math.max(
          tangentError,
          Math.abs(actual[i].tangents[n] - value),
        );
        if (n % 4 === 3) assert.equal(actual[i].tangents[n], value);
      });
    });
  }
  expect(positionError).toBeLessThan(2e-6);
  expect(normalError).toBeLessThan(1e-7);
  expect(tangentError).toBeLessThan(1e-7);
  const aBounds = new Box3().setFromObject(before, true),
    bBounds = new Box3().setFromObject(after, true);
  for (const edge of ["min", "max"] as const)
    expect(aBounds[edge].distanceTo(bBounds[edge])).toBeLessThan(2e-6);
}
function visibleCounts(group: Group, camera: PerspectiveCamera) {
  group.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const frustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    ),
  );
  const visible: Mesh[] = [];
  group.traverseVisible((object) => {
    if (
      object instanceof Mesh &&
      object.layers.test(camera.layers) &&
      (!object.frustumCulled || frustum.intersectsObject(object))
    )
      visible.push(object);
  });
  return {
    calls: visible.length,
    triangles: visible.reduce((sum, mesh) => sum + triangles(mesh), 0),
  };
}
it("preserves the complete authored studio triangle/material/flags multiset and exact silhouette within Float32 baking tolerance", () => {
  const venue = createVenue("studio", maps());
  const before = captured.before!;
  expect(meshes(before)).toHaveLength(414);
  expect(meshes(venue.group)).toHaveLength(338);
  expect(meshes(venue.group).reduce((n, m) => n + triangles(m), 0)).toBe(15394);
  equivalent(before, venue.group);
  const batches = meshes(venue.group).filter(
    (m) => m.name === "static-studio-door-slats",
  );
  expect(batches).toHaveLength(4);
  expect(batches.map(triangles)).toEqual([180, 180, 180, 180]);
  for (const name of ["floor-expansion-joint", "bay-line"]) {
    expect(meshes(venue.group).filter((m) => m.name === name)).toHaveLength(1);
    const old = meshes(before).filter((m) => m.name === name);
    const batch = venue.group.getObjectByName(name) as Mesh;
    expect(
      old.every(
        (m) =>
          m.material === batch.material &&
          m.castShadow === batch.castShadow &&
          m.receiveShadow === batch.receiveShadow,
      ),
    ).toBe(true);
    expect(batch.geometry.groups).toEqual([]); // One unchanged scalar material, one draw.
    expect((batch.material as MeshStandardMaterial).polygonOffset).toBe(true);
  }
  const camera = new PerspectiveCamera(34, 1440 / 744, 0.02, 700);
  camera.position.set(4.275, 1.8675, 5.1);
  camera.lookAt(0, 0.72, 0);
  configureStageLayers(before, camera);
  configureStageLayers(venue.group, camera);
  expect(visibleCounts(before, camera)).toEqual({
    calls: 178,
    triangles: 6994,
  });
  expect(visibleCounts(venue.group, camera)).toEqual({
    calls: 116,
    triangles: 6994,
  });
  venue.dispose();
});
it("keeps cutaway, stage layers and reflection clone semantics through repeated inspection transitions", () => {
  const venue = createVenue("studio", maps());
  const original = captured.before!;
  const copy = venue.group.clone(true);
  copy.position.y = -0.8;
  const camera = new PerspectiveCamera();
  configureStageLayers(venue.group, camera);
  expect(meshes(venue.group).every((m) => m.layers.mask === 4)).toBe(true);
  const allOverheads = meshes(venue.group).filter(overhead);
  expect(allOverheads).toHaveLength(meshes(original).filter(overhead).length);
  for (const height of [3.8, 3.81, 5, 3.8, 4, 2]) {
    expect(setVenueInspectionCutaway(venue.group, height)).toBe(
      setVenueInspectionCutaway(original, height),
    );
    expect(allOverheads.every((m) => m.visible === height <= 3.8)).toBe(true);
    expect(
      meshes(venue.group)
        .filter((m) => !overhead(m))
        .every((m) => m.visible),
    ).toBe(true);
    expect(meshes(copy).every((m) => m.visible)).toBe(true);
  }
  expect(meshes(copy).map((m) => m.geometry)).toEqual(
    meshes(venue.group).map((m) => m.geometry),
  );
  venue.dispose();
});
it("owns final resources exactly once and releases replaced geometry before mounting; repeat dispose still releases remounted uploads", () => {
  const events: BufferGeometry[] = [];
  const original = BufferGeometry.prototype.dispose;
  const spy = vi
    .spyOn(BufferGeometry.prototype, "dispose")
    .mockImplementation(function (this: BufferGeometry) {
      events.push(this);
      return original.call(this);
    });
  const sources = maps();
  const textureDispose = vi.spyOn(sources.floor[0], "dispose");
  const venue = createVenue("studio", sources);
  const live = new Set(meshes(venue.group).map((m) => m.geometry));
  expect(captured.owned).toEqual(live);
  const replaced = captured.source.filter((g) => !live.has(g));
  expect(replaced).toHaveLength(82);
  expect(
    replaced.every((g) => events.filter((e) => e === g).length === 1),
  ).toBe(true);
  expect([...live].every((g) => !events.includes(g))).toBe(true);
  const materials = new Set(
    meshes(venue.group).map((m) => m.material as MeshStandardMaterial),
  );
  const pieces = events.filter(
    (g) => !captured.source.includes(g) && !live.has(g),
  );
  expect(pieces).toHaveLength(82);
  expect(new Set(pieces).size).toBe(82);
  const materialDisposals = [...materials].map((m) => vi.spyOn(m, "dispose"));
  venue.dispose();
  venue.dispose();
  expect(
    [...live].every((g) => events.filter((e) => e === g).length === 2),
  ).toBe(true);
  expect(
    replaced.every((g) => events.filter((e) => e === g).length === 1),
  ).toBe(true);
  expect(materialDisposals.every((s) => s.mock.calls.length === 2)).toBe(true);
  expect(textureDispose).not.toHaveBeenCalled();
  spy.mockRestore();
  materialDisposals.forEach((s) => s.mockRestore());
});
it.each(["gallery", "night", "forest", "coast"] as const)(
  "never batches the %s environment",
  (environment) => {
    const venue = createVenue(environment, maps());
    expect(captured.before).toBeNull();
    venue.dispose();
  },
);
describe("conservative authored-group boundary", () => {
  function setup() {
    const group = new Group(),
      material = new MeshStandardMaterial();
    const a = new Mesh(new BoxGeometry(), material),
      b = new Mesh(new BoxGeometry(), material);
    group.add(a, b);
    b.position.x = 2;
    return { group, a, b, owned: new Set([a.geometry, b.geometry]) };
  }
  it.each([
    "negative",
    "transparent",
    "hidden",
    "different-material",
    "layer",
    "order",
    "shadow",
    "range",
    "callback",
    "hidden-parent",
  ])("leaves %s sources standalone", (reason) => {
    const { group, a, b, owned } = setup();
    if (reason === "negative") b.scale.x = -1;
    if (reason === "transparent") a.material.transparent = true;
    if (reason === "hidden") b.visible = false;
    if (reason === "different-material") b.material = a.material.clone();
    if (reason === "layer") b.layers.set(2);
    if (reason === "order") b.renderOrder = 3;
    if (reason === "shadow") b.castShadow = true;
    if (reason === "range") b.geometry.setDrawRange(0, 3);
    if (reason === "callback") b.onBeforeRender = () => {};
    if (reason === "hidden-parent") {
      const parent = new Group();
      group.add(parent);
      parent.add(b);
      parent.visible = false;
    }
    batchStaticStudioMeshes(group, owned, [[a, b]]);
    expect(meshes(group)).toEqual([a, b]);
    expect(owned).toEqual(new Set([a.geometry, b.geometry]));
  });
  it("preserves arbitrary world transforms, normals, UVs and tangent handedness on positive-scale groups", () => {
    const { group, a, b, owned } = setup();
    for (const m of [a, b]) m.geometry.computeTangents();
    group.position.set(5, 3, -2);
    group.rotation.y = 0.42;
    a.rotation.set(0.2, 0.5, -0.7);
    a.scale.set(1.4, 0.7, 2);
    b.rotation.set(0.4, -0.7, 0.6);
    b.scale.set(0.9, 2, 0.6);
    group.updateMatrixWorld(true);
    const before = group.clone(true);
    batchStaticStudioMeshes(group, owned, [[a, b]]);
    // Expected direct baking is Float32; world position tolerance allows root transform.
    equivalent(before, group);
    const merged = meshes(group)[0].geometry;
    expect(merged.attributes.tangent.count).toBe(
      a.geometry.attributes.tangent.count + b.geometry.attributes.tangent.count,
    );
    for (let i = 0; i < merged.attributes.tangent.count; i++)
      expect(merged.attributes.tangent.getW(i)).toBe(1);
  });
  it("does not dispose a source geometry still shared by an excluded object", () => {
    const { group, a, b, owned } = setup();
    const excluded = new Mesh(a.geometry, a.material);
    excluded.visible = false;
    group.add(excluded);
    const disposal = vi.spyOn(a.geometry, "dispose");
    batchStaticStudioMeshes(group, owned, [[a, b]]);
    expect(disposal).not.toHaveBeenCalled();
    expect(owned.has(a.geometry)).toBe(true);
    expect(meshes(group)).toContain(excluded);
    for (let mount = 0; mount < 2; mount++) owned.forEach((g) => g.dispose());
    expect(disposal).toHaveBeenCalledTimes(2);
  });
});

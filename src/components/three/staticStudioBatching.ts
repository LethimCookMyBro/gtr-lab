import {
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Factory-only, once before mounting/reflection cloning: merge explicitly authored
 * immutable opaque groups (each door's slats, floor joints, bay lines). No search
 * for arbitrary meshes, material replacement, welding, or triangle reduction.
 * The slightly larger bounds trade finer culling for fewer submissions; the GPU
 * still clips the same world-space faces. Mirrored/customized meshes stay intact.
 */
export function batchStaticStudioMeshes(
  root: Group,
  ownedGeometries: Set<BufferGeometry>,
  groups: readonly (readonly Mesh[])[],
) {
  const local = new Matrix4();
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const removed = new Set<BufferGeometry>();
  const signature = (mesh: Mesh) =>
    [
      mesh.castShadow,
      mesh.receiveShadow,
      mesh.layers.mask,
      mesh.renderOrder,
      mesh.frustumCulled,
      Boolean(mesh.geometry.index),
      Object.entries(mesh.geometry.attributes)
        .map(
          ([name, a]) =>
            `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`,
        )
        .sort()
        .join(","),
    ].join("|");
  const eligible = (object: Mesh) => {
    const { geometry, material } = object;
    if (
      !(material instanceof MeshStandardMaterial) ||
      !object.visible ||
      material.transparent ||
      material.opacity !== 1 ||
      ("transmission" in material && material.transmission !== 0) ||
      object.type !== "Mesh" ||
      object.morphTargetInfluences?.length ||
      Object.keys(geometry.morphAttributes).length ||
      object.animations.length ||
      object.children.length ||
      object.customDepthMaterial ||
      object.customDistanceMaterial ||
      object.onBeforeRender !== Object3D.prototype.onBeforeRender ||
      object.onAfterRender !== Object3D.prototype.onAfterRender ||
      geometry.drawRange.start !== 0 ||
      geometry.drawRange.count !== Infinity ||
      !ownedGeometries.has(geometry)
    )
      return false;
    let parent = object.parent;
    for (; parent && parent !== root; parent = parent.parent) {
      if (
        !parent.visible ||
        parent.animations.length ||
        parent.renderOrder !== 0
      )
        return false;
    }
    // Negative determinants need winding/tangent repair; do not batch them.
    return (
      parent === root &&
      local.multiplyMatrices(inverseRoot, object.matrixWorld).determinant() >
        1e-12
    );
  };
  for (const sources of groups) {
    const first = sources[0];
    if (
      sources.length < 2 ||
      new Set(sources).size !== sources.length ||
      !sources.every(
        (source) =>
          eligible(source) &&
          source.material === first.material &&
          signature(source) === signature(first),
      )
    )
      continue;
    const pieces: BufferGeometry[] = [];
    let merged: BufferGeometry | null = null;
    try {
      for (const source of sources) {
        const piece = source.geometry.clone();
        pieces.push(piece);
        // Scalar materials render the complete draw range, ignoring groups.
        piece.clearGroups();
        piece.applyMatrix4(
          local.multiplyMatrices(inverseRoot, source.matrixWorld),
        );
      }
      merged = mergeGeometries(pieces, false);
    } finally {
      pieces.forEach((piece) => piece.dispose());
    }
    if (!merged) continue;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const batch = new Mesh(merged, first.material);
    batch.name = first.name || "static-studio-door-slats";
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.layers.mask = first.layers.mask;
    batch.renderOrder = first.renderOrder;
    batch.frustumCulled = first.frustumCulled;
    ownedGeometries.add(merged);
    root.add(batch);
    for (const source of sources) {
      source.removeFromParent();
      removed.add(source.geometry);
    }
  }
  // A geometry can be shared with an excluded mesh. Release only allocations
  // that no remaining object references; materials/maps keep the factory owner.
  const retained = new Set<BufferGeometry>();
  root.traverse((object) => {
    if (object instanceof Mesh) retained.add(object.geometry);
  });
  for (const geometry of removed)
    if (!retained.has(geometry)) {
      ownedGeometries.delete(geometry);
      geometry.dispose();
    }
  root.updateMatrixWorld(true);
}

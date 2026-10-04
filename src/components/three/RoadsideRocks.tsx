import { useMemo } from "react";
import { useGLTF } from "@react-three/drei/core/Gltf";
import { Box3, Group, Mesh, Vector3 } from "three";
import type { Object3D } from "three";

/** Original, hash-verified Poly Haven CC0 files; no runtime third-party requests. */
export const ROADSIDE_ROCKS_URL =
  "/environments/roadside/rock_moss_set_01_1k.gltf";

export type RoadsideRockInstance = {
  /** Ground-contact point in world metres, including any desired burial depth. */
  position: [number, number, number];
  /** Y-axis yaw in radians. Original scanned orientation is otherwise preserved. */
  rotation?: number;
  /** Uniform multiplier on the original real-world metre scale. Defaults to 1. */
  scale?: number;
  /** Six genuinely different scans, indexed 0–5; omitted variants cycle in order. */
  variant?: number;
};

/**
 * Share immutable geometry, UVs, materials and textures across lightweight clones.
 * Recenter each scan at its actual bottom, undoing the source's six-rock grid layout.
 * The returned group does not own shared glTF GPU resources and must not dispose them.
 */
export function createRoadsideRockInstances(
  scene: Object3D,
  instances: readonly RoadsideRockInstance[],
): Group {
  scene.updateMatrixWorld(true);
  const rocks: Mesh[] = [];
  scene.traverse((object) => {
    if (object instanceof Mesh) rocks.push(object);
  });
  const result = new Group();
  result.name = "scanned-roadside-rocks";
  if (!rocks.length) return result;
  instances.forEach((instance, index) => {
    const variant =
      (((instance.variant ?? index) % rocks.length) + rocks.length) %
      rocks.length;
    const source = rocks[variant];
    const rock = source.clone(false);
    // Preserve any authored root-axis or parent transforms when extracting the mesh.
    source.matrixWorld.decompose(rock.position, rock.quaternion, rock.scale);
    rock.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(rock);
    const center = bounds.getCenter(new Vector3());
    rock.position.sub(new Vector3(center.x, bounds.min.y, center.z));
    rock.castShadow = true;
    rock.receiveShadow = true;
    const placement = new Group();
    placement.name = `${source.name || "rock"}-${index}`;
    placement.position.fromArray(instance.position);
    placement.rotation.y = instance.rotation ?? 0;
    placement.scale.setScalar(instance.scale ?? 1);
    placement.add(rock);
    result.add(placement);
  });
  return result;
}

/** Mount only in outdoor scenes; the existing scene Suspense/error boundary owns loading. */
export function RoadsideRocks({
  instances,
}: {
  instances: readonly RoadsideRockInstance[];
}) {
  const { scene } = useGLTF(ROADSIDE_ROCKS_URL, false, false);
  const group = useMemo(
    () => createRoadsideRockInstances(scene, instances),
    [scene, instances],
  );
  return <primitive object={group} dispose={null} />;
}

/** Use alongside other venue cache clears when retrying a failed environment load. */
export function clearRoadsideRocks() {
  useGLTF.clear(ROADSIDE_ROCKS_URL);
}

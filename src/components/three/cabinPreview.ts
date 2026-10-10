import { DoubleSide, Mesh, MeshStandardMaterial, type Object3D } from "three";
import type { CameraView, VectorTuple } from "./sceneHelpers";
import type { HomeSceneLoadState } from "../home/homeReadiness";

export const CABIN_URL = "/models/r35-cabin-realism-0b72bab4.glb";
export const CABIN_SEATS = ["driver", "passenger", "rear"] as const;
export type CabinSeat = (typeof CABIN_SEATS)[number];
export type CabinPreviewState =
  | { phase: "closed" }
  | { phase: "loading"; request: number; progress: HomeSceneLoadState }
  | {
      phase: "active";
      request: number;
      seat: CabinSeat;
      resumeRotation: boolean;
    }
  | { phase: "error"; request: number; message: string };
export type CabinCameraView = CameraView & { near: number; far: number };
const nativeViews: Record<
  CabinSeat,
  Pick<CameraView, "position" | "target" | "fov">
> = {
  driver: {
    position: [0.42, 1.18, -0.235],
    target: [0.15, 0.84, 0.39],
    fov: 72,
  },
  passenger: {
    position: [-0.42, 1.18, -0.235],
    target: [-0.2, 0.9, 0.4],
    fov: 72,
  },
  rear: { position: [0.4, 1.12, -0.91], target: [0.25, 0.93, 0.3], fov: 78 },
};
/** The cabin and its eye points share the exterior's transform, never its own bounds. */
export function cabinCameraView(
  seat: CabinSeat,
  exterior: { scale: number; position: VectorTuple },
): CabinCameraView {
  const view = nativeViews[seat];
  const transform = (p: VectorTuple): VectorTuple => [
    p[0] * exterior.scale + exterior.position[0],
    p[1] * exterior.scale + exterior.position[1],
    p[2] * exterior.scale + exterior.position[2],
  ];
  return {
    ...view,
    position: transform(view.position),
    target: transform(view.target),
    near: 0.015 * exterior.scale,
    far: 50,
    minDistance: 0.05,
    maxDistance: 3,
  };
}
export const CABIN_WINDOW_NAMES = [
  "Door Window_Glass_0",
  "Doors.002_Glass_0",
  "Rear Window_Glass_0",
  "Back Body.001_Glass_0",
] as const;
function sourceName(object: Object3D): string {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (typeof node.userData.immutable_source_name === "string")
      return node.userData.immutable_source_name;
    if (typeof node.userData.name === "string") return node.userData.name;
  }
  return object.name;
}
/** Owns only four temporary, artistic thin-glass overrides, never shared source textures. */
export function overrideCabinWindows(root: Object3D): () => void {
  const found = new Map<string, Mesh[]>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const name = sourceName(object);
    if (!CABIN_WINDOW_NAMES.some((window) => window === name)) return;
    const meshes = found.get(name) ?? [];
    meshes.push(object);
    found.set(name, meshes);
  });
  if (found.size !== CABIN_WINDOW_NAMES.length)
    throw new Error(
      "The cabin window roles could not be verified. Return to the exterior and retry.",
    );
  const bindings = [...found.values()].flat().map((mesh) => {
    const original = mesh.material;
    const make = (source: MeshStandardMaterial | { name: string }) =>
      new MeshStandardMaterial({
        name: `${source.name}__CABIN_PREVIEW_THIN`,
        color: 0xf5f5f5,
        metalness: 0,
        roughness: 0.05,
        transparent: true,
        opacity: 0.16,
        depthTest: true,
        depthWrite: false,
        side: DoubleSide,
        forceSinglePass: true,
      });
    const owned = Array.isArray(original)
      ? original.map(make)
      : [make(original)];
    mesh.material = Array.isArray(original) ? owned : owned[0];
    return { mesh, original, owned };
  });
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const { mesh, original, owned } of bindings) {
      mesh.material = original;
      owned.forEach((material) => material.dispose());
    }
  };
}

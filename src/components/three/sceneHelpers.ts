export type VectorTuple = [number, number, number];
export type MaterialRoles = {
  paint: string[];
  headlights: string[];
  taillights: string[];
};
export type MaterialRole = keyof MaterialRoles;
export type Bounds = { min: VectorTuple; max: VectorTuple };
export type CameraView = {
  position: VectorTuple;
  target: VectorTuple;
  fov: number;
  minDistance: number;
  maxDistance: number;
};

// Asset contract: +Y up, +Z forward. All dimensions below are metres.
export const CAMERA_VIEWS: Record<string, CameraView> = {
  hero: {
    position: [4.275, 1.8675, 5.1],
    target: [0, 0.72, 0],
    fov: 34,
    minDistance: 2.7,
    maxDistance: 15,
  },
  front: {
    position: [0, 1.5, 8],
    target: [0, 0.7, 0],
    fov: 32,
    minDistance: 2.7,
    maxDistance: 15,
  },
  side: {
    position: [8.2, 1.55, 0],
    target: [0, 0.65, 0],
    fov: 34,
    minDistance: 2.7,
    maxDistance: 15,
  },
  "rear-quarter": {
    position: [-5.7, 2.1, -6.5],
    target: [0, 0.72, 0],
    fov: 34,
    minDistance: 2.7,
    maxDistance: 15,
  },
  rear: {
    position: [0, 1.55, -8],
    target: [0, 0.7, 0],
    fov: 32,
    minDistance: 2.7,
    maxDistance: 15,
  },
  wheel: {
    position: [2.25, 0.65, 2.5],
    target: [0.92, 0.4, 1.48],
    fov: 39,
    minDistance: 0.6,
    maxDistance: 7,
  },
  interior: {
    position: [0.35, 1.05, -0.16],
    target: [0.1, 0.92, 1.65],
    fov: 68,
    minDistance: 0.12,
    maxDistance: 3,
  },
  top: {
    position: [0.08, 10, 0.08],
    target: [0, 0, 0],
    fov: 34,
    minDistance: 2.7,
    maxDistance: 15,
  },
};

export function cameraView(
  id: string,
  overrides?: Partial<Record<string, CameraView>>,
): CameraView {
  return overrides?.[id] ?? CAMERA_VIEWS[id] ?? CAMERA_VIEWS.hero;
}

export function normalizeBounds({ min, max }: Bounds) {
  if (
    ![...min, ...max].every(Number.isFinite) ||
    max.some((n, i) => n < min[i])
  ) {
    throw new Error("This model has invalid geometry bounds.");
  }
  const horizontalSize = Math.max(max[0] - min[0], max[2] - min[2]);
  if (horizontalSize <= 0 || max[1] - min[1] <= 0)
    throw new Error("This model has no usable vehicle geometry.");
  const scale = 4.7 / horizontalSize;
  const position: VectorTuple = [
    (-(min[0] + max[0]) * scale) / 2,
    -min[1] * scale,
    (-(min[2] + max[2]) * scale) / 2,
  ];
  return { scale, position };
}

/** Exact, case-sensitive declarations only. No material-name guessing. */
export function materialRole(
  materialName: string,
  meshName: string,
  roles: MaterialRoles,
): MaterialRole | null {
  for (const role of ["headlights", "taillights", "paint"] as const) {
    if (
      roles[role].some(
        (name) =>
          name.length > 0 && (name === materialName || name === meshName),
      )
    )
      return role;
  }
  return null;
}

export function interpolationAlpha(delta: number, reducedMotion: boolean) {
  return reducedMotion
    ? 1
    : 1 - Math.exp(-7 * Math.min(Math.max(delta, 0), 0.1));
}

export function progressPercent(loaded: number, total: number) {
  return Number.isFinite(total) && total > 0
    ? Math.min(99, Math.max(0, Math.round((loaded / total) * 100)))
    : 0;
}

export function environmentAsset(
  environment: string,
  lowResolution: boolean,
): string | null {
  const name =
    environment === "forest"
      ? "tief_etz"
      : environment === "coast"
        ? "victoria_curve_01"
        : null;
  return name ? `/environments/${name}${lowResolution ? "_1k" : ""}.hdr` : null;
}

export function interiorLookTarget(
  origin: VectorTuple,
  yaw: number,
  pitch: number,
): VectorTuple {
  return [
    origin[0] + Math.sin(yaw) * Math.cos(pitch),
    origin[1] + Math.sin(pitch),
    origin[2] + Math.cos(yaw) * Math.cos(pitch),
  ];
}
